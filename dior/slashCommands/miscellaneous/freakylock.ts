import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('freakylock')
  .setDescription('Toggle a server-wide fancy-script text lock for a member.')
  .addUserOption((option) =>
    option.setName('user').setDescription('Member to lock or unlock.').setRequired(true),
  );
