import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import zlib from 'node:zlib';

// Outbound fetch for user-supplied URLs (article extraction, image proxy).
// The destination is validated on the resolved IP address, not on the hostname text, and the
// connection is made to that same validated address, so DNS answers cannot change in between.
// Redirects are followed manually and every hop is validated again.

export type SafeFetchErrorCode = 'UNSAFE_URL' | 'TOO_MANY_REDIRECTS' | 'RESPONSE_TOO_LARGE' | 'TIMEOUT' | 'BAD_RESPONSE';

export class SafeFetchError extends Error {
  constructor(public readonly code: SafeFetchErrorCode, message: string) {
    super(message);
    this.name = 'SafeFetchError';
  }
}

export interface SafeFetchInit {
  headers?: Record<string, string>;
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
}

export type SafeFetch = (url: string, init?: SafeFetchInit) => Promise<Response>;

export interface SafeFetchDependencies {
  lookup?: net.LookupFunction;
  isBlockedAddress?: (address: string) => boolean;
  allowedPorts?: number[];
}

const DEFAULT_ALLOWED_PORTS = [80, 443];
const DEFAULT_TIMEOUT_MS = 10000;
const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_MAX_REDIRECTS = 3;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const NULL_BODY_STATUSES = new Set([204, 205, 304]);
const INTERNAL_NAME_SUFFIXES = ['.localhost', '.local', '.internal'];

const blockedRanges = new net.BlockList();
for (const [prefix, bits] of [
  ['0.0.0.0', 8], // "this" network
  ['10.0.0.0', 8], // private
  ['100.64.0.0', 10], // carrier-grade NAT
  ['127.0.0.0', 8], // loopback
  ['169.254.0.0', 16], // link-local, cloud metadata
  ['172.16.0.0', 12], // private
  ['192.0.0.0', 24], // IETF protocol assignments
  ['192.0.2.0', 24], // documentation
  ['192.168.0.0', 16], // private
  ['198.18.0.0', 15], // benchmarking
  ['198.51.100.0', 24], // documentation
  ['203.0.113.0', 24], // documentation
  ['224.0.0.0', 4], // multicast
  ['240.0.0.0', 4], // reserved, broadcast
] as const) {
  blockedRanges.addSubnet(prefix, bits, 'ipv4');
}
for (const [prefix, bits] of [
  ['::', 128], // unspecified
  ['::1', 128], // loopback
  ['64:ff9b::', 96], // NAT64, embeds an IPv4 address
  ['2001::', 32], // Teredo
  ['2001:db8::', 32], // documentation
  ['2002::', 16], // 6to4, embeds an IPv4 address
  ['fc00::', 7], // unique local
  ['fe80::', 10], // link-local
  ['ff00::', 8], // multicast
] as const) {
  blockedRanges.addSubnet(prefix, bits, 'ipv6');
}

