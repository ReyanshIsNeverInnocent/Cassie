import { Pool, type PoolClient } from 'pg';
import { randomUUID } from 'node:crypto';

type DocumentValue = Record<string, any>;

export interface DocumentStoreOptions {
  connectionString: string;
  botId: string;
}

export interface UpdateResult {
  matchedCount: number;
  modifiedCount: number;
  upsertedCount: number;
}

export interface DeleteResult {
  deletedCount: number;
}

interface StoredDocument {
  document_id: string;
  data: DocumentValue;
}

function normalizeConnectionString(connectionString: string): string {
  try {
    const url = new URL(connectionString);
    const sslMode = url.searchParams.get('sslmode');
    if (sslMode && ['prefer', 'require', 'verify-ca'].includes(sslMode)) {
      url.searchParams.set('sslmode', 'verify-full');
      return url.toString();
    }
  } catch {
    // Let pg report malformed connection strings using its normal error.
  }
  return connectionString;
}

const DATE_KEY = /(?:^|_)(?:at|date|time)$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function revive(value: any, key = ''): any {
  if (typeof value === 'string' && (DATE_KEY.test(key) || key.endsWith('At')) && ISO_DATE.test(value)) {
    return new Date(value);
  }
  if (Array.isArray(value)) return value.map((item) => revive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, revive(child, childKey)]));
  }
  return value;
}

function plain(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(plain);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, plain(child)]));
  return value;
}

function equal(left: any, right: any): boolean {
  if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
  if (left instanceof Date && typeof right === 'string') return left.toISOString() === right;
  if (right instanceof Date && typeof left === 'string') return right.toISOString() === left;
  return JSON.stringify(plain(left)) === JSON.stringify(plain(right));
}

function matchesValue(value: any, expected: any): boolean {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    if ('$in' in expected) return expected.$in.some((item: any) => equal(value, item));
    if ('$ne' in expected) return !equal(value, expected.$ne);
    if ('$exists' in expected) return expected.$exists ? value !== undefined : value === undefined;
  }
  return equal(value, expected);
}

function matches(document: DocumentValue, filter: DocumentValue): boolean {
  return Object.entries(filter).every(([key, expected]) => {
    if (key === '$or') return expected.some((part: DocumentValue) => matches(document, part));
    if (key === '$and') return expected.every((part: DocumentValue) => matches(document, part));
    return matchesValue(document[key], expected);
  });
}

function equalityFields(filter: DocumentValue): DocumentValue {
  return Object.fromEntries(
    Object.entries(filter).filter(([key, value]) => !key.startsWith('$') && !(value && typeof value === 'object' && !Array.isArray(value))),
  );
}

function setPath(document: DocumentValue, key: string, value: any): void {
  document[key] = value;
}

function applyUpdate(document: DocumentValue, update: any, isInsert: boolean): DocumentValue {
  if (Array.isArray(update)) {
    for (const stage of update) applyUpdate(document, stage, isInsert);
    return document;
  }

  if (!Object.keys(update).some((key) => key.startsWith('$'))) {
    return { ...plain(update), _id: document._id ?? randomUUID() };
  }

  const setValues = { ...(update.$set ?? {}) };
  const responseExpression = setValues.responses;
  delete setValues.responses;
  for (const [key, values] of Object.entries(setValues)) setPath(document, key, values);
  if (isInsert) {
    for (const [key, value] of Object.entries(update.$setOnInsert ?? {})) {
      if (document[key] === undefined) setPath(document, key, value);
    }
  }
  for (const [key, amount] of Object.entries(update.$inc ?? {})) document[key] = (document[key] ?? 0) + Number(amount);
  for (const [key, value] of Object.entries(update.$unset ?? {})) {
    if (value !== undefined) delete document[key];
  }
  for (const [key, value] of Object.entries(update.$pull ?? {})) {
    if (Array.isArray(document[key])) document[key] = document[key].filter((item: any) => !equal(item, value));
  }
  for (const [key, value] of Object.entries(update.$addToSet ?? {})) {
    const values = value && typeof value === 'object' && '$each' in value
      ? (value as any).$each
      : [value];
    const current = Array.isArray(document[key]) ? document[key] : [];
    document[key] = [...current, ...values.filter((item: any) => !current.some((existing: any) => equal(existing, item)))];
  }

  // The only pipeline update currently used by the bot is the capped response append.
  if (responseExpression?.$cond?.length === 3) {
    const [, whenTrue, whenFalse] = responseExpression.$cond;
    const max = 5;
    if (Array.isArray(document.responses) && document.responses.length < max && whenTrue?.$concatArrays) {
      document.responses = [...document.responses, ...whenTrue.$concatArrays[1]];
    } else if (whenFalse !== '$responses') {
      document.responses = whenFalse;
    }
  }
  return document;
}

