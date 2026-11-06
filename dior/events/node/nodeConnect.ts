// xoxo/events/node/nodeConnect.ts
// Shoukaku event: 'ready' — fires when a node connects or resumes.
// Args: (name: string, resumed: boolean)

import { reportNodeReady }    from '../../helpers/nodeManager.js';
import { clearNodeSilence }   from './nodeError.js';

export const name = 'ready';
export const type = 'node';

export const execute = (client: any, nodeName: string, resumed: boolean): void => {
  // Tell the node manager this node is healthy — resets its failure counter.
  reportNodeReady(client, nodeName);
  // Clear any per-error-code silencing so fresh errors are logged after recovery.
  clearNodeSilence(nodeName);

  if (resumed) {
    console.log(`[NODE] 🔄 Lavalink node "${nodeName}" resumed session.`);
  } else {
    console.log(`[NODE] ✅ Lavalink node "${nodeName}" connected!`);
  }

};
