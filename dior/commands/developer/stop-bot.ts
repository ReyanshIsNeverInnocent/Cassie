// xoxo/commands/developer/stop-bot.ts
//
// Kills the entire bot — manager process and every cluster — by evaluating
// `process.exit(0)` on the ClusterManager. Because `respawn: true` only
// respawns crashed *child* clusters, exiting the *manager* takes the whole
// bot down for good.
//
// There is intentionally NO `start-bot` command: once the bot process is
// dead, nothing inside Discord can wake it back up. Restart has to come
// from outside (PM2 / systemd / Docker / hosting panel).

import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo } from '../../components/statusMessages.js';
import {
  buildBotActionConfirmPayload,
  buildBotActionTimedOutPayload,
} from '../../components/developer/botActionConfirm.js';
import { getHostingProviderName } from '../../helpers/getHostingServiceIP.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
// dist/dior/commands/developer/stop-bot.js → dist/ (three levels up) is
// where index.ts's compiled __dirname lands too — must match index.ts's
// STOP_FLAG_PATH exactly, or the manager process will never see the flag.
const DIST_ROOT = join(dirname(__filename), '..', '..', '..');
const STOP_FLAG_PATH = join(DIST_ROOT, '.stop-flag');

export const options = {
  name: 'stop-bot',
  aliases: ['s-bot'] as string[],
  description: 'Stop the bot completely.',
  usage: 'stop-bot',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  const confirmId = `stop-bot:confirm:${message.id}`;
  const cancelId  = `stop-bot:cancel:${message.id}`;

  const botName: string = client.config?.botName ?? 'Bot';

  const activeRequests: number = typeof (process as any)._getActiveRequests === 'function'
    ? (process as any)._getActiveRequests().length
    : 0;

  const hostName = getHostingProviderName();

  const confirmMsg = await message.reply({
    ...buildBotActionConfirmPayload(
      'stop',
      confirmId,
      cancelId,
      activeRequests,
      `-# Currently hosted on: **${hostName}**`,
    ),
    allowedMentions: { repliedUser: true },
  });

  const collector = confirmMsg.createMessageComponentCollector({
    filter: (i: any) => authorOnlyFilter(
      i, message.author.id,
      (cid) => cid === confirmId || cid === cancelId,
    ),
    max: 1,
    time: 30_000,
  });

  collector.on('collect', async (i: any) => {
    await i.deferUpdate().catch((): null => null);

    if (i.customId === confirmId) {
      await sendInfo(
        { message, existingMessage: confirmMsg },
        `Bot shutdown initiated. **${botName}** will stop in a moment.`,
      );

      setTimeout(() => {
        // Drop the flag on the manager process before it exits, so index.ts
        // sees it even if the host's watchdog force-respawns the process.
        (client as any).cluster
          ?.evalOnManager(`
            (async () => {
              try {
                const fs = await import('fs');
                fs.writeFileSync(${JSON.stringify(STOP_FLAG_PATH)}, String(Date.now()));
              } catch {}
              process.exit(0);
            })();
          `)
          .catch((): null => null);

        setTimeout(() => {
          try { writeFileSync(STOP_FLAG_PATH, String(Date.now())); } catch {}
          process.exit(0);
        }, 1500);
      }, 2000);
    } else {
      await sendError(
        { message, existingMessage: confirmMsg },
        'Bot shutdown cancelled. Right decision?',
      );
    }
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildBotActionTimedOutPayload('stop', confirmId, cancelId, activeRequests))
      .catch((): null => null);
  });
}
