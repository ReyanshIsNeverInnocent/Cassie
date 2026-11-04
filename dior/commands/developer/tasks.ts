import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperPanel } from '../../components/developer/devToolkit.js';
import { isGiveawaySchedulerRunning } from '../../helpers/giveawayManager.js';
import { isAutoresponderCooldownSweepRunning } from '../../helpers/autoresponderDispatch.js';
import { getActiveNowPlayingUpdateCount } from '../../helpers/nowPlayingManager.js';
import { getScheduledReminderCount } from '../../helpers/reminderStore.js';
import { isWebsiteStatsPublisherRunning } from '../../helpers/websiteStatsPublisher.js';

export const options = {
  name: 'tasks',
  aliases: ['dev-tasks'] as string[],
  description: 'Inspect the bot’s recurring jobs and scheduled reminders.',
  usage: 'tasks',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  const reminderStatus = client.db ? 'Initialized' : 'Unavailable without database';
  const giveawayRunning = isGiveawaySchedulerRunning();
  const websiteRunning = isWebsiteStatsPublisherRunning();
  const rotationCount = client.statusManager?.getActiveRotationCount() ?? 0;
  const statusManagerPresent = Boolean(client.statusManager);
  const birthdaySchedulerLoaded = Boolean(client.helpers.birthdayScheduler);
  const nowPlayingCount = getActiveNowPlayingUpdateCount();

  const sections = [
    {
      heading: 'Autoresponder cache cleanup',
      body: isAutoresponderCooldownSweepRunning()
        ? 'Running · sweeps every 60 seconds'
        : 'Not running',
    },
    {
      heading: 'Reminders',
      body: `${reminderStatus}\nScheduled reminder timers: ${getScheduledReminderCount()}`,
    },
    {
      heading: 'Giveaway checker',
      body: giveawayRunning ? 'Running · checks every 15 seconds' : 'Not running',
    },
    {
      heading: 'Website stats publisher',
      body: websiteRunning ? 'Running · publishes every 30 seconds' : 'Not running on this cluster',
    },
    {
      heading: 'Presence rotation',
      body: !statusManagerPresent
        ? 'Status manager not initialized'
        : `${rotationCount ? 'Running' : 'No active rotations'} · ${rotationCount} interval(s)`,
    },
    {
      heading: 'Birthday scheduler',
      body: birthdaySchedulerLoaded ? 'Loaded · checks at UTC midnight' : 'Not loaded',
    },
    {
      heading: 'Now-playing updates',
      body: `${nowPlayingCount} active player update interval(s) · 10-second interval`,
    },
  ];

  return message.channel.send(buildDeveloperPanel('Background tasks', sections));
}
