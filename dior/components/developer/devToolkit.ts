import { config } from '../../config.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { emojis } from '../../emojis.js';

export function buildDeveloperOutput(title: string, output: string, success = true): any {
  const icon = success ? emojis.greentick : emojis.redcross;
  const maxOutputLength = 7_500;
  const safeOutput = output.length > maxOutputLength
    ? `${output.slice(0, maxOutputLength)}\n… [output truncated]`
    : output;
  const safeCode = safeOutput.replace(/```/g, '``\u200b`');
  const outputChunks = safeCode.match(/[\s\S]{1,3800}/g) ?? ['(no output)'];
  const container = new ContainerBuilder().setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon} ${title}`))
    .addSeparatorComponents(new SeparatorBuilder());

  for (const chunk of outputChunks) {
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`\`\`\`text\n${chunk}\n\`\`\``),
    );
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}

export function buildDeveloperPanel(
  title: string,
  sections: Array<{ heading: string; body: string }>,
  success = true,
): any {
  const icon = success ? emojis.greentick : emojis.redcross;
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${icon} ${title}`))
    .addSeparatorComponents(new SeparatorBuilder());

  let addedComponents = 2;
  for (const section of sections) {
    if (addedComponents >= 38) break;
    container.addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`**${section.heading}**`),
    );
    addedComponents++;

    const body = section.body || 'No details available.';
    const chunks = body.match(/[\s\S]{1,3800}/g) ?? [body];
    for (const chunk of chunks) {
      if (addedComponents >= 38) break;
      container.addTextDisplayComponents(new TextDisplayBuilder().setContent(chunk));
      addedComponents++;
    }
  }

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] },
  };
}