import { BadRequestException } from '@nestjs/common';
import * as dns from 'dns/promises';
import * as net from 'net';

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'ip6-localhost',
  'ip6-loopback',
  'metadata.google.internal',
  'metadata.goog',
  '169.254.169.254',
]);

function ipv4ToInt(ip: string): number {
  return ip.split('.').reduce((acc, oct) => (acc << 8) + Number.parseInt(oct, 10), 0) >>> 0;
}

function inCidr4(ip: string, base: string, maskBits: number): boolean {
  const mask = maskBits === 0 ? 0 : (~0 << (32 - maskBits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

export function isPrivateOrReservedIp(rawIp: string): boolean {
  const ip = rawIp.trim().toLowerCase();
  if (!ip) return true;

  // Handle IPv4-mapped IPv6 e.g. ::ffff:127.0.0.1
  if (ip.startsWith('::ffff:')) {
    const mapped = ip.slice(7);
    if (net.isIPv4(mapped)) {
      return isPrivateOrReservedIp(mapped);
    }
  }

  if (net.isIPv4(ip)) {
    return (
      inCidr4(ip, '0.0.0.0', 8) || // Current network
      inCidr4(ip, '10.0.0.0', 8) || // RFC1918
      inCidr4(ip, '100.64.0.0', 10) || // CGNAT
      inCidr4(ip, '127.0.0.0', 8) || // Loopback
      inCidr4(ip, '169.254.0.0', 16) || // Link-local / Cloud metadata
      inCidr4(ip, '172.16.0.0', 12) || // RFC1918
      inCidr4(ip, '192.0.0.0', 24) || // IETF
      inCidr4(ip, '192.0.2.0', 24) || // TEST-NET-1
      inCidr4(ip, '192.168.0.0', 16) || // RFC1918
      inCidr4(ip, '198.18.0.0', 15) || // Benchmarking
      inCidr4(ip, '198.51.100.0', 24) || // TEST-NET-2
      inCidr4(ip, '203.0.113.0', 24) || // TEST-NET-3
      inCidr4(ip, '224.0.0.0', 4) || // Multicast
      inCidr4(ip, '240.0.0.0', 4) // Reserved
    );
  }

  if (net.isIPv6(ip)) {
    const compact = ip.split('%')[0];
    if (compact === '::' || compact === '::1') return true;
    // fc00::/7 Unique local address (fc.. or fd..)
    if (compact.startsWith('fc') || compact.startsWith('fd')) return true;
    // fe80::/10 Link-local (fe8..feb)
    if (/^fe[89ab]/i.test(compact)) return true;
    // ff00::/8 Multicast
    if (compact.startsWith('ff')) return true;
    return false;
  }

  return true;
}

export function validateSafeExternalUrl(rawUrl: string, label = 'URL'): string {
  const trimmed = rawUrl.trim().replace(/\/+$/, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new BadRequestException(`${label} không đúng định dạng URL hợp lệ (phải bắt đầu bằng https:// hoặc http://)`);
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new BadRequestException(`${label} chỉ chấp nhận giao thức https:// hoặc http://`);
  }

  if (parsed.username || parsed.password) {
    throw new BadRequestException(`${label} không được chứa thông tin xác thực trong URL`);
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    !host ||
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal')
  ) {
    throw new BadRequestException(`${label} không được trỏ tới địa chỉ nội bộ hoặc metadata`);
  }

  if (net.isIP(host) !== 0 && isPrivateOrReservedIp(host)) {
    throw new BadRequestException(`${label} không được sử dụng dải IP nội bộ / riêng tư`);
  }

  return parsed.toString().replace(/\/+$/, '');
}

export async function assertSafeOutboundUrl(rawUrl: string, label = 'Jira URL'): Promise<string> {
  const normalized = validateSafeExternalUrl(rawUrl, label);
  const parsed = new URL(normalized);
  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  if (net.isIP(host) === 0) {
    try {
      const records = await dns.lookup(host, { all: true });
      if (records.length === 0) {
        throw new BadRequestException(`Không thể phân giải tên miền cho ${label}`);
      }
      for (const rec of records) {
        if (isPrivateOrReservedIp(rec.address)) {
          throw new BadRequestException(
            `${label} phân giải về địa chỉ IP nội bộ bị chặn (${rec.address})`,
          );
        }
      }
    } catch (err) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Không thể phân giải tên miền cho ${label}`);
    }
  }

  return normalized;
}
