import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('disconnect')
  .setDescription('Disconnect one or more members from their voice channels. Defaults to yourself.')
  .setDefaultMemberPermissions(PermissionFlagsBits.MoveMembers)
  .addUserOption((o) =>
    o.setName('user')
      .setDescription('Member to disconnect. Defaults to you.')
      .setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('additional_users')
      .setDescription('Additional member mentions or IDs, separated by spaces.')
      .setRequired(false),
  );
