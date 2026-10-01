import net from 'node:net';
import dns from 'node:dns/promises';

export type IpVersion = 'ipv4' | 'ipv6';

export interface ParsedIpInput {
  raw: string;
  value: string;
  version: IpVersion;
}

export interface Ipv4SubnetInfo {
  input: string;
  networkAddress: string;
  broadcastAddress: string;
  subnetMask: string;
  mask: string;
  cidr: string;
  totalAddresses: number;
  usableHosts: string[];
  firstUsable: string | null;
  lastUsable: string | null;
}

export interface PortScanResult {
  port: number;
  service: string;
  status: 'open' | 'closed';
}

export class IpLookupError extends Error {
  public readonly code: 'invalid-input' | 'api' | 'not-found' | 'rate-limited';

  constructor(code: 'invalid-input' | 'api' | 'not-found' | 'rate-limited', message: string) {
    super(message);
    this.name = 'IpLookupError';
    this.code = code;
  }
}

function normalizeInput(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) throw new IpLookupError('invalid-input', 'Please provide an IP address or CIDR range.');
  return trimmed.replace(/^\[|\]$/g, '');
}

function isValidIpv4(value: string): boolean {
  if (!/^(\d{1,3}\.){3}\d{1,3}$/.test(value)) return false;
  return value.split('.').every((part) => {
    if (!part) return false;
    const num = Number(part);
    return Number.isInteger(num) && num >= 0 && num <= 255;
  });
}

function isValidIpv6(value: string): boolean {
  if (!value) return false;
  const normalized = value.replace(/\s+/g, '');
  if (normalized === '::') return true;
  if (normalized.includes('::')) {
    const [left, right] = normalized.split('::');
    const leftParts = left ? left.split(':').filter(Boolean) : [];
    const rightParts = right ? right.split(':').filter(Boolean) : [];
    const total = leftParts.length + rightParts.length;
    if (total > 7) return false;
    return leftParts.concat(rightParts).every((part) => /^[0-9A-Fa-f]{1,4}$/.test(part));
  }
  return normalized.split(':').every((part) => /^[0-9A-Fa-f]{1,4}$/.test(part)) && normalized.split(':').length === 8;
}

export function parseIpInput(raw: string): ParsedIpInput {
  const value = normalizeInput(raw);
  if (isValidIpv4(value)) return { raw: value, value, version: 'ipv4' };
  if (isValidIpv6(value)) return { raw: value, value: value.toLowerCase(), version: 'ipv6' };
  throw new IpLookupError('invalid-input', `**${raw}** is not a valid IPv4 or IPv6 address.`);
}

function ipv4ToInt(value: string): number {
  const octets = value.split('.').map(Number);
  return ((octets[0] << 24) >>> 0) + ((octets[1] << 16) >>> 0) + ((octets[2] << 8) >>> 0) + octets[3];
}

function intToIpv4(value: number): string {
  return [
    (value >>> 24) & 255,
    (value >>> 16) & 255,
    (value >>> 8) & 255,
    value & 255,
  ].join('.');
}

export function getIpv4Subnet(input: string): Ipv4SubnetInfo {
  const trimmed = normalizeInput(input);
  if (!trimmed.includes('/')) {
    throw new IpLookupError('invalid-input', 'Subnet input must look like 192.168.1.10/24 or 10.0.0.1/8.');
  }

  const [rawIp, rawBits] = trimmed.split('/');
  const ip = parseIpInput(rawIp).value;
  const bits = Number.parseInt(rawBits, 10);

  if (!Number.isInteger(bits) || bits < 0 || bits > 32 || !isValidIpv4(ip)) {
    throw new IpLookupError('invalid-input', `**${input}** is not a valid IPv4 CIDR range.`);
  }

  const ipInt = ipv4ToInt(ip);
  const maskInt = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  const netInt = ipInt & maskInt;
  const broadcastInt = netInt | (~maskInt >>> 0);

  const usable: string[] = [];
  const start = bits >= 31 ? netInt : netInt + 1;
  const end = bits >= 31 ? broadcastInt : broadcastInt - 1;
  for (let current = start; current <= end; current++) {
    usable.push(intToIpv4(current >>> 0));
  }

  return {
    input: trimmed,
    networkAddress: intToIpv4(netInt >>> 0),
    broadcastAddress: intToIpv4(broadcastInt >>> 0),
    subnetMask: intToIpv4(maskInt >>> 0),
    mask: intToIpv4(maskInt >>> 0),
    cidr: `${ip}/${bits}`,
    totalAddresses: Math.max(1, 2 ** (32 - bits)),
    usableHosts: usable,
    firstUsable: usable[0] ?? (bits >= 31 ? intToIpv4(netInt >>> 0) : null),
    lastUsable: usable[usable.length - 1] ?? (bits >= 31 ? intToIpv4(broadcastInt >>> 0) : null),
  };
}

async function fetchJson<T>(url: string, headers: Record<string, string> = {}): Promise<T> {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      ...headers,
    },
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    const body = await response.json().catch((): any => null) as any;
    throw new IpLookupError('api', body?.message ?? `HTTP ${response.status}`);
  }

  return response.json() as Promise<T>;
}

