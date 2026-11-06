import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('uwulock')
  .setDescription('Toggle a server-wide UwU text lock for a member.')
  .addUserOption((option) =>
    option.setName('user').setDescription('Member to lock or unlock.').setRequired(true),
  );
