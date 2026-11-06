import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('masskick')
  .setDescription('Kick multiple members at once (max 50; server owner only).')
  .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
  .addStringOption((o) =>
    o.setName('users')
      .setDescription('Space-separated mentions, IDs, or usernames. Quote names containing spaces.')
      .setRequired(true),
  );
