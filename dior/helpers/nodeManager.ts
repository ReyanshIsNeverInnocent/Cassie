// xoxo/helpers/nodeManager.ts
//
// The single owner of Lavalink node lifecycle.
//
// Shoukaku is deliberately configured with finite reconnect attempts in
// CassieClient.ts. This manager owns the retry/failover policy instead:
//
//   - exactly one node may exist in Shoukaku's pool at a time
//   - one connection attempt may be pending at a time
//   - a failed node is neutered before it is removed
//   - stale events from abandoned nodes are ignored
//   - active players are resumed on the node that replaces a failed node
//
// This is intentionally separate from the node event files. The event files
// only report what Shoukaku observed; this module decides what happens next.

import { reconnectOnNodeOutage } from './twentyFourSeven.js';

interface NodeConfig {
  name: string;
  host: string;
  port: number;
  auth: string;
  secure: boolean;
}

const INITIAL_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 30 * 60_000;
const CONNECTION_ATTEMPT_TIMEOUT_MS = 15_000;
const FAILURE_WINDOW_MS = 20_000;
const FAILURE_THRESHOLD = 3;

let priorityList: NodeConfig[] = [];
let activeIndex = -1;
let activeName: string | null = null;
let activeNode: any = null;
let activeReady = false;
let failureTimestamps: number[] = [];

let connectionTimer: ReturnType<typeof setTimeout> | null = null;
let attemptTimeout: ReturnType<typeof setTimeout> | null = null;
let transitionInProgress = false;
let recoveryInProgress = new Set<string>();
let failedCycles = 0;
let outageAttemptedNodes = new Set<string>();
let outageVoiceRestored = false;

function toShoukakuOption(node: NodeConfig) {
  return {
    name: node.name,
    url: `${node.host}:${node.port}`,
    auth: node.auth,
    secure: node.secure,
  };
}

function getShoukaku(client: any): any | null {
  return client?.kazagumo?.shoukaku ?? null;
}

function isCurrentNode(client: any, nodeName: string): boolean {
  const shoukaku = getShoukaku(client);
  if (!shoukaku || activeName !== nodeName) return false;
  if (activeNode && shoukaku.nodes.get(nodeName) !== activeNode) return false;
  return true;
}

function clearConnectionTimer(): void {
  if (connectionTimer !== null) {
    clearTimeout(connectionTimer);
    connectionTimer = null;
  }
}

function clearAttemptTimeout(): void {
  if (attemptTimeout !== null) {
    clearTimeout(attemptTimeout);
    attemptTimeout = null;
  }
}

function hasLiveNode(client: any): boolean {
  const nodes: Map<string, any> | undefined = getShoukaku(client)?.nodes;
  if (!nodes) return false;
  return [...nodes.values()].some((node) => node.state === 1);
}

/**
 * Stop a node's built-in reconnect behavior before removing it.
 *
 * Shoukaku's close handler calls node.connect() again after emitting close.
 * Replacing the instance method before removeNode() means that callback
 * cannot start another connection behind the manager's back.
 */
function abandonNode(client: any, nodeName: string | null, nodeOverride?: any): void {
  const shoukaku = getShoukaku(client);
  if (!shoukaku || !nodeName) return;

  const node = nodeOverride ?? shoukaku.nodes.get(nodeName);
  if (!node) return;

  node.connect = async (): Promise<void> => {};

  if (shoukaku.nodes.get(nodeName) === node) {
    try {
      shoukaku.removeNode(nodeName, 'Node manager failover');
    } catch {
      // It may already have been removed by Shoukaku's disconnect path.
    }
  }
}

function removeUnexpectedNodes(client: any, keepName: string): void {
  const shoukaku = getShoukaku(client);
  if (!shoukaku?.nodes) return;

  for (const [name, node] of [...shoukaku.nodes.entries()]) {
    if (name === keepName) continue;
    abandonNode(client, name, node);
  }
}

