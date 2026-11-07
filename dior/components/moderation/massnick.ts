import { config } from '../../config.js';
// xoxo/components/moderation/massnick.ts
//
// CV2 payload builders for the $massnick command's target-type selection panel
// and result panel.

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  RoleSelectMenuBuilder,
  SeparatorBuilder,
  TextDisplayBuilder,
  MessageFlags,
} from 'discord.js';

export type MassNickTargetType = 'all' | 'humans' | 'bots' | 'role' | 'members';
export type MassNickMode = 'prepend' | 'prefix' | 'append' | 'suffix' | 'reset' | 'remove';

function wrap(container: ContainerBuilder): any {
  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

function modeLabel(mode: MassNickMode, word: string | null): string {
  switch (mode) {
    case 'prepend':
    case 'prefix':  return `prepend **\`${word}\`** to nicknames`;
    case 'append':
    case 'suffix':  return `append **\`${word}\`** to nicknames`;
    case 'remove':  return `remove **\`${word}\`** from nicknames`;
    case 'reset':   return 'reset all nicknames';
  }
}

/**
 * Resolve a human-readable label for the target type, including role/member display info.
 */
export function targetDisplayLabel(targetType: string): string {
  if (targetType === 'all')     return 'all members';
  if (targetType === 'humans')  return 'humans only';
  if (targetType === 'bots')    return 'bots only';
  if (targetType === 'members') return 'specific members';
  if (targetType.startsWith('role:')) return `role members`;
  return targetType;
}

// ─────────────────────────────────────────────────────────────────────────────
// Target selection panel
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Initial panel: 6 buttons across 2 action rows.
 * Row 1 — All Members | Humans Only | Bots Only
 * Row 2 — Specific Role | Members | Cancel
 * Pass `disabled: true` to render all buttons greyed-out (e.g. on timeout).
 */
export function buildMassNickTargetPanel(
  mode: MassNickMode,
  word: string | null,
  memberCount: number,
  token: string,
  disabled = false,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname — ${modeLabel(mode, word)}\n` +
        `-# Choose who this should apply to. A warning and confirmation appear before any changes.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `-# Server has approximately **${memberCount.toLocaleString()}** members.`,
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`massnick:all:${token}`)
          .setLabel('All Members')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`massnick:humans:${token}`)
          .setLabel('Humans Only')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`massnick:bots:${token}`)
          .setLabel('Bots Only')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(disabled),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`massnick:role:${token}`)
          .setLabel('Specific Role')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`massnick:members:${token}`)
          .setLabel('Members')
          .setStyle(ButtonStyle.Primary)
          .setDisabled(disabled),
        new ButtonBuilder()
          .setCustomId(`massnick:cancel:${token}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Danger)
          .setDisabled(disabled),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Specific Role — role select dropdown page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Second page shown when the user clicks "Specific Role".
 * Contains a RoleSelectMenu so Discord renders a role picker inline.
 * Pass `disabled: true` to grey-out the menu (e.g. on timeout).
 */
export function buildMassNickRoleSelectPage(
  mode: MassNickMode,
  word: string | null,
  token: string,
  disabled = false,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname — ${modeLabel(mode, word)}\n` +
        `-# Select the role whose members should be affected.`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addActionRowComponents(
      new ActionRowBuilder<RoleSelectMenuBuilder>().addComponents(
        new RoleSelectMenuBuilder()
          .setCustomId(`massnick:role_select:${token}`)
          .setPlaceholder('Choose a role…')
          .setMinValues(1)
          .setMaxValues(1)
          .setDisabled(disabled),
      ),
    );

  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Members — message prompt page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shown when the user clicks "Members". Asks them to type member
 * mentions / IDs / usernames in the next message.
 */
export function buildMassNickMembersPromptPage(
  mode: MassNickMode,
  word: string | null,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname — ${modeLabel(mode, word)}\n` +
        `Type the members you want to apply this to in your next message, separated by spaces. You can review and confirm before changes are made.\n` +
        `-# You can use mentions (\`@user\`), user IDs, or usernames. Up to 10 members. You have 60 seconds.`,
      ),
    );
  return wrap(container);
}

// ─────────────────────────────────────────────────────────────────────────────
// Progress, result, timeout, cancelled
// ─────────────────────────────────────────────────────────────────────────────

/** Shown while members are being processed. */
export function buildMassNickProgressPayload(
  mode: MassNickMode,
  word: string | null,
  targetLabel: string,
): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname in Progress\n` +
        `-# Applying **${mode}${word ? ` "${word}"` : ''}** to ${targetLabel}. This may take a moment on large servers…`,
      ),
    );
  return wrap(container);
}

/** Final result panel after mass-nick completes. */
export function buildMassNickResultPayload(
  mode: MassNickMode,
  word: string | null,
  targetLabel: string,
  changed: number,
  skipped: number,
  failed: number,
): any {
  const lines: string[] = [
    `**${changed}** nickname${changed !== 1 ? 's' : ''} updated.`,
  ];
  if (skipped > 0) lines.push(`**${skipped}** skipped (already correct or word not found).`);
  if (failed  > 0) lines.push(`**${failed}** failed (role too high or unmanageable).`);

  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## Mass Nickname Complete\n-# Target: ${targetLabel} · operation: ${mode}${word ? ` "${word}"` : ''}`,
      ),
    )
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(lines.join('\n')),
    );

  return wrap(container);
}

export function buildMassNickTimedOutPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Mass nickname panel timed out. No changes were made.'),
    ),
  );
}

export function buildMassNickCancelledPayload(): any {
  return wrap(
    new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16)).addTextDisplayComponents(
      new TextDisplayBuilder().setContent('Mass nickname cancelled. No changes were made.'),
    ),
  );
}
