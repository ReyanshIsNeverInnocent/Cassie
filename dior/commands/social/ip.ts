import type { CassieClient } from '../../structures/CassieClient.js';
import { sendError, sendLoading } from '../../components/statusMessages.js';
import { sendWrongUsage } from '../../components/wrongUsage.js';
import {
  ContainerBuilder,
  MessageFlags,
  SeparatorBuilder,
  TextDisplayBuilder,
} from 'discord.js';
import { config } from '../../config.js';
import {
  checkAbuseIpDb,
  fetchIpMetadata,
  getCurrentPublicIp,
  getIpv4Subnet,
  IpLookupError,
  parseIpInput,
  reverseDnsLookup,
  scanOpenPorts,
} from '../../helpers/ip.js';

export const options = {
  name: 'ip',
  aliases: ['iplookup', 'ipinfo'] as string[],
  description: 'Look up an IP address, ASN, PTR, ports, subnet, and abuse reports.',
  usage: [
    'ip lookup [ip]',
    'ip whois [ip]',
    'ip asn [ip]',
    'ip ptr [ip]',
    'ip ports [ip]',
    'ip subnet <ipv4/cidr>',
    'ip abuse [ip]',
  ].join('\n'),
  category: 'socials',
  owner: false,
  cooldown: 5,
};

function resolveString(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.trim() || null;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const joined = value.map((item) => resolveString(item)).filter((item): item is string => Boolean(item)).join(', ');
    return joined || null;
  }
  if (typeof value === 'object') {
    const candidate =
      (value as any)?.id ??
      (value as any)?.name ??
      (value as any)?.org ??
      (value as any)?.isp ??
      (value as any)?.country ??
      (value as any)?.region ??
      (value as any)?.city ??
      (value as any)?.timezone ??
      (value as any)?.value ??
      (value as any)?.domain ??
      (value as any)?.asn ??
      (value as any)?.abbr ??
      (value as any)?.emoji ??
      null;

    if (candidate != null) return resolveString(candidate);

    const fallback = Object.values(value as Record<string, unknown>).map((entry) => resolveString(entry)).filter((entry): entry is string => Boolean(entry)).join(', ');
    return fallback || null;
  }
  return null;
}

function clean(value: unknown): string {
  return resolveString(value) ?? 'Unknown';
}