function connectAt(client: any, index: number): void {
  clearConnectionTimer();
  clearAttemptTimeout();
  if (!priorityList.length || index < 0 || index >= priorityList.length) return;

  const cfg = priorityList[index];
  activeIndex = index;
  activeName = cfg.name;
  activeNode = null;
  activeReady = false;
  failureTimestamps = [];
  transitionInProgress = false;

  removeUnexpectedNodes(client, cfg.name);
  if (!outageAttemptedNodes.has(cfg.name)) {
    outageAttemptedNodes.add(cfg.name);
    console.log(`[NODE] 🔌 Attempting "${cfg.name}" (priority ${index + 1}/${priorityList.length})...`);
  }

  try {
    // Shoukaku's addNode() returns void and owns the async connect promise.
    // Its own rejection is emitted as an error event, which is wired before
    // this manager is started. No second addNode() may happen until this node
    // reports close/disconnect or ready.
    getShoukaku(client)?.addNode(toShoukakuOption(cfg));
    activeNode = getShoukaku(client)?.nodes?.get(cfg.name) ?? null;
    // Shoukaku's failed initial connect path does not consistently emit the
    // node-level disconnect event. Keep the manager independent of that
    // implementation detail: an attempt that never reaches ready is failed
    // over after a bounded period.
    attemptTimeout = setTimeout(() => {
      attemptTimeout = null;
      if (!isCurrentNode(client, cfg.name) || activeReady || hasLiveNode(client)) return;
      failover(client, cfg.name, `connection attempt timed out after ${CONNECTION_ATTEMPT_TIMEOUT_MS / 1000}s`);
    }, CONNECTION_ATTEMPT_TIMEOUT_MS);
  } catch (error: unknown) {
    console.error(`[NODE] ❌ "${cfg.name}" could not be added: ${error instanceof Error ? error.message : String(error)}`);
    failover(client, cfg.name, 'addNode threw');
  }
}

function scheduleConnect(client: any, index: number, delayMs: number): void {
  clearConnectionTimer();
  connectionTimer = setTimeout(() => {
    connectionTimer = null;
    connectAt(client, index);
  }, delayMs);
}

function failover(client: any, nodeName: string | null, reason: string): void {
  if (transitionInProgress) return;
  if (nodeName && !isCurrentNode(client, nodeName)) return;

  transitionInProgress = true;
  clearConnectionTimer();
  clearAttemptTimeout();

  const previousIndex = activeIndex;
  abandonNode(client, activeName, activeNode);
  activeNode = null;
  activeName = null;
  activeReady = false;

  const nextIndex = previousIndex < 0
    ? 0
    : (previousIndex + 1) % priorityList.length;
  const wrapping = previousIndex >= 0 && nextIndex === 0;

  if (nodeName && !outageAttemptedNodes.has(`failed:${nodeName}`)) {
    outageAttemptedNodes.add(`failed:${nodeName}`);
    console.warn(`[NODE] 🔁 "${nodeName}" unavailable (${reason}) — ${wrapping ? 'cycling back to the first node' : `trying "${priorityList[nextIndex]?.name ?? 'next'}"`}.`);
  }

  if (wrapping) {
    const retryDelay = Math.min(
      INITIAL_RETRY_DELAY_MS * (2 ** Math.min(failedCycles, 10)),
      MAX_RETRY_DELAY_MS,
    );
    failedCycles++;
    const retryMinutes = Math.round(retryDelay / 60_000);
    const retryText = retryDelay < 60_000 ? `${retryDelay / 1000}s` : `${retryMinutes}m`;
    console.warn(`[NODE] ⏳ All configured Lavalink nodes are down — retrying in ${retryText}.`);

    if (!outageVoiceRestored) {
      outageVoiceRestored = true;
      void reconnectOnNodeOutage(client).catch((error: unknown) => {
        console.error(`[24-7] Node-outage voice restore failed: ${error instanceof Error ? error.message : String(error)}`);
      });
    }

    scheduleConnect(client, nextIndex, retryDelay);
  } else {
    connectAt(client, nextIndex);
  }
}

