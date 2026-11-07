import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('trustedadmin')
  .setDescription("Manage this server's trusted administrators. Only the server owner can use it.")
  .addSubcommand((sc) =>
    sc.setName('add')
      .setDescription('Give a server member delegated bulk-moderation access.')
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The member to add as a trusted administrator.')
          .setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('remove')
      .setDescription("Revoke a member's trusted administrator access.")
      .addUserOption((o) =>
        o.setName('user')
          .setDescription('The trusted administrator to remove.')
          .setRequired(true),
      ),
  )
  .addSubcommand((sc) =>
    sc.setName('list')
      .setDescription("List this server's trusted administrators."),
  );
