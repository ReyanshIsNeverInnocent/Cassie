import type { CassieClient } from '../structures/CassieClient.js';
import type { ReminderDoc } from '../database/database.js';

export const MAX_REMINDERS_PER_USER = 25;
export const MAX_REMINDER_MS = 2 * 365 * 24 * 60 * 60 * 1_000;

export interface Reminder {
  id: string;
  userId: string;
  channelId: string;
  reason: string;
  remindAt: number;
  createdAt: number;
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

export function getScheduledReminderCount(): number {
  return timers.size;
}

function fromDoc(doc: ReminderDoc): Reminder {
  return { id: doc.id, userId: doc.user_id, channelId: doc.channel_id, reason: doc.reason, remindAt: doc.remind_at, createdAt: doc.created_at };
}

function toDoc(reminder: Reminder): ReminderDoc {
  return { id: reminder.id, user_id: reminder.userId, channel_id: reminder.channelId, reason: reminder.reason, remind_at: reminder.remindAt, created_at: reminder.createdAt };
}

export async function initializeReminders(client: CassieClient): Promise<void> {
  if (!client.db) return;
  await client.db.deleteExpiredReminders(Date.now()).catch(() => 0);
  const active = await client.db.listActiveReminders().catch((): ReminderDoc[] => []);
  for (const doc of active) scheduleReminder(client, fromDoc(doc));
}

export async function createReminder(
  client: CassieClient,
  userId: string,
  channelId: string,
  delayMs: number,
  reason: string,
): Promise<Reminder> {
  if (!client.db) throw new Error('Database is unavailable right now.');
  const userReminders = await client.db.listReminders(userId);
  if (userReminders.length >= MAX_REMINDERS_PER_USER) {
    throw new Error(`You can have at most ${MAX_REMINDERS_PER_USER} active reminders.`);
  }
  if (delayMs > MAX_REMINDER_MS) throw new Error('A reminder cannot be set for more than 2 years.');

  const reminder: Reminder = {
    id: `${userId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    channelId,
    reason,
    remindAt: Date.now() + delayMs,
    createdAt: Date.now(),
  };
  await client.db.createReminder(toDoc(reminder));
  scheduleReminder(client, reminder);
  return reminder;
}

export async function listReminders(client: CassieClient, userId: string): Promise<Reminder[]> {
  if (!client.db) return [];
  return (await client.db.listReminders(userId)).map(fromDoc);
}

export async function deleteReminder(client: CassieClient, userId: string, number: number): Promise<Reminder | null> {
  if (!client.db) return null;
  const userReminders = await listReminders(client, userId);
  const target = userReminders[number - 1];
  if (!target) return null;
  if (!(await client.db.deleteReminder(target.id))) return null;
  const timer = timers.get(target.id);
  if (timer) clearTimeout(timer);
  timers.delete(target.id);
  return target;
}

function scheduleReminder(client: CassieClient, reminder: Reminder): void {
  const existing = timers.get(reminder.id);
  if (existing) clearTimeout(existing);

  const remaining = reminder.remindAt - Date.now();
  if (remaining <= 0) {
    void deliverReminder(client, reminder);
    return;
  }

  const wait = Math.min(remaining, 2_147_000_000);
  timers.set(reminder.id, setTimeout(() => scheduleReminder(client, reminder), wait));
}

async function deliverReminder(client: CassieClient, reminder: Reminder): Promise<void> {
  timers.delete(reminder.id);

  const { buildReminderCompletePayload } = await import('../components/utility/reminder.js');
  const payload = buildReminderCompletePayload(reminder);
  const channel = client.channels.cache.get(reminder.channelId)
    ?? await client.channels.fetch(reminder.channelId).catch((): null => null);

  if (channel && typeof (channel as any).send === 'function') {
    const sent = await (channel as any).send(payload).then(() => true).catch(() => false);
    if (sent) {
      await client.db?.deleteReminder(reminder.id).catch((): null => null);
      return;
    }
  }

  const user = await client.users.fetch(reminder.userId).catch((): null => null);
  if (user) {
    const sent = await user.send(payload).then(() => true).catch(() => false);
    if (sent) await client.db?.deleteReminder(reminder.id).catch((): null => null);
  }
}

export function reminderRelativeTime(reminder: Reminder): string {
  return `<t:${Math.floor(reminder.remindAt / 1_000)}:F>`;
}
