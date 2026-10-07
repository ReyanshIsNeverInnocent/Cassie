import type { CassieClient } from '../structures/CassieClient.js';
import { resolveWsPing } from '../utils/wsPing.js';

const PUBLISH_INTERVAL_MS = 30_000;
const COMMANDS_REFRESH_MS = 30_000;
const AGGREGATION_TIMEOUT_MS = 20_000;

interface ClusterTotals {
  servers: number;
  members: number;
  channels: number;
}

function readLocalTotals(client: CassieClient): ClusterTotals {
  const guilds = [...client.guilds.cache.values()] as any[];
  return {
    servers: guilds.length,
    members: guilds.reduce((total, guild) => total + (guild.memberCount ?? 0), 0),
    channels: guilds.reduce((total, guild) => total + (guild.channels?.cache?.size ?? 0), 0),
  };
}

export function startWebsiteStatsPublisher(client: CassieClient): void {
  const clusterId = Number((client.cluster as any)?.id ?? 0);
  if (clusterId !== 0) return;
  if (!client.db) {
    console.warn('[WEB STATS] Publisher disabled: database is unavailable.');
    return;
  }

  let commandsExecuted = 0;
  let commandsRefreshedAt = 0;
  let publishing = false;
  let lastErrorAt = 0;
  let hasPublished = false;
  console.log('[WEB STATS] Publishing website stats to Supabase Postgres.');

  const publish = async (): Promise<void> => {
    if (publishing) return;
    publishing = true;
    try {
      let totals: ClusterTotals;
      if (client.cluster?.broadcastEval) {
        try {
          const clusterTotals = await Promise.race([
            client.cluster.broadcastEval((c: any) => {
              const guilds = [...c.guilds.cache.values()];
              return {
                servers: guilds.length,
                members: guilds.reduce((total: number, guild: any) => total + (guild.memberCount ?? 0), 0),
                channels: guilds.reduce((total: number, guild: any) => total + (guild.channels?.cache?.size ?? 0), 0),
              };
            }),
            new Promise<never>((_, reject) => {
              const timeout = setTimeout(() => reject(new Error('Cluster aggregation timed out')), AGGREGATION_TIMEOUT_MS);
              timeout.unref?.();
            }),
          ]);
          totals = clusterTotals.reduce(
            (all: ClusterTotals, current: ClusterTotals) => ({
              servers: all.servers + current.servers,
              members: all.members + current.members,
              channels: all.channels + current.channels,
            }),
            { servers: 0, members: 0, channels: 0 },
          );
        } catch (error) {
          totals = readLocalTotals(client);
          const message = error instanceof Error ? error.message : String(error);
          if (Date.now() - lastErrorAt > 60_000) {
            lastErrorAt = Date.now();
            console.warn(`[WEB STATS] Cluster aggregation unavailable; publishing this cluster's totals: ${message}`);
          }
        }
      } else {
        totals = readLocalTotals(client);
      }

      const now = Date.now();
      if (client.db && now - commandsRefreshedAt >= COMMANDS_REFRESH_MS) {
        try {
          commandsExecuted = await client.db.getGlobalCommandsExecuted();
          commandsRefreshedAt = now;
        } catch {
          // Preserve the last known total; live runtime stats do not depend on PostgreSQL.
        }
      }

      const cluster = client.cluster as any;
      const snapshot = {
        status: 'online',
        servers: totals.servers,
        members: totals.members,
        channels: totals.channels,
        commandsExecuted,
        ping: resolveWsPing(client) ?? -1,
        uptimeSecs: Math.floor(process.uptime()),
        memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
        shards: cluster?.info?.TOTAL_SHARDS ?? client.ws.shards.size,
        clusters: cluster?.count ?? 1,
        timestamp: now,
      };

      await client.db.updateWebsiteStatsSnapshot(snapshot);
      lastErrorAt = 0;
      if (!hasPublished) {
        hasPublished = true;
        console.log('[WEB STATS] Initial Supabase stats snapshot published successfully.');
      }
    } catch (error) {
      if (Date.now() - lastErrorAt > 60_000) {
        lastErrorAt = Date.now();
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[WEB STATS] Snapshot publish failed: ${message}`);
      }
    } finally {
      publishing = false;
    }
  };

  void publish();
  const timer = setInterval(() => void publish(), PUBLISH_INTERVAL_MS);
  timer.unref?.();
  console.log(`[WEB STATS] Supabase publisher started on cluster ${clusterId} (30 sec interval).`);
}