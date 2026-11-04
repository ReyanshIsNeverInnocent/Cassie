import type { CassieClient } from '../../structures/CassieClient.js';
import { buildDeveloperPanel } from '../../components/developer/devToolkit.js';
import { getActiveNodeName, getPriorityOrder } from '../../helpers/nodeManager.js';
import { resolveWsPing } from '../../utils/wsPing.js';

export const options = {
  name: 'health',
  aliases: ['dev-health'] as string[],
  description: 'Show runtime, gateway, database, cluster, and music-node health.',
  usage: 'health',
  category: 'developer',
  owner: true,
  cooldown: 0,
};

function formatDuration(totalSeconds: number): string {
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  return `${days}d ${hours}h ${minutes}m ${seconds}s`;
}

export async function prefixExecute(message: any, _args: string[], client: CassieClient) {
  const memory = process.memoryUsage();
  const connectedNodes = [...(client.kazagumo?.shoukaku?.nodes?.values?.() ?? [])]
    .filter((node: any) => node.state === 1)
    .map((node: any) => node.name);
  const activeNode = getActiveNodeName();
  const priorityNodes = getPriorityOrder();
  const dbPing = client.db ? await client.db.ping() : null;
  const wsPing = resolveWsPing(client);
  const discordReady = client.isReady();

  const sections = [
    {
      heading: 'Discord gateway',
      body: `Status: ${discordReady ? 'Connected' : 'Not ready'}\nWebSocket ping: ${wsPing === null ? 'Unavailable' : `${wsPing} ms`}\nGuilds on this cluster: ${client.guilds.cache.size}`,
    },
    {
      heading: 'Database',
      body: !client.db
        ? 'Status: Not initialized'
        : dbPing === null
          ? 'Status: Unreachable'
          : `Status: Connected\nPing: ${dbPing} ms`,
    },
    {
      heading: 'Lavalink',
      body: !client.kazagumo
        ? 'Status: Not initialized'
        : `Connected nodes: ${connectedNodes.length ? connectedNodes.join(', ') : 'None'}\nManager target: ${activeNode ?? 'None'}\nPriority order: ${priorityNodes.length ? priorityNodes.join(', ') : 'None configured'}`,
    },
    {
      heading: 'Process',
      body: `Uptime: ${formatDuration(process.uptime())}\nRSS: ${(memory.rss / 1024 / 1024).toFixed(1)} MiB\nHeap: ${(memory.heapUsed / 1024 / 1024).toFixed(1)} / ${(memory.heapTotal / 1024 / 1024).toFixed(1)} MiB\nNode.js: ${process.version} · PID ${process.pid}`,
    },
    {
      heading: 'Cluster',
      body: `Cluster ID: ${client.cluster?.id ?? 'Unknown'}\nClusters: ${client.cluster?.count ?? 'Unknown'}\nShards: ${client.ws.shards.size}`,
    },
  ];

  const healthy = discordReady && (!client.db || dbPing !== null);
  return message.channel.send(buildDeveloperPanel('Runtime health', sections, healthy));
}
