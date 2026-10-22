// xoxo/commands/fun/ship.ts
//
// Ship two users together — generates a love percentage and a canvas image.
//
// Usage:
//   $ship                           — author × random non-bot member
//   $ship random                    — same as above (explicit)
//   $ship <user>                    — author × user
//   $ship <user> random             — user × random non-bot member (excluding user)
//
// Developer-only override (last arg is a number 0–100):
//   $ship 100                       — forced 100 %, random member
//   $ship <user> 95                 — forced 95 %, author × user
//   $ship <user1> <user2> 43        — forced 43 %, user1 × user2
//
// Special cases:
//   • Self-ship always gives a high percentage (95–100 %).
//   • Random mode never picks a bot, and never repeats an already-picked user.
//   • The percentage is deterministic (same pair = same result every time).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError } from '../../components/statusMessages.js';
import { buildShipPayload } from '../../canvas/ShipCanvas.js';
import { resolveUser } from '../../helpers/userResolver.js';

export const options = {
  name:        'ship',
  aliases:     [] as string[],
  description: 'Ship two users and see their love compatibility.',
  usage:       'ship\n' +
               'ship random\n' +
               'ship <@user|ID|username>\n' +
               'ship <@user|ID|username> random\n' +
               'ship <@user1|ID|username> <@user2|ID|username>',
  category:    'fun',
  owner:       false,
  cooldown:    3,
};

// ── Love percentage ───────────────────────────────────────────────────────────
// Deterministic hash of sorted, normalised display names — same pair always
// gives the same result regardless of argument order.

/**
 * Strip characters that could interfere with consistent hashing:
 *  • NFD-decompose so accented letters become base + combining mark
 *  • Drop combining diacritics (é → e, ñ → n, etc.)
 *  • Drop anything that isn't a Unicode letter, digit, or space
 *  • Lowercase + trim
 * Falls back to the raw lowercased name if normalisation produces an empty string.
 */
function normalizeDisplayName(raw: string): string {
  const cleaned = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')        // strip combining diacritics
    .replace(/[^\p{L}\p{N} ]/gu, '')        // keep letters, digits, spaces (all scripts)
    .trim()
    .toLowerCase();
  return cleaned || raw.trim().toLowerCase();
}

/**
 * DJB2-XOR hash — same algorithm as the classic djb2 but with XOR mixing.
 * Steps:
 *   1. Normalise both display names (see above).
 *   2. Sort them lexicographically so order doesn't matter.
 *   3. Concatenate: "<nameA><nameB>".
 *   4. Seed h = 5381.
 *   5. For each character: h = ((h * 33) XOR charCode) mod 2^32  (unsigned).
 *   6. percentage = h mod 101   → 0–100.
 */
function getLovePercentage(name1: string, name2: string): number {
  const [a, b] = [normalizeDisplayName(name1), normalizeDisplayName(name2)].sort();
  const str = a + b;
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  }
  return h % 101; // 0–100
}

function isRandomKeyword(arg: string): boolean {
  return arg.trim().toLowerCase() === 'random';
}

async function pickRandomMember(guild: any, excludeIds: string[]): Promise<any | null> {
  const members = await guild.members.fetch({ limit: 1000 }).catch((): null => null);
  if (!members) return null;

  const eligible: any[] = [...members.values()].filter(
    (m: any) => !m.user.bot && !excludeIds.includes(m.user.id),
  );

  if (eligible.length === 0) return null;
  return eligible[Math.floor(Math.random() * eligible.length)].user;
}

// ── Prefix execute ────────────────────────────────────────────────────────────

