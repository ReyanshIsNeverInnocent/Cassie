// xoxo/events/node/nodeDestroy.ts
// Shoukaku event: 'close' — fires when a node connection closes
// Args: (name: string, code: number, reason: string)
//
// This is the event that was causing the spam:
//   "[NODE] 💀 Lavalink node "Jirayu" closed. Code: 1006, Reason: None"
// Shoukaku's internal reconnect loop fires 'close' on every failed attempt with
// no backoff, causing it to repeat indefinitely. We now route each close event
// through the node manager's failure counter. Once the threshold is reached the
// manager neuters the node's reconnect loop and switches to the next node.

import { getActiveNodeName, reportNodeFailure } from '../../helpers/nodeManager.js';

export const name = 'close';
export const type = 'node';

export const execute = (client: any, nodeName: string, code: number, reason: string): void => {
  // Notify the node manager. It counts this toward the failover threshold.
  // Returns true if it triggered a failover (it already logged that).
  const failedOver = reportNodeFailure(client, nodeName);
  if (!failedOver && getActiveNodeName() === nodeName) {
    // Only log individual close events when we haven't failed over yet — avoids
    // flooding the console while we wait for the threshold to be reached.
    console.warn(`[NODE] 💀 Lavalink node "${nodeName}" closed. Code: ${code}, Reason: ${reason || 'None'}`);
  }
};
