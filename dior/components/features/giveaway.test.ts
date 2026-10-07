import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildActiveGiveawayPayload,
  buildEndedGiveawayPayload,
  buildGiveawayListPayload,
  buildGiveawayParticipantsPayload,
  buildWinnerAnnouncement,
} from './giveaway.js';

describe('buildActiveGiveawayPayload', () => {
  it('includes the current entry count below the winner count', () => {
    const payload = buildActiveGiveawayPayload({
      id: 'g1',
      guild_id: 'guild',
      channel_id: 'channel',
      message_id: 'message',
      host_id: 'host',
      prize: 'Steam gift card',
      winners: 3,
      end_at: 1_700_000_000_000,
      status: 'active',
      winner_ids: [],
      winner_history: [],
      created_at: 1_700_000_000_000,
    } as any, 12, null);

    const content = JSON.stringify(payload);
    assert.match(content, /Winners: 3/);
    assert.match(content, /Entries: 12/);
  });
});

describe('ended giveaway payloads', () => {
  const giveaway = {
    id: 'g1',
    guild_id: 'guild',
    channel_id: 'channel',
    message_id: 'message',
    host_id: 'host',
    prize: 'Steam gift card',
    winners: 3,
    end_at: 1_700_000_000_000,
    ended_at: 1_700_000_000_000,
    status: 'ended',
    winner_ids: [],
    winner_history: [],
    created_at: 1_700_000_000_000,
  } as any;

  it('keeps the entry count visible after a giveaway ends', () => {
    const payload = buildEndedGiveawayPayload(giveaway, 12);

    assert.match(JSON.stringify(payload), /Entries: 12/);
  });

  it('shows cancellations as cancelled with no winners declared', () => {
    const payload = buildEndedGiveawayPayload(giveaway, 12, null, true);
    const announcement = buildWinnerAnnouncement(giveaway, [], undefined, false, true);

    assert.match(JSON.stringify(payload), /Cancelled: No winners were declared/);
    assert.match(JSON.stringify(payload), /Giveaway Cancelled/);
    assert.match(JSON.stringify(announcement), /giveaway was cancelled\. No winners were declared/);
    assert.doesNotMatch(JSON.stringify(announcement), /no valid entries/i);
  });
});

describe('giveaway list and participants payloads', () => {
  it('renders a compact active giveaways list', () => {
    const payload = buildGiveawayListPayload([
      { id: 'g1', prize: 'VIP role', host_id: 'host1', end_at: Date.now() + 60_000, winners: 2 },
      { id: 'g2', prize: 'Nitro', host_id: 'host2', end_at: Date.now() + 120_000, winners: 1 },
    ] as any);

    const content = JSON.stringify(payload);
    assert.match(content, /Active Giveaways/);
    assert.match(content, /VIP role/);
    assert.match(content, /ending in/);
  });

  it('renders paginated participant pages', () => {
    const payload = buildGiveawayParticipantsPayload({
      id: 'g1',
      prize: 'VIP role',
      end_at: Date.now() + 60_000,
      host_id: 'host1',
      winners: 2,
    } as any, ['u1', 'u2', 'u3'], 0, 2);

    const content = JSON.stringify(payload);
    assert.match(content, /Giveaway Participants/);
    assert.match(content, /Page 1\/2/);
  });
});