export class PostgresDocumentStore {
  readonly pool: Pool;
  private readonly botId: string;
  private ready: Promise<void> | null = null;

  constructor(options: DocumentStoreOptions) {
    this.botId = options.botId;
    this.pool = new Pool({
      connectionString: normalizeConnectionString(options.connectionString),
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
      query_timeout: 15_000,
    });
  }

  async connect(): Promise<void> {
    if (!this.ready) {
      this.ready = this.pool.query(`
        CREATE TABLE IF NOT EXISTS bot_documents (
          bot_id TEXT NOT NULL,
          collection_name TEXT NOT NULL,
          document_id TEXT NOT NULL,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          PRIMARY KEY (bot_id, collection_name, document_id)
        )
      `).then(async (): Promise<void> => {
        await this.pool.query(
          'CREATE INDEX IF NOT EXISTS bot_documents_data_gin_idx ON bot_documents USING GIN (data)',
        );
      });
    }
    await this.ready;
  }

  collection<T extends DocumentValue>(name: string): PostgresCollection<T> {
    return new PostgresCollection<T>(this, this.botId, name);
  }

  async close(): Promise<void> {
    await this.pool.end();
    this.ready = null;
  }

  async query<T extends any[] = any[]>(text: string, values?: any[]): Promise<{ rows: T }> {
    return this.pool.query(text, values) as any;
  }

  async withClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      return await callback(client);
    } finally {
      client.release();
    }
  }
}

export class PostgresCursor<T extends DocumentValue> {
  private sortSpec: DocumentValue | undefined;
  private skipCount = 0;
  private limitCount: number | undefined;

  constructor(private readonly collection: PostgresCollection<T>, private readonly filter: DocumentValue = {}) {}

  sort(spec: DocumentValue): this { this.sortSpec = spec; return this; }
  skip(count: number): this { this.skipCount = count; return this; }
  limit(count: number): this { this.limitCount = count; return this; }
  async toArray(): Promise<T[]> { return this.collection.read(this.filter, this.sortSpec, this.skipCount, this.limitCount); }
  async next(): Promise<T | null> {
    const docs = await this.collection.read(this.filter, this.sortSpec, this.skipCount, 1);
    return docs[0] ?? null;
  }
}

export class PostgresCollection<T extends DocumentValue> {
  constructor(private readonly store: PostgresDocumentStore, private readonly botId: string, private readonly name: string) {}

  find(filter: DocumentValue = {}): PostgresCursor<T> { return new PostgresCursor<T>(this, filter); }

  async read(filter: DocumentValue, sortSpec?: DocumentValue, skip = 0, limit?: number): Promise<T[]> {
    const pushdown = Object.fromEntries(
      Object.entries(filter).filter(([key, value]) =>
        !key.startsWith('$') && (
          value === null ||
          typeof value !== 'object' ||
          value instanceof Date ||
          Array.isArray(value)
        ),
      ),
    );
    const values: any[] = [this.botId, this.name];
    let where = 'bot_id = $1 AND collection_name = $2';
    if (Object.keys(pushdown).length > 0 && Object.keys(pushdown).length === Object.keys(filter).length) {
      values.push(JSON.stringify(plain(pushdown)));
      where += ` AND data @> $${values.length}::jsonb`;
    }
    const result = await this.store.query<StoredDocument[]>(
      `SELECT document_id, data FROM bot_documents WHERE ${where}`,
      values,
    );
    let docs = result.rows
      .map((row) => {
        const data = revive(row.data);
        return { ...data, _id: data._id ?? row.document_id };
      })
      .filter((doc) => matches(doc, filter));
    if (sortSpec) {
      const entries = Object.entries(sortSpec);
      docs.sort((left, right) => {
        for (const [key, direction] of entries) {
          const a = left[key] instanceof Date ? left[key].getTime() : left[key];
          const b = right[key] instanceof Date ? right[key].getTime() : right[key];
          if (a === b) continue;
          return (a > b ? 1 : -1) * Number(direction);
        }
        return 0;
      });
    }
    docs = docs.slice(skip, limit === undefined ? undefined : skip + limit);
    return docs as T[];
  }