export async function lookupIpWhois(target?: string): Promise<any> {
  const query = target?.trim();
  const url = query ? `https://ipwho.is/${encodeURIComponent(query)}` : 'https://ipwho.is/';
  const data = await fetchJson<any>(url);
  if (data?.success === false) {
    throw new IpLookupError('not-found', data.message ?? 'IP lookup failed.');
  }
  return data;
}

export async function getCurrentPublicIp(): Promise<string> {
  try {
    const data = await lookupIpWhois();
    if (data?.ip) return data.ip;
  } catch {
    // fallback below
  }

  try {
    const data = await fetchJson<any>('https://ipinfo.io/json');
    if (data?.ip) return data.ip;
  } catch {
    throw new IpLookupError('api', 'Could not determine the current public IP address.');
  }

  throw new IpLookupError('api', 'Could not determine the current public IP address.');
}

export async function fetchIpMetadata(target?: string): Promise<any> {
  const ip = target && target.trim() ? parseIpInput(target).value : await getCurrentPublicIp();
  const data = await lookupIpWhois(ip);
  return {
    ...data,
    ip: data?.ip ?? ip,
    asn: data?.asn ?? data?.connection?.asn ?? null,
    isp: data?.isp ?? data?.connection?.isp ?? null,
    connection: data?.connection?.org ?? data?.connection?.isp ?? null,
    timezone: data?.timezone?.id ?? data?.timezone ?? null,
  };
}

export async function reverseDnsLookup(ip: string): Promise<string> {
  const parsed = parseIpInput(ip).value;
  const results = await dns.reverse(parsed).catch(() => [] as string[]);
  return results.length ? results.join(', ') : 'No reverse DNS record found.';
}

function portServiceName(port: number): string {
  const names: Record<number, string> = {
    21: 'FTP',
    22: 'SSH',
    25: 'SMTP',
    53: 'DNS',
    80: 'HTTP',
    110: 'POP3',
    143: 'IMAP',
    443: 'HTTPS',
    587: 'SMTP Alt',
    993: 'IMAPS',
    995: 'POP3S',
    3306: 'MySQL',
    3389: 'RDP',
    8080: 'HTTP Alt',
    8443: 'HTTPS Alt',
  };
  return names[port] ?? 'Custom';
}

export async function scanOpenPorts(ip: string, ports: number[] = [80, 443, 22, 21, 25, 53, 110, 143, 3306, 3389, 8080, 8443, 587, 993, 995]): Promise<PortScanResult[]> {
  const target = parseIpInput(ip).value;
  const results: PortScanResult[] = [];

  for (const port of ports) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 700);

      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      socket.once('timeout', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
      socket.once('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
      socket.connect({ host: target, port });
    });

    results.push({ port, service: portServiceName(port), status: isOpen ? 'open' : 'closed' });
  }

  return results.filter((entry) => entry.status === 'open');
}

export async function scanCommonPorts(ip: string): Promise<{ ip: string; openPorts: number[]; closedPorts: number[]; scannedPorts: number[] }> {
  const ports = [80, 443, 22, 21, 25, 53, 110, 143, 3306, 3389, 8080, 8443, 587, 993, 995];
  const openPorts: number[] = [];
  const closedPorts: number[] = [];
  const target = parseIpInput(ip).value;

  for (const port of ports) {
    const isOpen = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timeout = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 700);

      socket.once('connect', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => {
        clearTimeout(timeout);
        socket.destroy();
        resolve(false);
      });
      socket.connect({ host: target, port });
    });

    if (isOpen) openPorts.push(port);
    else closedPorts.push(port);
  }

  return { ip: target, openPorts, closedPorts, scannedPorts: ports };
}

export async function checkAbuseIp(ip: string): Promise<any> {
  return checkAbuseIpDb(ip);
}

export async function checkAbuseIpDb(ip: string): Promise<any> {
  const apiKey = process.env.ABUSEIPDB_API_KEY?.trim();
  if (!apiKey) {
    throw new IpLookupError('api', 'AbuseIPDB is not configured. Add ABUSEIPDB_API_KEY to the bot environment.');
  }

  const target = parseIpInput(ip).value;
  const url = `https://api.abuseipdb.com/api/v2/check?ipAddress=${encodeURIComponent(target)}&maxAgeInDays=90`;
  const data = await fetchJson<any>(url, {
    Key: apiKey,
    'User-Agent': 'Cassie Discord Bot',
  });

  if (!data?.data) {
    throw new IpLookupError('api', 'AbuseIPDB did not return data for that IP.');
  }

  return {
    ipAddress: data.data.ipAddress ?? target,
    countryCode: data.data.countryCode ?? null,
    countryName: data.data.countryName ?? null,
    abuseConfidenceScore: Number(data.data.abuseConfidenceScore ?? 0),
    totalReports: Number(data.data.totalReports ?? 0),
    lastReportedAt: data.data.lastReportedAt ?? null,
    numDistinctUsers: Number(data.data.numDistinctUsers ?? 0),
    domain: data.data.domain ?? null,
    hostnames: Array.isArray(data.data.hostnames) ? data.data.hostnames.filter(Boolean) : [],
    usageType: data.data.usageType ?? null,
    isp: data.data.isp ?? null,
    asn: data.data.asn ?? null,
    isWhitelisted: Boolean(data.data.isWhitelisted),
    categories: Array.isArray(data.data.categories) ? data.data.categories.filter(Boolean).map(String) : [],
  };
}
