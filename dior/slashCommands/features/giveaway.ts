import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('giveaway')
  .setDescription('Start, edit, end, cancel, reroll, list, or inspect giveaway entries.')
  .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild | PermissionFlagsBits.Administrator)
  .addSubcommand((subcommand) => subcommand
    .setName('start')
    .setDescription('Start a giveaway in this channel.')
    .addStringOption((option) => option
      .setName('duration')
      .setDescription('Duration, such as 30m, 1h, or 2d (maximum 365 days).')
      .setRequired(true))
    .addIntegerOption((option) => option
      .setName('winners')
      .setDescription('Number of winners (1–20).')
      .setMinValue(1)
      .setMaxValue(20)
      .setRequired(true))
    .addStringOption((option) => option
      .setName('prize')
      .setDescription('What is being given away?')
      .setMaxLength(256)
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('edit')
    .setDescription('Edit an ongoing giveaway.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('end')
    .setDescription('End an active giveaway early.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('cancel')
    .setDescription('Cancel an active giveaway without selecting winners.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('reroll')
    .setDescription('Choose new winner(s) for an ended giveaway.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('list')
    .setDescription('List active giveaways in this server.'))
  .addSubcommand((subcommand) => subcommand
    .setName('participants')
    .setDescription('Show a paginated list of participants for a giveaway.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)))
  .addSubcommand((subcommand) => subcommand
    .setName('entries')
    .setDescription('Show a paginated list of entries for a giveaway.')
    .addStringOption((option) => option
      .setName('message_id')
      .setDescription('The giveaway message ID or URL.')
      .setRequired(true)));