// Returns the eight 16-bit groups of an IPv6 address, or null when it cannot be parsed.
function expandIpv6(address: string): number[] | null {
  let text = address;
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    if (net.isIP(tail) !== 4) return null;
    const [a, b, c, d] = tail.split('.').map(Number);
    text = `${text.slice(0, lastColon + 1)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...rest].map((group) => Number.parseInt(group, 16));
  return groups.length === 8 && groups.every((group) => Number.isInteger(group) && group >= 0 && group <= 0xffff) ? groups : null;
}

export function isBlockedAddress(address: string): boolean {
  const family = net.isIP(address);
  if (family === 4) return blockedRanges.check(address, 'ipv4');
  if (family !== 6) return true;

  const groups = expandIpv6(address);
  if (!groups) return true;
  // IPv4-mapped (::ffff:a.b.c.d) addresses reach the IPv4 host, so the IPv4 rules decide.
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return blockedRanges.check(ipv4, 'ipv4');
  }
  return blockedRanges.check(address, 'ipv6');
}

function parsePublicHttpUrl(
  urlString: string,
  allowedPorts: number[] = DEFAULT_ALLOWED_PORTS,
  isBlocked: (address: string) => boolean = isBlockedAddress
): URL | null {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.username || parsed.password) return null;

  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  if (!allowedPorts.includes(port)) return null;

  // The URL parser already normalizes decimal, hex and octal IPv4 forms to dotted notation.
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!hostname) return null;
  if (net.isIP(hostname)) return isBlocked(hostname) ? null : parsed;
  if (hostname === 'localhost' || INTERNAL_NAME_SUFFIXES.some((suffix) => hostname.endsWith(suffix))) return null;
  return parsed;
}

// Cheap syntactic check for request validation. It does not resolve DNS: safeFetch does.
export function isPublicHttpUrl(urlString: string): boolean {
  return parsePublicHttpUrl(urlString) !== null;
}

function unsafeUrl(): SafeFetchError {
  return new SafeFetchError('UNSAFE_URL', 'The URL points to a destination that is not allowed.');
}

export function createSafeFetch(dependencies: SafeFetchDependencies = {}): SafeFetch {
  const baseLookup = (dependencies.lookup || dns.lookup) as any;
  const isBlocked = dependencies.isBlockedAddress || isBlockedAddress;
  const allowedPorts = dependencies.allowedPorts || DEFAULT_ALLOWED_PORTS;

  // Resolves the hostname, rejects the whole answer if any address is internal, and hands the
  // validated addresses to the socket so it connects to exactly what was checked.
  const guardedLookup: any = (hostname: string, options: any, callback: any) => {
    baseLookup(hostname, { ...options, all: true }, (error: Error | null, result: any, family?: number) => {
      if (error) return callback(error);
      const addresses: Array<{ address: string; family: number }> = Array.isArray(result) ? result : [{ address: result, family: family || 4 }];
      if (addresses.length === 0 || addresses.some((entry) => isBlocked(entry.address))) return callback(unsafeUrl());
      return options?.all ? callback(null, addresses) : callback(null, addresses[0].address, addresses[0].family);
    });
  };

  function requestOnce(target: URL, headers: Record<string, string>, maxBytes: number, signal: AbortSignal) {
    return new Promise<{ status: number; statusText: string; headers: http.IncomingHttpHeaders; body: Buffer }>((resolve, reject) => {
      const transport = target.protocol === 'https:' ? https : http;
      const request = transport.request(target, { method: 'GET', headers, agent: false, lookup: guardedLookup }, (response) => {
        const status = response.statusCode || 0;
        const finish = (body: Buffer) => {
          signal.removeEventListener('abort', onAbort);
          resolve({ status, statusText: response.statusMessage || '', headers: response.headers, body });
        };

        if (REDIRECT_STATUSES.has(status) && response.headers.location) {
          response.resume();
          request.destroy();
          return finish(Buffer.alloc(0));
        }
        if (Number(response.headers['content-length']) > maxBytes) {
          return fail(new SafeFetchError('RESPONSE_TOO_LARGE', 'The remote response exceeds the allowed size.'));
        }

        const encoding = String(response.headers['content-encoding'] || '').toLowerCase();
        const decoder =
          encoding === 'gzip' || encoding === 'x-gzip' ? zlib.createGunzip()
          : encoding === 'deflate' ? zlib.createInflate()
          : encoding === 'br' ? zlib.createBrotliDecompress()
          : null;
        const stream = decoder ? response.pipe(decoder) : response;
        if (decoder) {
          response.on('error', fail);
          delete response.headers['content-encoding'];
          delete response.headers['content-length'];
        }

        // The limit applies to decoded bytes, so a small compressed body cannot expand past it.
        const chunks: Buffer[] = [];
        let received = 0;
        stream.on('data', (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) return fail(new SafeFetchError('RESPONSE_TOO_LARGE', 'The remote response exceeds the allowed size.'));
          chunks.push(chunk);
        });
        stream.on('end', () => finish(Buffer.concat(chunks)));
        stream.on('error', fail);
      });

      function fail(error: Error) {
        signal.removeEventListener('abort', onAbort);
        request.destroy();
        reject(error);
      }
      function onAbort() {
        fail(new SafeFetchError('TIMEOUT', 'The remote server did not respond in time.'));
      }

      if (signal.aborted) return onAbort();
      signal.addEventListener('abort', onAbort, { once: true });
      request.on('error', fail);
      request.end();
    });
  }

  return async function safeFetch(url, init = {}) {
    const maxRedirects = init.maxRedirects ?? DEFAULT_MAX_REDIRECTS;
    const maxBytes = init.maxBytes ?? DEFAULT_MAX_BYTES;
    const signal = AbortSignal.timeout(init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const headers: Record<string, string> = { 'Accept-Encoding': 'gzip, deflate, br', ...init.headers };

    let current = url;
    for (let redirects = 0; ; redirects += 1) {
      const target = parsePublicHttpUrl(current, allowedPorts, isBlocked);
      if (!target) throw unsafeUrl();

      const result = await requestOnce(target, headers, maxBytes, signal);
      const location = result.headers.location;
      if (REDIRECT_STATUSES.has(result.status) && location) {
        if (redirects >= maxRedirects) throw new SafeFetchError('TOO_MANY_REDIRECTS', 'The remote server redirected too many times.');
        try {
          current = new URL(location, target).toString();
        } catch {
          throw unsafeUrl();
        }
        continue;
      }

      if (result.status < 200 || result.status > 599) {
        throw new SafeFetchError('BAD_RESPONSE', `The remote server returned an unsupported status (${result.status}).`);
      }
      const responseHeaders = new Headers();
      for (const [name, value] of Object.entries(result.headers)) {
        for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) responseHeaders.append(name, item);
      }
      return new Response(NULL_BODY_STATUSES.has(result.status) ? null : (result.body as unknown as BodyInit), {
        status: result.status,
        statusText: result.statusText,
        headers: responseHeaders,
      });
    }
  };
}

export const safeFetch = createSafeFetch();