async function recoverPlayers(client: any, nodeName: string): Promise<void> {
  const shoukaku = getShoukaku(client);
  const node = shoukaku?.nodes?.get(nodeName);
  const players: Map<string, any> | undefined = client?.kazagumo?.players;
  if (!node || node.state !== 1 || !players?.size) return;

  const recoveryKey = `${nodeName}:${activeIndex}`;
  if (recoveryInProgress.has(recoveryKey)) return;
  recoveryInProgress.add(recoveryKey);

  try {
    for (const player of [...players.values()]) {
      const remotePlayer = player?.shoukaku;
      if (!remotePlayer || player.state >= 5) continue;
      if (remotePlayer.node === node && remotePlayer.node.state === 1) continue;

      const oldNodeName = remotePlayer.node?.name ?? 'unknown';
      // Shoukaku's Player.resume() uses the current node's REST endpoint and
      // preserves encoded track, position, filters, volume, and voice data.
      remotePlayer.node = node;

      try {
        await remotePlayer.resume({
          position: Number(player.position ?? remotePlayer.position ?? 0),
          paused: Boolean(player.paused),
        });
        console.log(`[NODE] 🔄 Resumed player ${player.guildId} on "${nodeName}" (was "${oldNodeName}").`);
      } catch (error: unknown) {
        console.error(`[NODE] ❌ Could not resume player ${player.guildId} on "${nodeName}": ${error instanceof Error ? error.message : String(error)}`);
        // Restore the old reference when possible; a later node-ready event
        // can retry instead of leaving the player pointed at a dead node.
        if (remotePlayer.node === node) remotePlayer.node = shoukaku.nodes.get(oldNodeName) ?? node;
      }
    }
  } finally {
    recoveryInProgress.delete(recoveryKey);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API used by the node event files
// ─────────────────────────────────────────────────────────────────────────────

export function startNodeManager(client: any, nodes: NodeConfig[]): void {
  priorityList = nodes.slice();
  activeIndex = -1;
  activeName = null;
  activeNode = null;
  activeReady = false;
  failureTimestamps = [];
  transitionInProgress = false;
  failedCycles = 0;
  outageAttemptedNodes = new Set<string>();
  outageVoiceRestored = false;
  recoveryInProgress = new Set<string>();
  clearConnectionTimer();
  clearAttemptTimeout();

  connectAt(client, 0);
}

export function reportNodeReady(client: any, nodeName: string): void {
  if (!isCurrentNode(client, nodeName)) return;

  const node = getShoukaku(client)?.nodes?.get(nodeName);
  if (!node || node.state !== 1) return;

  activeNode = node;
  failureTimestamps = [];
  clearAttemptTimeout();
  if (activeReady) return;
  activeReady = true;
  failedCycles = 0;
  outageAttemptedNodes.clear();
  outageVoiceRestored = false;
  void recoverPlayers(client, nodeName);
}

export function reportNodeFailure(client: any, nodeName: string): boolean {
  if (!isCurrentNode(client, nodeName) || transitionInProgress) return false;

  // During the initial handshake there is no usable player session to
  // preserve. Shoukaku can emit `error` for this path without forwarding the
  // later disconnect event, so waiting for the normal strike threshold would
  // leave the manager stuck on a dead node.
  if (!activeReady) {
    failover(client, nodeName, 'connection failed before ready');
    return true;
  }

  const now = Date.now();
  failureTimestamps = failureTimestamps
    .filter((timestamp) => now - timestamp <= FAILURE_WINDOW_MS);
  failureTimestamps.push(now);

  if (failureTimestamps.length < FAILURE_THRESHOLD) return false;
  failover(client, nodeName, `${FAILURE_THRESHOLD} failures within ${FAILURE_WINDOW_MS / 1000}s`);
  return true;
}

export function reportNodeGaveUp(client: any, nodeName: string): void {
  if (!isCurrentNode(client, nodeName)) return;
  failover(client, nodeName, 'reconnect attempts exhausted');
}

export function getActiveNodeName(): string | null {
  return activeName;
}

export function getPriorityOrder(): string[] {
  return priorityList.map((node) => node.name);
}