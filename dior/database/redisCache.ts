import { createClient } from 'redis';

export interface RedisCacheRead<T> {
  /** False when Redis is unconfigured or unavailable; callers should use local/DB fallback. */
  available: boolean;
  hit: boolean;
  value?: T;
}

/** Optional, best-effort shared cache. PostgreSQL remains the source of truth. */
export class RedisCache {
  private readonly client: ReturnType<typeof createClient> | null;
  private readonly prefix: string;
  private connectPromise: Promise<void> | null = null;
  private lastWarningAt = 0;

  constructor(url: string | undefined, namespace: string) {
    this.prefix = `cassie:${encodeURIComponent(namespace || 'default')}:`;
    this.client = url
      ? createClient({
          url,
          socket: {
            connectTimeout: 3_000,
            reconnectStrategy: (retries) => Math.min(250 * 2 ** Math.min(retries, 7), 30_000),
          },
        })
      : null;

    this.client?.on('error', (error) => this.warn(error));
  }

  async connect(): Promise<boolean> {
    if (!this.client) {
      console.log('[REDIS] REDIS_URL is not set; shared cache is disabled.');
      return false;
    }
    if (this.client.isReady) return true;

    if (!this.connectPromise && !this.client.isOpen) {
      this.connectPromise = this.client.connect()
        .then(() => {
          console.log('[REDIS] Shared cache connected.');
        })
        .catch((error) => {
          this.warn(error);
        })
        .finally(() => {
          this.connectPromise = null;
        });
    }

    const pending = this.connectPromise;
    if (!pending) return this.client.isReady;
    return new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => resolve(this.client?.isReady ?? false), 3_500);
      pending.then(() => {
        clearTimeout(timeout);
        resolve(this.client?.isReady ?? false);
      });
    });
  }

  async get<T>(key: string): Promise<RedisCacheRead<T>> {
    if (!this.client?.isReady) return { available: false, hit: false };
    try {
      const raw = await this.client.get(this.key(key));
      if (raw === null) return { available: true, hit: false };
      return { available: true, hit: true, value: reviveDates(JSON.parse(raw.toString())) as T };
    } catch (error) {
      this.warn(error);
      return { available: false, hit: false };
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    if (!this.client?.isReady) return false;
    try {
      await this.client.set(this.key(key), JSON.stringify(value), { EX: ttlSeconds });
      return true;
    } catch (error) {
      this.warn(error);
      return false;
    }
  }

  async close(): Promise<void> {
    if (!this.client?.isOpen) return;
    try {
      this.client.destroy();
    } catch (error) {
      this.warn(error);
    }
  }

  private key(key: string): string {
    return `${this.prefix}${key}`;
  }

  private warn(error: unknown): void {
    const now = Date.now();
    if (now - this.lastWarningAt < 30_000) return;
    this.lastWarningAt = now;
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[REDIS] Shared cache unavailable; falling back to local cache/PostgreSQL: ${message}`);
  }
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function reviveDates(value: any, key = ''): any {
  if (typeof value === 'string' && (/(?:^|_)(?:at|date|time)$/i.test(key) || key.endsWith('At')) && ISO_DATE.test(value)) {
    return new Date(value);
  }
  if (Array.isArray(value)) return value.map((item) => reviveDates(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, reviveDates(child, childKey)]));
  }
  return value;
}

let sharedRedisCache: RedisCache | null = null;

/** Shared per-process Redis connection used by database caches and stats publishing. */
export function getRedisCache(): RedisCache {
  if (!sharedRedisCache) {
    sharedRedisCache = new RedisCache(process.env['REDIS_URL'], process.env['BOT_IDENTIFIER'] || '');
  }
  return sharedRedisCache;
}