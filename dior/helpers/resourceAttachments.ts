import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AttachmentBuilder } from 'discord.js';

const resourceDirectory = fileURLToPath(new URL('../resources/', import.meta.url));

export function getResourcePath(resource: string): string {
  return join(resourceDirectory, resource);
}

export function getResourceAttachment(resource: string): AttachmentBuilder {
  return new AttachmentBuilder(readFileSync(getResourcePath(resource)), {
    name: basename(resource),
  });
}

export function getResourceAttachmentUrl(resource: string): string {
  return `attachment://${basename(resource)}`;
}
