import { config } from '../../config.js';
// xoxo/commands/music/filter.ts
//
// Composable Lavalink music filters.
//
// Usage:
//   filter <filter ...>          apply one or more filters
//   filter remove <filter ...>   remove one or more filters
//   filter reset                 remove every filter
//   filter help                  show available filters

import {
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  SeparatorSpacingSize,
  TextDisplayBuilder,
} from 'discord.js';
import type { FilterOptions } from 'shoukaku';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendInfo, sendSuccess } from '../../components/statusMessages.js';
import { emojis } from '../../emojis.js';
import {
  getResourceAttachment,
  getResourceAttachmentUrl,
} from '../../helpers/resourceAttachments.js';

export const options = {
  name: 'filter',
  aliases: ['filters'] as string[],
  description: 'Apply, remove, or reset music filters.',
  usage: `filter <filter ...>
filter remove <filter ...>
filter reset
filter clear
filter help
filter available`,
  category: 'music',
  isDeveloper: false,
  userPerms: [] as string[],
  botPerms: [] as string[],
  player: true,
  inVoiceChannel: true,
  sameVoiceChannel: true,
  cooldown: 3,
};

type EqualizerBand = { band: number; gain: number };
type FilterPreset = Partial<FilterOptions>;

const ACTIVE_FILTERS_KEY = 'musicFilters';

const FILTER_NAMES = [
  '3d',
  '8d',
  'bass',
  'bassboost',
  'chipmunk',
  'dance',
  'darthvader',
  'daycore',
  'distort',
  'earrape',
  'electronic',
  'enhance',
  'equalizer',
  'karaoke',
  'lofi',
  'lowpass',
  'nightcore',
  'pitch',
  'rotation',
  'soft',
  'speed',
  'treblebass',
  'tremolo',
  'vaporwave',
  'vibrato',
  'vocalboost',
] as const;

type FilterName = typeof FILTER_NAMES[number];

const UNAVAILABLE_FILTERS = ['slowreverb'];
const FILTER_SET = new Set<string>(FILTER_NAMES);

function equalizer(...bands: Array<[number, number]>): EqualizerBand[] {
  return bands.map(([band, gain]) => ({ band, gain }));
}

const PRESETS: Record<FilterName, FilterPreset> = {
  '3d': {
    rotation: { rotationHz: 0.08 },
    channelMix: {
      leftToLeft: 0.9,
      leftToRight: 0.1,
      rightToLeft: 0.1,
      rightToRight: 0.9,
    },
  },
  '8d': {
    rotation: { rotationHz: 0.2 },
  },
  bass: {
    equalizer: equalizer([0, 0.18], [1, 0.16], [2, 0.12], [3, 0.08]),
  },
  bassboost: {
    equalizer: equalizer([0, 0.35], [1, 0.3], [2, 0.24], [3, 0.16], [4, 0.08]),
  },
  chipmunk: {
    timescale: { pitch: 1.35, speed: 1.05, rate: 1 },
  },
  dance: {
    timescale: { speed: 1.08, rate: 1.02 },
    tremolo: { frequency: 4, depth: 0.45 },
  },
  darthvader: {
    timescale: { pitch: 0.72, speed: 0.92, rate: 1 },
    distortion: { sinScale: 0.12, cosScale: 0.12, tanScale: 0.05 },
  },
  daycore: {
    timescale: { pitch: 0.9, speed: 0.86, rate: 1 },
  },
  distort: {
    distortion: {
      sinOffset: 0,
      sinScale: 1,
      cosOffset: 0,
      cosScale: 1,
      tanOffset: 0,
      tanScale: 1,
      offset: 0,
      scale: 1,
    },
  },
  earrape: {
    volume: 2,
    equalizer: equalizer([0, 0.45], [1, 0.4], [2, 0.3], [3, 0.2], [4, 0.12]),
  },
  electronic: {
    equalizer: equalizer(
      [0, 0.12], [2, 0.18], [4, 0.08], [6, 0.12],
      [8, 0.16], [10, 0.1], [12, 0.16], [14, 0.12],
    ),
  },
  enhance: {
    equalizer: equalizer([1, 0.08], [3, 0.12], [5, 0.1], [7, 0.08], [9, 0.1], [11, 0.08]),
  },
  equalizer: {
    equalizer: equalizer(
      [0, 0.05], [1, 0.04], [2, 0.02], [3, 0],
      [4, -0.02], [5, -0.03], [6, -0.02], [7, 0],
      [8, 0.03], [9, 0.05], [10, 0.07], [11, 0.08],
      [12, 0.08], [13, 0.06], [14, 0.04],
    ),
  },
  karaoke: {
    karaoke: { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 },
  },
  lofi: {
    lowPass: { smoothing: 20 },
    equalizer: equalizer([0, 0.12], [1, 0.1], [2, 0.05], [8, -0.08], [10, -0.12], [12, -0.16]),
  },
  lowpass: {
    lowPass: { smoothing: 25 },
  },
  nightcore: {
    timescale: { speed: 1.22, pitch: 1.12, rate: 1 },
  },
  pitch: {
    timescale: { pitch: 1.15 },
  },
  rotation: {
    rotation: { rotationHz: 0.25 },
  },
  soft: {
    lowPass: { smoothing: 8 },
    equalizer: equalizer([0, 0.04], [1, 0.03], [10, -0.04], [12, -0.06], [14, -0.08]),
  },
  speed: {
    timescale: { speed: 1.2 },
  },
  treblebass: {
    equalizer: equalizer(
      [0, 0.2], [1, 0.16], [2, 0.1],
      [11, 0.1], [12, 0.15], [13, 0.2], [14, 0.22],
    ),
  },
  tremolo: {
    tremolo: { frequency: 4, depth: 0.7 },
  },
  vaporwave: {
    timescale: { speed: 0.82, pitch: 0.82, rate: 1 },
    lowPass: { smoothing: 6 },
  },
  vibrato: {
    vibrato: { frequency: 5, depth: 0.55 },
  },
  vocalboost: {
    equalizer: equalizer([4, 0.12], [5, 0.18], [6, 0.2], [7, 0.18], [8, 0.12]),
  },
};

