// xoxo/slashCommands/utility/react.ts
import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('react')
  .setDescription('React to a message with one or more emojis.')
  .addStringOption((o) =>
    o.setName('message_id')
      .setDescription('The ID of the message to react to.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('emoji')
      .setDescription('One or more emojis, separated by spaces.')
      .setRequired(true),
  );