  async findOne(filter: DocumentValue = {}, options?: { sort?: DocumentValue }): Promise<T | null> {
    const docs = await this.read(filter, options?.sort, 0, 1);
    return docs[0] ?? null;
  }

  async countDocuments(filter: DocumentValue = {}): Promise<number> {
    if (Object.keys(filter).length > 0) return (await this.read(filter)).length;
    const result = await this.store.query<{ count: string }[]>(
      'SELECT COUNT(*)::text AS count FROM bot_documents WHERE bot_id = $1 AND collection_name = $2',
      [this.botId, this.name],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async distinct(key: string): Promise<any[]> {
    const docs = await this.read({});
    return [...new Set(docs.map((doc) => doc[key]).filter((value) => value !== undefined))];
  }

  async insertOne(document: T): Promise<{ insertedId: string }> {
    const id = String((document as any)._id ?? randomUUID());
    const data = { ...document, _id: id };
    await this.store.query(
      'INSERT INTO bot_documents (bot_id, collection_name, document_id, data) VALUES ($1, $2, $3, $4::jsonb)',
      [this.botId, this.name, id, JSON.stringify(plain(data))],
    );
    return { insertedId: id };
  }

  async createIndex(..._args: any[]): Promise<void> { /* PostgreSQL uses the shared JSONB store index. */ }

  async updateOne(filter: DocumentValue, update: any, options: { upsert?: boolean } = {}): Promise<UpdateResult> {
    const current = await this.findOne(filter);
    if (!current && !options.upsert) return { matchedCount: 0, modifiedCount: 0, upsertedCount: 0 };
    const next = current ? applyUpdate({ ...current }, update, false) : applyUpdate({ ...equalityFields(filter) }, update, true);
    const id = String((next as any)._id ?? (current as any)?._id ?? randomUUID());
    await this.store.query(
      `INSERT INTO bot_documents (bot_id, collection_name, document_id, data)
       VALUES ($1, $2, $3, $4::jsonb)
       ON CONFLICT (bot_id, collection_name, document_id)
       DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()`,
      [this.botId, this.name, id, JSON.stringify(plain({ ...next, _id: id }))],
    );
    return { matchedCount: current ? 1 : 0, modifiedCount: 1, upsertedCount: current ? 0 : 1 };
  }

  async replaceOne(filter: DocumentValue, replacement: T, options: { upsert?: boolean } = {}): Promise<UpdateResult> {
    return this.updateOne(filter, replacement, options);
  }

  async findOneAndUpdate(filter: DocumentValue, update: any, options: { returnDocument?: 'before' | 'after' } = {}): Promise<T | null> {
    const before = await this.findOne(filter);
    const result = await this.updateOne(filter, update);
    if (!result.matchedCount) return null;
    return options.returnDocument === 'after' ? this.findOne(filter) : before;
  }

  async deleteOne(filter: DocumentValue): Promise<DeleteResult> {
    const doc = await this.findOne(filter);
    if (!doc) return { deletedCount: 0 };
    await this.store.query(
      'DELETE FROM bot_documents WHERE bot_id = $1 AND collection_name = $2 AND document_id = $3',
      [this.botId, this.name, String((doc as any)._id)],
    );
    return { deletedCount: 1 };
  }

  async deleteMany(filter: DocumentValue): Promise<DeleteResult> {
    const docs = await this.read(filter);
    if (!docs.length) return { deletedCount: 0 };
    await this.store.query(
      'DELETE FROM bot_documents WHERE bot_id = $1 AND collection_name = $2 AND document_id = ANY($3::text[])',
      [this.botId, this.name, docs.map((doc) => String((doc as any)._id))],
    );
    return { deletedCount: docs.length };
  }
}