// xoxo/slashCommands/utility/ghostping.ts
import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ghostping')
  .setDescription('Ghost-ping users or a role — pings them and immediately deletes the message.')
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
  .addUserOption((o) =>
    o.setName('user').setDescription('User to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user2').setDescription('Second user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user3').setDescription('Third user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user4').setDescription('Fourth user to ghost-ping.').setRequired(false),
  )
  .addUserOption((o) =>
    o.setName('user5').setDescription('Fifth user to ghost-ping.').setRequired(false),
  )
  .addStringOption((o) =>
    o.setName('role').setDescription('Role mention, ID, or name to ghost-ping.').setRequired(false),
  );