function getActiveFilters(player: any): Set<FilterName> {
  const stored = player.data?.get(ACTIVE_FILTERS_KEY);
  if (stored instanceof Set) return new Set([...stored].filter((name): name is FilterName => FILTER_SET.has(name)));
  return new Set<FilterName>();
}

function mergeEqualizers(
  current: EqualizerBand[] = [],
  incoming: EqualizerBand[] = [],
): EqualizerBand[] {
  const gains = new Map<number, number>();
  for (const band of current) gains.set(band.band, band.gain);
  for (const band of incoming) {
    const gain = Math.max(-0.25, Math.min(1, (gains.get(band.band) ?? 0) + band.gain));
    gains.set(band.band, gain);
  }
  return [...gains.entries()]
    .sort(([a], [b]) => a - b)
    .map(([band, gain]) => ({ band, gain }));
}

function mergeFilters(active: Set<FilterName>): FilterOptions {
  const merged: FilterOptions = {};

  for (const name of active) {
    const preset = PRESETS[name];
    if (preset.equalizer) {
      merged.equalizer = mergeEqualizers(merged.equalizer, preset.equalizer);
    }
    if (preset.volume !== undefined) merged.volume = Math.max(merged.volume ?? 0, preset.volume);
    if (preset.karaoke) merged.karaoke = { ...merged.karaoke, ...preset.karaoke };
    if (preset.timescale) merged.timescale = { ...merged.timescale, ...preset.timescale };
    if (preset.tremolo) merged.tremolo = { ...merged.tremolo, ...preset.tremolo };
    if (preset.vibrato) merged.vibrato = { ...merged.vibrato, ...preset.vibrato };
    if (preset.rotation) merged.rotation = { ...merged.rotation, ...preset.rotation };
    if (preset.distortion) merged.distortion = { ...merged.distortion, ...preset.distortion };
    if (preset.channelMix) merged.channelMix = { ...merged.channelMix, ...preset.channelMix };
    if (preset.lowPass) merged.lowPass = { ...merged.lowPass, ...preset.lowPass };
  }

  return merged;
}

async function applyActiveFilters(player: any, active: Set<FilterName>): Promise<void> {
  if (active.size === 0) {
    await player.shoukaku.clearFilters();
  } else {
    await player.shoukaku.setFilters(mergeFilters(active));
  }
  player.data?.set(ACTIVE_FILTERS_KEY, new Set(active));
}

function displayName(name: string): string {
  return name === '8d' ? '8D' : name.charAt(0).toUpperCase() + name.slice(1);
}

function visibleSeparator(): SeparatorBuilder {
  return new SeparatorBuilder()
    .setSpacing(SeparatorSpacingSize.Small)
    .setDivider(true);
}

