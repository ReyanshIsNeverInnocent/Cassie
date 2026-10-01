import { SlashCommandBuilder } from 'discord.js';

export const data = new SlashCommandBuilder()
  .setName('ip')
  .setDescription('Look up IP details, PTR records, subnet data, and abuse reports.')
  .addSubcommand((sub) =>
    sub
      .setName('lookup')
      .setDescription('Look up IP metadata for an IP address or your current public IP.')
      .addStringOption((option) =>
        option.setName('target').setDescription('IPv4, IPv6, or blank to use the current public IP.').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('whois')
      .setDescription('Look up IP ownership and location details.')
      .addStringOption((option) =>
        option.setName('target').setDescription('IPv4, IPv6, or blank to use the current public IP.').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('asn')
      .setDescription('Show ASN and network ownership information for an IP.')
      .addStringOption((option) =>
        option.setName('target').setDescription('IPv4, IPv6, or blank to use the current public IP.').setRequired(false),
      ),
  )
  .addSubcommand((sub) =>
    sub
      .setName('ptr')
      .setDescription('Run a reverse DNS lookup for an IP.')
      .addStringOption((option) => option.setName('target').setDescription('The IPv4 or IPv6 address to check.').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('ports')
      .setDescription('Scan common ports on an IP address.')
      .addStringOption((option) => option.setName('target').setDescription('The IPv4 or IPv6 address to scan.').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('subnet')
      .setDescription('Calculate IPv4 subnet data from a CIDR range.')
      .addStringOption((option) => option.setName('target').setDescription('IPv4 CIDR such as 192.168.1.10/24.').setRequired(true)),
  )
  .addSubcommand((sub) =>
    sub
      .setName('abuse')
      .setDescription('Check AbuseIPDB reports for an IP address.')
      .addStringOption((option) => option.setName('target').setDescription('The IPv4 or IPv6 address to check.').setRequired(true)),
  );