function buildIpCv2(title: string, bodyLines: string[]) {
  const container = new ContainerBuilder()
    .setAccentColor(parseInt(config.defaultAccentColor.replace('#', ''), 16))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}`))
    .addSeparatorComponents(new SeparatorBuilder().setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(bodyLines.join('\n')));

  return {
    components: [container],
    flags: MessageFlags.IsComponentsV2,
    allowedMentions: { parse: [] as string[] },
  } as any;
}

function formatIpSummary(data: any): string {
  const lines = [
    `**IP:** ${clean(data?.ip)}`,
    `**Type:** ${clean(data?.type)}`,
    `**Country:** ${clean(data?.country)}`,
    `**Region:** ${clean(data?.region)}`,
    `**City:** ${clean(data?.city)}`,
    `**Timezone:** ${clean(data?.timezone)}`,
    `**ISP / Org:** ${clean(data?.isp ?? data?.org)}`,
    `**ASN:** ${clean(data?.asn)}`,
    `**Hostname:** ${clean(data?.hostname)}`,
    `**Coordinates:** ${typeof data?.latitude === 'number' && typeof data?.longitude === 'number' ? `${data.latitude.toFixed(3)}, ${data.longitude.toFixed(3)}` : 'Unknown'}`,
  ];
  return lines.join('\n');
}

async function runLookup(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const data = await fetchIpMetadata(ip);
  return formatIpSummary(data);
}

async function runWhois(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const data = await fetchIpMetadata(ip);
  return [
    `**WHOIS for ${ip}**`,
    `**Country:** ${clean(data.country)}`,
    `**Region:** ${clean(data.region)}`,
    `**City:** ${clean(data.city)}`,
    `**ISP / Org:** ${clean(data.isp ?? data.org)}`,
    `**ASN:** ${clean(data.asn)}`,
    `**Hostname:** ${clean(data.hostname)}`,
    `**Connection:** ${clean(data.connection)}`,
  ].join('\n');
}

async function runAsn(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const data = await fetchIpMetadata(ip);
  return [
    `**ASN lookup for ${ip}**`,
    `**ASN:** ${clean(data.asn)}`,
    `**ISP / Org:** ${clean(data.isp ?? data.org)}`,
    `**Connection:** ${clean(data.connection)}`,
    `**Country:** ${clean(data.country)}`,
  ].join('\n');
}

async function runPtr(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const record = await reverseDnsLookup(ip);
  return `**PTR lookup for ${ip}**\n${record}`;
}

async function runPorts(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const results = await scanOpenPorts(ip, [80, 443, 22, 21, 25, 53, 110, 143, 3306, 3389, 8080, 8443, 587, 993, 995]);

  if (!results.length) {
    return `**Port scan for ${ip}**\nNo common ports were open.`;
  }

  return [
    `**Port scan for ${ip}**`,
    ...results.map((entry: any) => `- ${entry.port} (${entry.service})`),
  ].join('\n');
}

async function runSubnet(cidr: string): Promise<string> {
  const info = getIpv4Subnet(cidr);
  const hosts = info.usableHosts.length ? info.usableHosts.slice(0, 10).join(', ') + (info.usableHosts.length > 10 ? ` ... (${info.usableHosts.length} total)` : '') : 'None';

  return [
    `**Subnet for ${info.input}**`,
    `**CIDR:** ${info.cidr}`,
    `**Network:** ${info.networkAddress}`,
    `**Broadcast:** ${info.broadcastAddress}`,
    `**Netmask:** ${info.mask}`,
    `**First usable:** ${info.firstUsable ?? 'N/A'}`,
    `**Last usable:** ${info.lastUsable ?? 'N/A'}`,
    `**Usable hosts:** ${hosts}`,
  ].join('\n');
}

async function runAbuse(target?: string): Promise<string> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const data = await checkAbuseIpDb(ip);

  return [
    `**AbuseIPDB check for ${ip}**`,
    `**Confidence score:** ${data.abuseConfidenceScore}/100`,
    `**Total reports:** ${data.totalReports}`,
    `**Distinct reporters:** ${data.numDistinctUsers}`,
    `**Country:** ${clean(data.countryName)} (${clean(data.countryCode)})`,
    `**ISP:** ${clean(data.isp)}`,
    `**Usage type:** ${clean(data.usageType)}`,
    `**Last reported:** ${clean(data.lastReportedAt)}`,
    `**Categories:** ${data.categories.length ? data.categories.join(', ') : 'None'}`,
  ].join('\n');
}

export async function prefixExecute(
  message: any,
  args: string[],
  _client: CassieClient,
): Promise<any> {
  if (!args.length) {
    const loading = await sendLoading({ message }, 'Looking up your current public IP…');
    try {
      const content = await runLookup();
      const loadingMessage = loading as any;
      await loadingMessage?.delete?.().catch((): null => null);
      return message.channel.send(buildIpCv2('IP lookup', content.split('\n')));
    } catch (error: unknown) {
      const loadingMessage = loading as any;
      await loadingMessage?.delete?.().catch((): null => null);
      return sendError({ message }, error instanceof Error ? error.message : 'IP lookup failed.');
    }
  }

  const action = args[0].toLowerCase();
  const target = args.slice(1).join(' ').trim();

  if (!['lookup', 'whois', 'asn', 'ptr', 'ports', 'subnet', 'abuse'].includes(action)) {
    const ipLike = args.join(' ');
    const loading = await sendLoading({ message }, `Looking up IP **${ipLike}**…`);
    try {
      const content = await runLookup(ipLike);
      const loadingMessage = loading as any;
      await loadingMessage?.delete?.().catch((): null => null);
      return message.channel.send(buildIpCv2('IP lookup', content.split('\n')));
    } catch (error: unknown) {
      const loadingMessage = loading as any;
      await loadingMessage?.delete?.().catch((): null => null);
      return sendError({ message }, error instanceof Error ? error.message : 'IP lookup failed.');
    }
  }

  const loading = await sendLoading({ message }, `Running **${action}** lookup…`);

  try {
    let content: string;

    switch (action) {
      case 'lookup':
        content = await runLookup(target || undefined);
        break;
      case 'whois':
        content = await runWhois(target || undefined);
        break;
      case 'asn':
        content = await runAsn(target || undefined);
        break;
      case 'ptr':
        if (!target) throw new IpLookupError('invalid-input', 'Please provide an IP address for this PTR lookup.');
        content = await runPtr(target);
        break;
      case 'ports':
        if (!target) throw new IpLookupError('invalid-input', 'Please provide an IP address for this port scan.');
        content = await runPorts(target);
        break;
      case 'subnet':
        if (!target) throw new IpLookupError('invalid-input', 'Please provide an IPv4 CIDR such as 192.168.1.10/24.');
        content = await runSubnet(target);
        break;
      case 'abuse':
        if (!target) throw new IpLookupError('invalid-input', 'Please provide an IP address for AbuseIPDB.');
        content = await runAbuse(target);
        break;
      default:
        return sendWrongUsage({ message }, options.name, options.usage);
    }

    const loadingMessage = loading as any;
    await loadingMessage?.delete?.().catch((): null => null);
    return message.channel.send(buildIpCv2(action.toUpperCase(), content.split('\n')));
  } catch (error: unknown) {
    const loadingMessage = loading as any;
    await loadingMessage?.delete?.().catch((): null => null);
    return sendError({ message }, error instanceof Error ? error.message : 'IP lookup failed.');
  }
}
