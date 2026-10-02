// xoxo/events/discord/interactionCreate.ts
//
// Routes all incoming interactions:
//   • ChatInputCommand → slashExecute
//   • Button / StringSelectMenu with customId 'debug:*' → debug nav handler
//   • Button / StringSelectMenu with customId 'help:*'  → help nav handler

import {
  ActionRowBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { withDeveloperPermissionBypass } from '../../helpers/developerPermissionBypass.js';
import { AmbiguousUserError } from '../../helpers/userResolver.js';
import webhookLogger from '../../utils/webhookLogger.js';
import { sendError, sendWarning, reservedForDeveloper } from '../../components/statusMessages.js';
import { consumeCommandCooldown, getCommandCooldown } from '../../helpers/commandCooldown.js';
import {
  debugSessions,
  resetDebugTimeout,
  buildDebugHomePayload,
  buildDebugCategoryPayload,
  buildDebugAllStatsPayload,
} from '../../components/info/debug.js';
import { gatherDebugStats } from '../../helpers/debugStats.js';
import {
  helpSessions,
  resetHelpTimeout,
  buildHelpMenuPayload,
  buildAllCommandsPayload,
  buildCategoryPayload,
  buildDisabledHelpPayload,
} from '../../components/info/helpMenu.js';
import {
  handleViewDataSelect,
  handleViewDataPage,
} from '../../components/data/viewDataMenu.js';
import { handlePhHelpNav } from '../../components/utility/placeholderHelp.js';
import {
  handleDeleteDataSelect,
  handleDeleteDataPage,
  handleDeleteDataConfirm,
  handleDeleteDataCancel,
} from '../../components/data/deleteDataMenu.js';
import {
  handleSendDataSelect,
  handleSendDataPage,
} from '../../components/data/sendDataMenu.js';
import { handleUnTimeoutSelect } from '../../components/moderation/untimeout.js';
import { handleUnbanSelect } from '../../components/moderation/unban.js';
import {
  handleListSelect,
  handleListBack,
  handleListPage,
} from '../../components/utility/list.js';
import {
  handleRolePickerSelect,
  handleRolePickerPage,
  handleRolePickerApply,
  handleRolePickerCancel,
} from '../../components/moderation/roleSelect.js';
import {
  handleServerListSelect,
  handleServerListBack,
  handleServerListPage,
} from '../../components/developer/serverlist.js';
import { handleLogConfigInteraction }    from '../../components/logging/logMenu.js';
import { handleNsInteraction }           from '../../components/utility/namestyle.js';
import { handleCustomiseInteraction }    from '../../components/customisation/customise.js';
import { handleVanityRoleInteraction } from '../../components/utility/vanityrole.js';
import { handleAutoroleInteraction }   from '../../components/utility/autorole.js';
import { handleStarboardInteraction }  from '../../components/features/starboard.js';
import { handleReactionRoleInteraction } from '../../components/features/reactionroles.js';
import { handleRpsInteraction }       from '../../components/fun/rpsHandler.js';
import { handleImageInteraction }     from '../../components/fun/imageHandler.js';
import {
  buildQueuePayload,
  queueSessions,
  resetQueueTimeout,
} from '../../components/music/queueMenu.js';
import { jumpTo } from '../../helpers/sessionQueue.js';
import { clearSession } from '../../helpers/sessionQueue.js';
import { clearRejoin } from '../../helpers/twentyFourSeven.js';
import { buildPlayerStoppedPayload } from '../../components/music/nowPlaying.js';
import { clearPlayerState, updateNowPlayingMessage } from '../../helpers/nowPlayingManager.js';
import { handleVoiceMasterInteraction } from '../../components/features/voiceMaster.js';
import { handleHoneypotInteraction } from '../../components/features/honeypot.js';
import { handleGiveawayInteraction } from '../../components/features/giveaway.js';

export const name = 'interactionCreate';
export const once = false;

// ── customId prefix registry ────────────────────────────────────────────────
// Every top-level `prefix:action` customId namespace routed below (and in the
// button/select-menu switches further down) must be listed here exactly once.
// This is a guard against the class of bug where two unrelated panels reuse
// the same short prefix and silently misroute one another — add your new
// prefix to this list whenever you introduce one, and this assertion will
// throw at boot if it collides with an existing one instead of failing
// silently at runtime.
const REGISTERED_CUSTOM_ID_PREFIXES = [
  'logcfg', 'rps', 'image', 'ns', 'vr', 'vr-modal', 'ar',
  'debug', 'help', 'phhelp', 'viewdata', 'deldata', 'senddata',
  'serverlist', 'rolepick', 'list', 'untimeout', 'unban', 'queue', 'player',
  'customise',
  'sb', 'rr', 'voicemaster', 'hp', 'gway',
] as const;

(function assertNoCustomIdPrefixCollisions(): void {
  const seen = new Set<string>();
  for (const prefix of REGISTERED_CUSTOM_ID_PREFIXES) {
    if (seen.has(prefix)) {
      throw new Error(`[interactionCreate] Duplicate customId prefix registered: "${prefix}". Two unrelated panels cannot share a prefix — rename one.`);
    }
    seen.add(prefix);
  }
})();

export async function execute(interaction: any, client: CassieClient): Promise<void> {

  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('gway:')) {
    await handleGiveawayInteraction(interaction, client);
    return;
  }

  // ── VoiceMaster panel/buttons/modals ───────────────────────────────────────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('voicemaster:')) {
    try {
      await handleVoiceMasterInteraction(interaction, client);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[interactionCreate] VoiceMaster interaction failed: ${message}`);
      const payload = { content: 'I could not complete that VoiceMaster action.', flags: MessageFlags.Ephemeral };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(payload).catch((): null => null);
      } else {
        await interaction.reply(payload).catch((): null => null);
      }
    }
    return;
  }

  // Honeypot configuration panel (channel/action/message selectors).
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('hp:') && !interaction.isModalSubmit?.()) {
    await handleHoneypotInteraction(interaction, client);
    return;
  }

  // ── Logging config panel (button / string / channel / role / user selects) ──
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('logcfg:')) {
    await handleLogConfigInteraction(interaction, client);
    return;
  }

  // ── Rock Paper Scissors (buttons only) ──────────────────────────────────────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('rps:')) {
    await handleRpsInteraction(interaction, client);
    return;
  }

  // ── Image search navigation (buttons only) ────────────────────────────────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('image:')) {
    await handleImageInteraction(interaction, client);
    return;
  }

  // ── Customise panel (buttons; profile modal awaited inline) ─────────────────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('customise:') && !interaction.isModalSubmit?.()) {
    await handleCustomiseInteraction(interaction, client);
    return;
  }

  // ── Name style wizard (buttons + select menus; modals handled inline) ──────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('ns:') && !interaction.isModalSubmit?.()) {
    await handleNsInteraction(interaction, client);
    return;
  }

  // ── Vanity role panels (buttons, role/channel selects, modals) ─────────────
  if (typeof interaction.customId === 'string' &&
      (interaction.customId.startsWith('vr:') || interaction.customId.startsWith('vr-modal:'))) {
    try {
      await handleVanityRoleInteraction(interaction, client);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[interactionCreate] Error in vanity role panel: ${msg}`);
      const errPayload = { content: 'Something went wrong while handling this panel.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errPayload).catch((): null => null);
      } else {
        await interaction.reply(errPayload).catch((): null => null);
      }
    }
    return;
  }

  // ── Autorole panel (buttons + role selects) ─────────────────────────────────
  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('ar:')) {
    try {
      await handleAutoroleInteraction(interaction, client);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[interactionCreate] Error in autorole panel: ${msg}`);
      const errPayload = { content: 'Something went wrong while handling this panel.', flags: 64 };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errPayload).catch((): null => null);
      } else {
        await interaction.reply(errPayload).catch((): null => null);
      }
    }
    return;
  }

  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('sb:')) {
    await handleStarboardInteraction(interaction, client);
    return;
  }

  if (typeof interaction.customId === 'string' && interaction.customId.startsWith('rr:')) {
    await handleReactionRoleInteraction(interaction, client);
    return;
  }


  // ── Slash commands ─────────────────────────────────────────────────────────
  if (interaction.isChatInputCommand()) {
    const command = client.slashCommands.get(interaction.commandName.toLowerCase());
    if (!command) return;

    const developers: [string, string][] = client.config.developers;
    if (
      (command.options?.owner === true || command.options?.isDeveloper === true) &&
      !developers.some(([, id]: [string, string]) => id === interaction.user.id)
    ) {
      await reservedForDeveloper({ interaction });
      return;
    }

    if (client.db) {
      const disabled = await client.db.getDisabledCommand(interaction.commandName).catch((): null => null);
      if (disabled) {
        await sendWarning({ interaction }, `${interaction.commandName} has been disabled by the developer. Reason: ${disabled.reason}`).catch((): null => null);
        return;
      }
    }

    const subcommand = interaction.options?.getSubcommand?.(false)?.toLowerCase();
    const remainingCooldown = consumeCommandCooldown(client, command, interaction.user.id, subcommand);
    if (remainingCooldown > 0) {
      const configuredCooldown = getCommandCooldown(command, subcommand);
      await sendWarning(
        { interaction },
        `Please wait **${remainingCooldown}s** before using this command again. Cooldown: **${configuredCooldown}s**.`,
      ).catch((): null => null);
      return;
    }

    // Build a readable string of slash options for the webhook log
    const slashArgs: string[] = [];
    if (interaction.options && interaction.options.data) {
      for (const opt of interaction.options.data as any[]) {
        const val = opt.value ?? '';
        slashArgs.push(`${opt.name}: ${val}`);
      }
    }

    webhookLogger.logCommand(interaction.commandName, interaction.user, interaction.guild, slashArgs, {
      prefix: '/',
      type:   'Slash',
    }, null, interaction.channelId);

    try {
      await command.slashExecute(
        withDeveloperPermissionBypass(
          interaction,
          developers.some(([, id]: [string, string]) => id === interaction.user.id),
        ),
        client,
      );
      client.db?.incrementGlobalCommandsExecuted?.().catch((): null => null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!(err instanceof AmbiguousUserError)) {
        console.error(`[interactionCreate] Error in "${interaction.commandName}": ${msg}`);
      }
      const errPayload = {
        content: err instanceof AmbiguousUserError
          ? err.message
          : 'Something went wrong while running this command.',
        flags: MessageFlags.Ephemeral,
      };
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp(errPayload).catch((): null => null);
      } else {
        await interaction.reply(errPayload).catch((): null => null);
      }
    }
    return;
  }

  // ── Button navigation ─────────────────────────────────────────────────────
  if (interaction.isButton()) {
    const [prefix, action] = (interaction.customId as string).split(':');
    if (prefix === 'debug') {
      await handleDebugNav(interaction, action, client);
      return;
    }
    if (prefix === 'help') {
      await handleHelpNav(interaction, action, client);
      return;
    }
    if (prefix === 'phhelp') {
      if (action === 'prev') await handlePhHelpNav(interaction, -1);
      else if (action === 'next') await handlePhHelpNav(interaction, 1);
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'viewdata') {
      if (action === 'prev') {
        await handleViewDataPage(interaction, -1, client);
      } else if (action === 'next') {
        await handleViewDataPage(interaction, 1, client);
      }
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'deldata') {
      if (action === 'prev') {
        await handleDeleteDataPage(interaction, -1, client);
      } else if (action === 'next') {
        await handleDeleteDataPage(interaction, 1, client);
      } else if (action === 'confirm') {
        await handleDeleteDataConfirm(interaction, client);
      } else if (action === 'cancel') {
        await handleDeleteDataCancel(interaction, client);
      }
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'senddata') {
      if (action === 'prev') {
        await handleSendDataPage(interaction, -1, client);
      } else if (action === 'next') {
        await handleSendDataPage(interaction, 1, client);
      }
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'serverlist') {
      if (action === 'back') {
        await handleServerListBack(interaction, client);
      } else if (action === 'prev') {
        await handleServerListPage(interaction, client, -1);
      } else if (action === 'next') {
        await handleServerListPage(interaction, client, 1);
      }
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'rolepick') {
      if (action === 'prev') {
        await handleRolePickerPage(interaction, 'prev', client);
      } else if (action === 'next') {
        await handleRolePickerPage(interaction, 'next', client);
      } else if (action === 'apply') {
        await handleRolePickerApply(interaction, client);
      } else if (action === 'cancel') {
        await handleRolePickerCancel(interaction, client);
      }
      return;
    }
    if (prefix === 'list') {
      if (action === 'prev') {
        await handleListPage(interaction, -1);
      } else if (action === 'next') {
        await handleListPage(interaction, 1);
      } else if (action === 'back') {
        await handleListBack(interaction);
      }
      // 'noop' (page counter button) — do nothing
      return;
    }
    if (prefix === 'queue') {
      await handleQueueButton(interaction, action, client);
      return;
    }
    if (prefix === 'player') {
      await handlePlayerButton(interaction, action, client);
      return;
    }
    if (prefix === 'gway') {
      await handleGiveawayInteraction(interaction, client);
      return;
    }
    return;
  }

  // ── Dropdown navigation ────────────────────────────────────────────────────
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'debug:nav') {
      const category = interaction.values[0] as string;
      await handleDebugNav(interaction, category, client);
      return;
    }
    if (interaction.customId === 'help:nav') {
      const category = interaction.values[0] as string;
      await handleHelpNav(interaction, category, client);
      return;
    }
    if (interaction.customId === 'viewdata:select') {
      await handleViewDataSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'deldata:select') {
      await handleDeleteDataSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'senddata:select') {
      await handleSendDataSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'untimeout:select') {
      await handleUnTimeoutSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'unban:select') {
      await handleUnbanSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'serverlist:select') {
      await handleServerListSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'rolepick:select') {
      await handleRolePickerSelect(interaction, client);
      return;
    }
    if (interaction.customId === 'list:select') {
      await handleListSelect(interaction);
      return;
    }
    if (interaction.customId === 'queue:jump') {
      await handleQueueJump(interaction, client);
      return;
    }
  }

  // ── Modal submissions ─────────────────────────────────────────────────────
  if (interaction.isModalSubmit?.()) {
    // queue:goto-modal:<messageId> — jump to a specific page in the queue panel
    if ((interaction.customId as string).startsWith('queue:goto-modal:')) {
      await handleQueueGotoModal(interaction, client);
      return;
    }
  }
}

// ── Queue button handler ───────────────────────────────────────────────────

async function handleQueueButton(interaction: any, action: string, client: CassieClient): Promise<void> {
  const messageId = interaction.message?.id;
  const session = messageId ? queueSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.deferUpdate().catch((): null => null);
    return;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'Only the user who opened this queue can navigate it.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  // 'goto' opens a modal so the user can type any page number directly.
  if (action === 'goto') {
    const modal = new ModalBuilder()
      .setCustomId(`queue:goto-modal:${messageId}`)
      .setTitle('Jump to page')
      .addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(
          new TextInputBuilder()
            .setCustomId('page')
            .setLabel('Page number')
            .setStyle(TextInputStyle.Short)
            .setRequired(true)
            .setMinLength(1)
            .setMaxLength(5)
            .setPlaceholder('e.g. 3'),
        ),
      );
    await interaction.showModal(modal).catch((): null => null);
    return;
  }

  await interaction.deferUpdate();
  if (action === 'prev') session.page = Math.max(1, session.page - 1);
  else if (action === 'next') session.page = session.page + 1;
  // 'refresh' just re-renders the current page

  resetQueueTimeout(messageId);
  const player = (client as any).kazagumo.players.get(session.guildId);
  const payload = buildQueuePayload(player, session, false);
  await interaction.editReply(payload as any).catch((): null => null);
}

// ── Queue jump select-menu handler ─────────────────────────────────────────

async function handleQueueJump(interaction: any, client: CassieClient): Promise<void> {
  const messageId = interaction.message?.id;
  const session = messageId ? queueSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.deferUpdate().catch((): null => null);
    return;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'Only the user who opened this queue can jump tracks.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const player = (client as any).kazagumo.players.get(session.guildId);
  if (!player) {
    await interaction.reply({
      content: 'There is no active player in this server.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const memberVoiceId = (interaction.member as any)?.voice?.channelId;
  if (!memberVoiceId || memberVoiceId !== player.voiceId) {
    await interaction.reply({
      content: 'You must be in the same voice channel as the bot to jump tracks.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  await interaction.deferUpdate();
  const target = parseInt(interaction.values[0] as string, 10);
  if (!isNaN(target)) jumpTo(player, target);

  resetQueueTimeout(messageId);
  const payload = buildQueuePayload(player, session, false);
  await interaction.editReply(payload as any).catch((): null => null);
}

// ── Queue goto-modal submit handler ───────────────────────────────────────

async function handleQueueGotoModal(interaction: any, client: CassieClient): Promise<void> {
  const messageId = (interaction.customId as string).slice('queue:goto-modal:'.length);
  const session = queueSessions.get(messageId);

  if (!session) {
    await interaction.reply({
      content: 'This queue panel is no longer active.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }
  if (interaction.user.id !== session.userId) {
    await interaction.reply({
      content: 'Only the user who opened this queue can navigate it.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  const raw = interaction.fields.getTextInputValue('page').trim();
  const page = parseInt(raw, 10);
  if (!Number.isFinite(page) || page < 1) {
    await interaction.reply({
      content: `\`${raw}\` is not a valid page number.`,
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  session.page = page; // buildQueuePayload clamps to [1, totalPages]
  resetQueueTimeout(messageId);

  const player = (client as any).kazagumo.players.get(session.guildId);
  const payload = buildQueuePayload(player, session, false);

  // ModalSubmit doesn't reference the original message — fetch and edit it.
  try {
    const channel = await client.channels.fetch(session.channelId);
    const msg = await (channel as any).messages.fetch(messageId);
    await msg.edit(payload);
    await interaction.deferUpdate().catch((): null => null);
  } catch {
    await interaction.reply({
      content: 'Failed to update the queue panel.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
  }
}

// ── Now-playing player control buttons ──────────────────────────────────────

const LOOP_CYCLE: Record<string, string> = { none: 'track', track: 'queue', queue: 'none' };

async function handlePlayerButton(interaction: any, action: string, client: CassieClient): Promise<void> {
  const guildId = interaction.guildId as string;
  const player  = (client as any).kazagumo?.players?.get(guildId);

  if (!player?.queue?.current) {
    await interaction.reply({
      content: 'There is nothing currently playing.',
      flags: MessageFlags.Ephemeral,
    }).catch((): null => null);
    return;
  }

  await interaction.deferUpdate().catch((): null => null);

  try {
    switch (action) {
      case 'previous': {
        // getPrevious(true) also removes it from queue.previous
        const prevTrack = player.getPrevious ? player.getPrevious(true) : player.queue.previous?.shift();
        if (prevTrack) {
          player.queue.unshift(prevTrack);
          player.skip(); // playerStart re-renders the now-playing message
        } else {
          await player.seek(0).catch((): null => null);
          await updateNowPlayingMessage(client as any, player).catch((): null => null);
        }
        return;
      }
      case 'skip': {
        if (player.queue.length > 0) player.skip(); // playerStart re-renders the now-playing message
        return;
      }
      case 'pause': {
        player.pause(!player.paused);
        break;
      }
      case 'stop': {
        const stoppedTitle = player.queue.current?.title;
        clearPlayerState(guildId);
        clearSession(player);
        clearRejoin(guildId);
        await player.destroy();
        await interaction.editReply(buildPlayerStoppedPayload(stoppedTitle)).catch((): null => null);
        return;
      }
      case 'volDown': {
        const next = Math.max(0, (player.volume ?? 100) - 10);
        await player.setVolume(next);
        break;
      }
      case 'volUp': {
        const next = Math.min(100, (player.volume ?? 100) + 10);
        await player.setVolume(next);
        break;
      }
      case 'loop': {
        player.setLoop(LOOP_CYCLE[player.loop ?? 'none'] ?? 'track');
        break;
      }
      case 'autoplay': {
        const cur = player.data?.get('isAutoplay') ?? false;
        player.data?.set('isAutoplay', !cur);
        break;
      }
      default:
        return;
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[interactionCreate] Error in player control "${action}": ${msg}`);
    return;
  }

  await updateNowPlayingMessage(client as any, player).catch((): null => null);
}

// ── Debug nav handler ──────────────────────────────────────────────────────

async function handleDebugNav(interaction: any, action: string, client: CassieClient): Promise<void> {
  const messageId = interaction.message?.id;
  const session   = messageId ? debugSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.reply({ content: 'This debug session has expired.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: 'Only the person who ran this command can navigate it.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  const stats  = await gatherDebugStats(client, session.stats.latency.apiMs);

  let payload: any;
  if (action === 'home') {
    payload = buildDebugHomePayload(stats, session.authorUsername, session.prefix, false, client);
    session.page = 'home';
  } else if (action === 'allstats') {
    payload = buildDebugAllStatsPayload(stats, session.authorUsername, session.prefix, false, client);
    session.page = 'allstats';
  } else {
    payload = buildDebugCategoryPayload(stats, action, session.authorUsername, session.prefix, false, client);
    session.page = action;
  }

  session.stats = stats;

  await interaction.update(payload).catch((): null => null);
  resetDebugTimeout(messageId, interaction);
}

// ── Help nav handler ───────────────────────────────────────────────────────

async function handleHelpNav(interaction: any, action: string, client: CassieClient): Promise<void> {
  const messageId = interaction.message?.id;
  const session   = messageId ? helpSessions.get(messageId) : undefined;

  if (!session) {
    await interaction.update(buildDisabledHelpPayload(interaction.message))
      .catch((err: unknown) => {
        console.error(`[help] Failed to disable expired help components: ${err instanceof Error ? err.message : String(err)}`);
      });
    return;
  }

  if (interaction.user.id !== session.userId) {
    await interaction.reply({ content: 'Only the person who ran this command can navigate it.', flags: MessageFlags.Ephemeral })
      .catch((): null => null);
    return;
  }

  let payload: any;
  if (action === 'home') {
    payload = await buildHelpMenuPayload(client, session.userId, session.guildId, false);
    session.page = 'home';
  } else if (action === 'allcommands') {
    payload = await buildAllCommandsPayload(client, session.userId, session.guildId, false);
    session.page = 'allcommands';
  } else {
    payload = await buildCategoryPayload(client, session.userId, action, session.guildId, false);
    session.page = action;
  }

  await interaction.update(payload).catch((err: unknown) => {
    console.error(`[help] Failed to update "${action}" page: ${err instanceof Error ? err.message : String(err)}`);
  });
  resetHelpTimeout(messageId);
}