export async function prefixExecute(
  message: any,
  args:    string[],
  client:  CassieClient,
): Promise<any> {
  const ctx = { message };

  if (!message.guild) return sendError(ctx, 'This command can only be used in a server.');

  // ── Developer override: strip a trailing number (0–100) ──────────────────
  const isDev = client.config.developers.some(([, id]: [string, string]) => id === message.author.id);
  let forcedPct: number | null = null;

  let workArgs = [...args];
  if (isDev && workArgs.length > 0) {
    const last = workArgs[workArgs.length - 1];
    if (/^\d{1,3}$/.test(last)) {
      const n = parseInt(last, 10);
      if (n >= 0 && n <= 100) {
        forcedPct = n;
        workArgs = workArgs.slice(0, -1);
      }
    }
  }

  // ── Resolve users ─────────────────────────────────────────────────────────
  let user1: any = message.author;
  let user2: any;

  if (workArgs.length === 0 || (workArgs.length === 1 && isRandomKeyword(workArgs[0]))) {
    // Random mode — author × random non-bot member.
    user2 = await pickRandomMember(message.guild, [message.author.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to ship with.');

  } else if (workArgs.length === 1) {
    // Author × target
    const resolved = await resolveUser(client, message.guild, workArgs[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${workArgs[0]}\`.`);
    user2 = resolved;

  } else if (isRandomKeyword(workArgs[0]) && isRandomKeyword(workArgs[1])) {
    // Both random — two distinct random non-bot members.
    const r1 = await pickRandomMember(message.guild, []);
    if (!r1) return sendError(ctx, 'There are no non-bot members to ship.');
    const r2 = await pickRandomMember(message.guild, [r1.id]);
    if (!r2) return sendError(ctx, 'There are not enough non-bot members to ship.');
    user1 = r1;
    user2 = r2;

  } else if (isRandomKeyword(workArgs[1])) {
    // <user> random — user × random non-bot member (excluding user).
    const resolved = await resolveUser(client, message.guild, workArgs[0]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${workArgs[0]}\`.`);
    user1 = resolved;
    user2 = await pickRandomMember(message.guild, [user1.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to ship with.');

  } else if (isRandomKeyword(workArgs[0])) {
    // random <user> — same as <user> random.
    const resolved = await resolveUser(client, message.guild, workArgs[1]);
    if (!resolved) return sendError(ctx, `Could not find a user matching \`${workArgs[1]}\`.`);
    user1 = resolved;
    user2 = await pickRandomMember(message.guild, [user1.id]);
    if (!user2) return sendError(ctx, 'There are no other non-bot members to ship with.');

  } else {
    // user1 × user2
    const [r1, r2] = await Promise.all([
      resolveUser(client, message.guild, workArgs[0]),
      resolveUser(client, message.guild, workArgs[1]),
    ]);
    if (!r1) return sendError(ctx, `Could not find a user matching \`${workArgs[0]}\`.`);
    if (!r2) return sendError(ctx, `Could not find a user matching \`${workArgs[1]}\`.`);
    user1 = r1;
    user2 = r2;
  }

  // ── Percentage ────────────────────────────────────────────────────────────
  const isSelf = user1.id === user2.id;

  let pct: number;
  if (forcedPct !== null) {
    pct = forcedPct;
  } else if (isSelf) {
    pct = 95 + (parseInt(user1.id.slice(-1), 10) % 6);
  } else {
    pct = getLovePercentage(
      user1.displayName ?? user1.globalName ?? user1.username,
      user2.displayName ?? user2.globalName ?? user2.username,
    );
  }

  const payload = await buildShipPayload({
    user1,
    user2,
    pct,
    isSelf,
    invokerUsername: message.author.username,
  });

  return message.channel.send(payload);
}

export async function slashExecute(interaction: any, client: CassieClient): Promise<any> {
  await interaction.deferReply();

  const optUser1 = interaction.options.getUser('user')  ?? null;
  const optUser2 = interaction.options.getUser('user2') ?? null;

  let user1: any = interaction.user;
  let user2: any;

  if (!optUser1 && !optUser2) {
    // No args — author × random non-bot member (requires guild)
    if (!interaction.guild)
      return sendError({ interaction }, 'Provide a user to ship with when using this outside a server the bot is in.');
    user2 = await pickRandomMember(interaction.guild, [user1.id]);
    if (!user2) return sendError({ interaction }, 'There are no other non-bot members to ship with.');
  } else if (optUser1 && !optUser2) {
    // One arg — author × user1
    user2 = optUser1;
  } else if (optUser1 && optUser2) {
    // Both given — user1 × user2
    user1 = optUser1;
    user2 = optUser2;
  } else {
    // Only user2 given (edge) — author × user2
    user2 = optUser2;
  }

  const isDev  = client.config.developers.some(([, id]: [string, string]) => id === interaction.user.id);
  const isSelf = user1.id === user2.id;
  const pct    = isSelf
    ? 95 + (parseInt(user1.id.slice(-1), 10) % 6)
    : getLovePercentage(
        user1.displayName ?? user1.globalName ?? user1.username,
        user2.displayName ?? user2.globalName ?? user2.username,
      );

  const payload = await buildShipPayload({
    user1, user2, pct, isSelf,
    invokerUsername: interaction.user.username,
  });
  return interaction.editReply(payload);
}
