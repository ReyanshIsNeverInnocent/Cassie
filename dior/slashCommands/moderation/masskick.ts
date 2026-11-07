import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('masskick')
  .setDescription('Kick multiple members at once (max 50; server owner or trusted administrator only).')
  .addStringOption((o) =>
    o.setName('users')
      .setDescription('Space-separated mentions, IDs, or usernames. Quote names containing spaces.')
      .setRequired(true),
  );
