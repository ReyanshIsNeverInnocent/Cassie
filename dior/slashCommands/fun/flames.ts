import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('flames')
  .setDescription('Find the FLAMES result for two names.')
  .addStringOption((o) =>
    o.setName('first')
      .setDescription('First name or user mention.')
      .setRequired(true),
  )
  .addStringOption((o) =>
    o.setName('second')
      .setDescription('Second name or user mention.')
      .setRequired(true),
  );
