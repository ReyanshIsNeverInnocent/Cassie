// xoxo/commands/developer/restart-bot.ts
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo } from '../../components/statusMessages.js';
import {
  buildBotActionConfirmPayload,
  buildBotActionTimedOutPayload,
} from '../../components/developer/botActionConfirm.js';
import { authorOnlyFilter } from '../../helpers/panelGuard.js';

export const options = {
  name: 'restart-bot',
  aliases: ['res-bot'] as string[],
  description: 'Restart the bot.',
  usage: 'restart-bot',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  const confirmId = `restart-bot:confirm:${message.id}`;
  const cancelId  = `restart-bot:cancel:${message.id}`;

  const botName: string = client.config?.botName ?? 'Bot';

  const activeRequests: number = typeof (process as any)._getActiveRequests === 'function'
    ? (process as any)._getActiveRequests().length
    : 0;

  const confirmMsg = await message.reply({
    ...buildBotActionConfirmPayload('restart', confirmId, cancelId, activeRequests),
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
        `Bot restart initiated. **${botName}** will restart soon.`,
      );

      if (client.db?.setPendingRestartChannel) {
        await client.db.setPendingRestartChannel(
          message.channel.id,
          message.guild?.id ?? '',
        ).catch((): null => null);
      }

      setTimeout(() => {
        (client as any).cluster?.respawnAll().catch((): null => null);
      }, 2000);
    } else {
      await sendError(
        { message, existingMessage: confirmMsg },
        'Bot restart cancelled. Right decision?',
      );
    }
  });

  collector.on('end', (_collected: any, reason: string) => {
    if (reason !== 'time') return;
    confirmMsg
      .edit(buildBotActionTimedOutPayload('restart', confirmId, cancelId, activeRequests))
      .catch((): null => null);
  });
}
