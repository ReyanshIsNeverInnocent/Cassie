// xoxo/events/discord/voiceStateUpdate.ts
//
// Handles voice state changes for ALL members:
//   - Bot disconnect: destroy player first, then schedule 24/7 rejoin (this
//     order is critical — playerDestroy fires while no rejoin is pending, so
//     its clearRejoin() call is a no-op, and the rejoin survives).
//   - All members: join/leave/move/mute/deafen logging.

import type { CassieClient } from '../../structures/CassieClient.js';
import { dispatchLog } from '../../helpers/logDispatcher.js';
import {
  complete247VoiceTransition,
  is247VoiceTransitioning,
  removeIdleVoiceConnection,
  scheduleRejoin,
  clearRejoin,
} from '../../helpers/twentyFourSeven.js';
import {
  buildVoiceJoinPayload,
  buildVoiceLeavePayload,
  buildVoiceMovePayload,
  buildVoiceStateFlagPayload,
} from '../../components/logging/logMessages.js';
import { handleVoiceMasterVoiceState } from '../../helpers/voiceMaster.js';

export const name = 'voiceStateUpdate';
export const once = false;

export async function execute(oldState: any, newState: any, client: CassieClient): Promise<void> {
  const guild = newState.guild ?? oldState.guild;
  if (!guild) return;
  const member = newState.member ?? oldState.member;
  if (!member) return;

  await handleVoiceMasterVoiceState(oldState, newState, client).catch((error: unknown) => {
    console.error(
      `[VoiceMaster] Voice-state handler failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  });

  // Always keep the bot server-deafened while it's connected to voice.
  if (member.id === client.user?.id && newState.channelId && !newState.serverDeaf) {
    await newState.setDeaf(true).catch((): null => null);
  }

  // ── 24/7 bot reconnect logic ─────────────────────────────────────────────
  // Fires when the bot itself is disconnected OR moved to a different VC.
  if (member.id === client.user?.id && is247VoiceTransitioning(guild.id)) {
    if (newState.channelId) complete247VoiceTransition(guild.id, newState.channelId);
  } else if (member.id === client.user?.id && oldState.channelId && oldState.channelId !== newState.channelId) {
    const is247 = await (client as any).db?.get24Seven?.(guild.id).catch((): null => null);

    if (!newState.channelId) {
      // Full disconnect (kicked, channel deleted, etc).
      // We destroy the player FIRST so that playerDestroy fires (and its
      // clearRejoin() runs) BEFORE we schedule the rejoin. This avoids the
      // race where clearRejoin() would cancel the rejoin we're about to
      // schedule.
      const player = client.kazagumo?.players?.get(guild.id);
      if (player) await player.destroy().catch((): null => null);
      removeIdleVoiceConnection(guild.id);

      if (is247?.enabled) {
        scheduleRejoin(client, guild.id, is247.channelId, 2000);
      }
    } else if (is247?.enabled) {
      // Moved to a different channel (e.g. dragged by a moderator) without
      // ever fully disconnecting — the disconnect branch above never fires
      // for this, so without this check the bot would just stay put forever.
      if (newState.channelId === is247.channelId) {
        // Moved right back into the 24/7 channel — nothing pending to cancel.
        clearRejoin(guild.id);
      } else {
        const player = client.kazagumo?.players?.get(guild.id);
        const isIdle = !player || (!player.playing && !player.paused);
        if (isIdle) {
          // Nothing playing to interrupt — pull it back promptly.
          scheduleRejoin(client, guild.id, is247.channelId, 3000);
        }
        // Else: actively playing in the new channel — let queueEnd's own
        // 24/7 check bring it back once that track/queue finishes, instead
        // of yanking the bot mid-song.
      }
    }
    // Fall through so the join/leave/move is still logged below.
  }

  const oldChannel = oldState.channel;
  const newChannel = newState.channel;

  // ── Join / Leave / Move ──────────────────────────────────────────────────
  if (!oldChannel && newChannel) {
    await dispatchLog(client, guild.id, 'vc', [newChannel.id], buildVoiceJoinPayload(member, newChannel));
  } else if (oldChannel && !newChannel) {
    await dispatchLog(client, guild.id, 'vc', [oldChannel.id], buildVoiceLeavePayload(member, oldChannel));
  } else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
    await dispatchLog(client, guild.id, 'vc', [oldChannel.id, newChannel.id], buildVoiceMovePayload(member, oldChannel, newChannel));
  }

  // ── Mute / Deafen (server-applied) ───────────────────────────────────────
  const activeChannel = newChannel ?? oldChannel;
  if (!activeChannel) return;

  if (oldState.serverMute !== newState.serverMute) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Server Mute', newState.serverMute));
  }
  if (oldState.serverDeaf !== newState.serverDeaf) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Server Deafen', newState.serverDeaf));
  }
  if (oldState.selfMute !== newState.selfMute) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Self Mute', newState.selfMute));
  }
  if (oldState.selfDeaf !== newState.selfDeaf) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Self Deafen', newState.selfDeaf));
  }
  if (oldState.streaming !== newState.streaming) {
    await dispatchLog(client, guild.id, 'vc', [activeChannel.id], buildVoiceStateFlagPayload(member, activeChannel, 'Streaming', newState.streaming));
  }
}