export function buildFilterHelpPayload(client: CassieClient): any {
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        `## ${emojis.musicHeartNote} Music Filters`,
      ),
    )
    .addSeparatorComponents(visibleSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '**Usage:** `filter [filter-1] [filter-2]`\n' +
        '**Example:** `filter nightcore 8d`\n\n' +
        '**Other commands:**\n' +
        '`filter remove <filter-1> <filter-2>` - remove filter(s)\n' +
        '`filter reset` or `filter clear` - clear all filters\n' +
        '`filter help` - shows this message',
      ),
    )
    .addSeparatorComponents(visibleSeparator())
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        '### Available filters\n\n' +
        '**Tone:** bass · bassboost · electronic · enhance · equalizer · lofi · lowpass · soft · treblebass · vocalboost\n' +
        '**Tempo:** chipmunk · daycore · darthvader · nightcore · pitch · speed · vaporwave\n' +
        '**Space & motion:** 3d · 8d · dance · rotation · tremolo · vibrato\n' +
        '**Other:** distort · earrape · karaoke',
      ),
    )
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(
        new MediaGalleryItemBuilder().setURL(getResourceAttachmentUrl(client.config.filterHelpImage)),
      ),
    );

  return {
    components: [container],
    files: [getResourceAttachment(client.config.filterHelpImage)],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function handle(
  ctx: { message?: any; interaction?: any; isSlash: boolean },
  guildId: string,
  args: string[],
  client: CassieClient,
): Promise<any> {
  const ctxObj = ctx.isSlash ? { interaction: ctx.interaction } : { message: ctx.message };
  const action = args[0]?.toLowerCase();

  if (action === 'help' || action === 'available') {
    if (ctx.message) {
      return ctx.message.reply(buildFilterHelpPayload(client));
    }
    return sendInfo(ctxObj, 'Use `filter help` from a prefix command to view the filter guide.');
  }

  const player = (client as any).kazagumo.players.get(guildId);
  if (!player?.queue?.current) return sendError(ctxObj, 'There is nothing currently playing.');

  if (!args.length) {
    const active = [...getActiveFilters(player)];
    return sendInfo(
      ctxObj,
      active.length
        ? `Active filters: **${active.map(displayName).join(', ')}**\n-# Use \`filter help\` to see all available filters.`
        : 'No music filters are active.\n-# Use `filter help` to see all available filters.',
    );
  }

  const isRemove = action === 'remove';
  const isReset = action === 'reset' || action === 'clear';
  const names = (isRemove ? args.slice(1) : isReset ? [] : args)
    .map((name) => name.toLowerCase())
    .filter(Boolean);

  if (isReset) {
    await applyActiveFilters(player, new Set());
    return sendSuccess(ctxObj, 'All music filters have been removed.');
  }

  if (isRemove && !names.length) {
    return sendError(ctxObj, 'Usage: `filter remove <filter name ...>`.');
  }

  const unavailable = names.filter((name) => UNAVAILABLE_FILTERS.includes(name));
  if (unavailable.length) {
    return sendError(ctxObj, `These filters are not available: **${unavailable.join(', ')}**.`);
  }

  const unknown = names.filter((name) => !FILTER_SET.has(name));
  if (unknown.length) {
    return sendError(ctxObj, `Unknown filter(s): **${unknown.join(', ')}**. Use \`filter help\` to see available filters.`);
  }

  const active = getActiveFilters(player);
  const changed: string[] = [];

  for (const name of names as FilterName[]) {
    if (isRemove) {
      if (active.delete(name)) changed.push(name);
    } else if (!active.has(name)) {
      active.add(name);
      changed.push(name);
    }
  }

  if (!changed.length) {
    return sendInfo(
      ctxObj,
      isRemove
        ? 'None of those filters were active.'
        : 'Those filters are already active.',
    );
  }

  try {
    await applyActiveFilters(player, active);
  } catch (err: any) {
    console.error(`[filter] Failed to update filters in guild ${guildId}:`, err);
    return sendError(ctxObj, 'Lavalink could not apply that filter combination. Please try again.');
  }

  return sendSuccess(
    ctxObj,
    isRemove
      ? `Removed filter(s): **${changed.map(displayName).join(', ')}**.`
      : `Applied filter(s): **${changed.map(displayName).join(', ')}**.`,
  );
}

export async function prefixExecute(message: any, args: string[], client: CassieClient) {
  await handle({ message, isSlash: false }, message.guild.id, args, client);
}
