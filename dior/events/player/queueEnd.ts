// xoxo/events/player/queueEnd.ts
// Kazagumo event: 'playerEmpty' — fires when the queue is empty and playback stops
// Args: (player: KazagumoPlayer)
import { sendInfo } from '../../components/statusMessages.js';
import { disableNowPlayingButtons, markMessageAsQueueEnd } from '../../helpers/nowPlayingManager.js';
import { join247Voice, scheduleRejoin } from '../../helpers/twentyFourSeven.js';

const REJOIN_DELAY_MS = 2 * 60 * 1000; // 2 minutes

export const name = 'playerEmpty';
export const type = 'player';

export async function execute(client: any, player: any): Promise<void> {
  const guild = client.guilds.cache.get(player.guildId);
  if (!guild) return;

  console.log(`[PLAYER] Queue ended in ${guild.name}`);

  await disableNowPlayingButtons(client, player).catch(() => {});
  markMessageAsQueueEnd(player.guildId);

  const channel = client.channels.cache.get(player.textId);
  if (channel) {
    const prefix = client.config?.prefix ?? '$';
    await sendInfo(
      { channel },
      `Queue has ended. Use \`${prefix}play\` to add more songs.`,
    ).catch(() => {});
  }

  const is247 = await client.db?.get24Seven?.(player.guildId).catch((): null => null);

  if (is247?.enabled) {
    if (player.voiceId === is247.channelId) {
      try {
        await join247Voice(client, guild, is247.channelId);
        console.log(`[24-7] Bot staying connected in 24/7 channel in ${guild.name}`);
      } catch (error) {
        console.error(`[24-7] Could not switch to independent voice in ${guild.name}: ${error instanceof Error ? error.message : String(error)}`);
        scheduleRejoin(client, player.guildId, is247.channelId, REJOIN_DELAY_MS);
      }
    } else {
      console.log(`[24-7] Queue ended outside 24/7 channel in ${guild.name} — rejoining in 2 min`);
      scheduleRejoin(client, player.guildId, is247.channelId, REJOIN_DELAY_MS);
    }
  } else {
    if (client.helpers?.startInactivityTimer) {
      client.helpers.startInactivityTimer(player.guildId, player.textId);
    }
  }

  if (client.helpers?.updateVoiceStatus) {
    await client.helpers.updateVoiceStatus(player).catch(() => {});
  }
}
