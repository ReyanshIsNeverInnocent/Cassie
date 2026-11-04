import { config } from '../../config.js';
// xoxo/commands/utility/host-image.ts
//
// Upload an image (attachment or direct URL) to imgbb and return its hosted
// links, plus basic metadata (type, dimensions, name, size). Nothing is
// saved to the database — this is a stateless passthrough to imgbb.
//
// Usage:
//   host-image <image attachment>
//   host-image <image URL>

import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import { isValidImageUrl } from '../../utils/imageUtils.js';
import { uploadToImgbb } from '../../utils/imgbb.js';
import { detectImageInfo } from '../../utils/imageInfo.js';
import { formatBytes, escapeFormatting } from '../../utils/formatting.js';
import { emojis } from '../../emojis.js';

export const options = {
  name: 'host-image',
  aliases: ['hostimage', 'imgbb'] as string[],
  description: 'Upload an image to imgbb and get its hosted links.',
  usage: `host-image <image attachment>
  host-image <image URL>`,
  category: 'features',
  owner: false,
  cooldown: 8,
};

const MAX_FILE_SIZE = 32 * 1024 * 1024; // imgbb's own cap

function guessNameFromUrl(url: string): string {
  try {
    const pathname = new URL(url).pathname;
    const last = pathname.split('/').filter(Boolean).pop();
    return last || 'image';
  } catch {
    return 'image';
  }
}

/**
 * Fetch a remote file and validate that it's an image within size limits.
 * Returns { buffer, contentType, name } or an { error } describing the problem.
 */
async function fetchImage(
  url: string,
  fallbackName: string,
): Promise<
  | { buffer: Buffer; contentType: string; name: string }
  | { error: string }
> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (err: any) {
    return { error: `Failed to fetch the image: ${err?.message || 'network error'}.` };
  }

  if (!response.ok) {
    return { error: `Failed to fetch the image (HTTP ${response.status}).` };
  }

  const contentType = response.headers.get('content-type') || '';
  const declaredLength = Number(response.headers.get('content-length') || 0);
  if (declaredLength && declaredLength > MAX_FILE_SIZE) {
    return { error: `Maximum file size is **32 MB**. That file is **${formatBytes(declaredLength)}**.` };
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_FILE_SIZE) {
    return { error: `Maximum file size is **32 MB**. That file is **${formatBytes(buffer.length)}**.` };
  }
  if (buffer.length === 0) {
    return { error: 'The fetched file is empty.' };
  }

  return { buffer, contentType, name: fallbackName };
}

/**
 * Build the Components V2 success panel shown after a successful upload.
 */
function buildResultPanel(params: {
  data: any;
  format: string;
  width: number | null;
  height: number | null;
  name: string;
  size: number;
}): any {
  const { data, format, width, height, name, size } = params;
  const dimensions = width && height ? `${width} × ${height}` : 'Unknown';

  const content = [
    `# ${emojis.greentick1} Image Hosted`,
    `**Name:** ${escapeFormatting(name)}`,
    `**Type:** ${format}`,
    `**Dimensions:** ${dimensions}`,
    `**Size:** ${formatBytes(size)}`,
    `**Direct Link:** \`${escapeFormatting(data.url || data.display_url || '')}\``,
  ].join('\n');

  return {
    components: [
      new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addMediaGalleryComponents(
          new MediaGalleryBuilder().addItems(
            new MediaGalleryItemBuilder().setURL(data.display_url || data.url),
          ),
        )
        .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
        .addActionRowComponents(
          new ActionRowBuilder<ButtonBuilder>().addComponents(
            new ButtonBuilder().setURL(data.url).setLabel('Direct Link').setStyle(ButtonStyle.Link),
            new ButtonBuilder().setURL(data.url_viewer).setLabel('Viewer Page').setStyle(ButtonStyle.Link),
          ),
        ),
    ],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

async function performUpload(
  buffer: Buffer,
  fallbackName: string,
): Promise<{ payload: any } | { error: string }> {
  const info = detectImageInfo(buffer);
  if (info.format === 'Unknown') {
    return { error: 'That file does not look like a supported image (PNG, JPEG, GIF, WEBP, BMP).' };
  }

  const nameStem = fallbackName.replace(/\.[^.]+$/, '') || 'image';

  let data: any;
  try {
    data = await uploadToImgbb(buffer.toString('base64'), nameStem);
  } catch (err: any) {
    return { error: err?.message || 'imgbb upload failed.' };
  }

  const payload = buildResultPanel({
    data,
    format: info.format,
    width: info.width,
    height: info.height,
    name: fallbackName,
    size: buffer.length,
  });

  return { payload };
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  const attachment = message.attachments?.first?.() ?? null;
  const urlArg = args[0];

  let sourceUrl: string | null = null;
  let fallbackName = 'image';

  if (attachment) {
    sourceUrl = attachment.url;
    fallbackName = attachment.name || 'image';
  } else if (urlArg && isValidImageUrl(urlArg)) {
    sourceUrl = urlArg;
    fallbackName = guessNameFromUrl(urlArg);
  }

  if (!sourceUrl) {
    return sendError({ message }, 'Please attach an image or provide a direct image URL.');
  }

  const loadingMsg = await sendLoading({ message }, 'Uploading image to imgbb...');

  const fetched = await fetchImage(sourceUrl, fallbackName);
  if ('error' in fetched) {
    return sendError({ message, existingMessage: loadingMsg as any }, fetched.error);
  }

  const result = await performUpload(fetched.buffer, fetched.name);
  if ('error' in result) {
    return sendError({ message, existingMessage: loadingMsg as any }, result.error);
  }

  return (loadingMsg as any)?.edit(result.payload).catch((): null => null);
}

export async function slashExecute(interaction: any, _client: CassieClient): Promise<any> {
  const attachment: any = interaction.options.getAttachment('image') ?? null;
  const urlOption: string | null = interaction.options.getString('url') ?? null;

  let sourceUrl: string | null = null;
  let fallbackName = 'image';

  if (attachment) {
    sourceUrl = attachment.url;
    fallbackName = attachment.name || 'image';
  } else if (urlOption) {
    if (!isValidImageUrl(urlOption)) {
      return sendError({ interaction }, 'Please provide a valid `http(s)://` image URL.');
    }
    sourceUrl = urlOption;
    fallbackName = guessNameFromUrl(urlOption);
  }

  if (!sourceUrl) {
    return sendError({ interaction }, 'Please provide an image attachment or an image URL.');
  }

  await interaction.deferReply();

  const fetched = await fetchImage(sourceUrl, fallbackName);
  if ('error' in fetched) {
    return sendError({ interaction }, fetched.error);
  }

  const result = await performUpload(fetched.buffer, fetched.name);
  if ('error' in result) {
    return sendError({ interaction }, result.error);
  }

  return interaction.editReply(result.payload);
}
