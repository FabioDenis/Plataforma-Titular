import assert from 'node:assert/strict';
import { createServer, type RequestListener } from 'node:http';
import test from 'node:test';
import { createSafeFetch, isBlockedAddress, isPublicHttpUrl, SafeFetchError } from './safe-fetch';

// Fake resolver: no test in this file touches real DNS or the network.
function fakeLookup(table: Record<string, string>) {
  let calls = 0;
  const lookup: any = (hostname: string, options: any, callback: any) => {
    calls += 1;
    const address = table[hostname];
    if (!address) {
      const error: any = new Error(`getaddrinfo ENOTFOUND ${hostname}`);
      error.code = 'ENOTFOUND';
      return callback(error);
    }
    const family = address.includes(':') ? 6 : 4;
    return options?.all ? callback(null, [{ address, family }]) : callback(null, address, family);
  };
  return { lookup, calls: () => calls };
}

async function withOrigin(handler: RequestListener, run: (port: number, hits: () => number) => Promise<void>) {
  let hits = 0;
  const server = createServer((req, res) => {
    hits += 1;
    handler(req, res);
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  try {
    await run(port, () => hits);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

// The local origin lives on loopback, so these tests exempt exactly that address and port.
function localFetch(port: number, table: Record<string, string>) {
  return createSafeFetch({
    lookup: fakeLookup(table).lookup,
    isBlockedAddress: (address) => address !== '127.0.0.1' && isBlockedAddress(address),
    allowedPorts: [port],
  });
}

async function rejectsWith(promise: Promise<unknown>, code: string) {
  await assert.rejects(promise, (error: any) => {
    assert.ok(error instanceof SafeFetchError, `expected SafeFetchError, got ${error}`);
    assert.equal(error.code, code);
    return true;
  });
}

test('private, loopback, link-local and reserved addresses are blocked', () => {
  for (const address of [
    '127.0.0.1', '127.8.8.8', '0.0.0.0', '10.1.2.3', '172.16.0.1', '172.25.10.10', '172.31.255.255',
    '192.168.1.1', '169.254.169.254', '100.64.0.1', '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1',
    '::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:a9fe:a9fe', '64:ff9b::a9fe:a9fe',
    'not-an-ip',
  ]) {
    assert.equal(isBlockedAddress(address), true, address);
  }
});

test('public addresses are allowed', () => {
  for (const address of ['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isBlockedAddress(address), false, address);
  }
});

test('isPublicHttpUrl rejects non-http schemes, internal literals, internal names and other ports', () => {
  for (const url of [
    'ftp://example.com/a', 'file:///etc/passwd', 'not a url',
    'http://127.0.0.1/', 'http://2130706433/', 'http://0x7f.1/', 'http://[::1]/', 'http://[::ffff:127.0.0.1]/',
    'http://169.254.169.254/computeMetadata/v1/', 'http://172.25.0.1/', 'http://localhost/', 'http://api.localhost/',
    'http://metadata.google.internal/', 'http://printer.local/', 'http://example.com:8080/', 'https://example.com:22/',
    'http://user:pass@example.com/',
  ]) {
    assert.equal(isPublicHttpUrl(url), false, url);
  }
  for (const url of ['https://example.com/news/1', 'http://example.com/', 'https://example.com:443/a', 'http://8.8.8.8/']) {
    assert.equal(isPublicHttpUrl(url), true, url);
  }
});

test('a private IP literal is rejected before any DNS lookup or connection', async () => {
  const dns = fakeLookup({});
  const safeFetch = createSafeFetch({ lookup: dns.lookup });
  await rejectsWith(safeFetch('http://169.254.169.254/computeMetadata/v1/'), 'UNSAFE_URL');
  await rejectsWith(safeFetch('http://172.25.0.1/'), 'UNSAFE_URL');
  assert.equal(dns.calls(), 0);
});

test('a public hostname that resolves to a private address is rejected', async () => {
  const safeFetch = createSafeFetch({ lookup: fakeLookup({ 'rebind.example.test': '10.0.0.5' }).lookup });
  await rejectsWith(safeFetch('http://rebind.example.test/'), 'UNSAFE_URL');
});

test('a public hostname that resolves to an IPv4-mapped loopback address is rejected', async () => {
  const safeFetch = createSafeFetch({ lookup: fakeLookup({ 'mapped.example.test': '::ffff:127.0.0.1' }).lookup });
  await rejectsWith(safeFetch('http://mapped.example.test/'), 'UNSAFE_URL');
});

test('a public URL is fetched and returned as a standard Response', async () => {
  await withOrigin((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'x-seen-agent': String(req.headers['user-agent']) });
    res.end('<html>ok</html>');
  }, async (port) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    const response = await safeFetch(`http://news.example.test:${port}/article`, { headers: { 'User-Agent': 'unit-test' } });
    assert.equal(response.status, 200);
    assert.equal(response.ok, true);
    assert.equal(response.headers.get('content-type'), 'text/html; charset=utf-8');
    assert.equal(response.headers.get('x-seen-agent'), 'unit-test');
    assert.equal(await response.text(), '<html>ok</html>');
  });
});

test('a redirect to a public URL is followed', async () => {
  await withOrigin((req, res) => {
    if (req.url === '/old') {
      res.writeHead(302, { location: '/new' });
      return res.end();
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    return res.end('moved here');
  }, async (port) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    const response = await safeFetch(`http://news.example.test:${port}/old`);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), 'moved here');
  });
});

test('a redirect to an internal address is rejected without requesting it', async () => {
  await withOrigin((_req, res) => {
    res.writeHead(302, { location: 'http://169.254.169.254/computeMetadata/v1/' });
    res.end();
  }, async (port, hits) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    await rejectsWith(safeFetch(`http://news.example.test:${port}/`), 'UNSAFE_URL');
    assert.equal(hits(), 1);
  });
});

test('a redirect to a hostname that resolves to a private address is rejected', async () => {
  await withOrigin((_req, res) => {
    res.writeHead(301, { location: `http://internal.example.test:${(_req.socket.localPort)}/admin` });
    res.end();
  }, async (port, hits) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1', 'internal.example.test': '10.0.0.5' });
    await rejectsWith(safeFetch(`http://news.example.test:${port}/`), 'UNSAFE_URL');
    assert.equal(hits(), 1);
  });
});

test('a redirect chain longer than the limit is rejected', async () => {
  await withOrigin((req, res) => {
    const step = Number(new URL(req.url || '/', 'http://x').searchParams.get('n') || 0);
    res.writeHead(302, { location: `/?n=${step + 1}` });
    res.end();
  }, async (port, hits) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    await rejectsWith(safeFetch(`http://news.example.test:${port}/`, { maxRedirects: 3 }), 'TOO_MANY_REDIRECTS');
    assert.equal(hits(), 4);
  });
});

test('a response larger than maxBytes is rejected, with or without content-length', async () => {
  await withOrigin((req, res) => {
    const body = Buffer.alloc(4096, 'a');
    if (req.url === '/declared') {
      res.writeHead(200, { 'content-type': 'text/plain', 'content-length': String(body.length) });
      return res.end(body);
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write(body.subarray(0, 2048));
    return res.end(body.subarray(2048));
  }, async (port) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    await rejectsWith(safeFetch(`http://news.example.test:${port}/declared`, { maxBytes: 1024 }), 'RESPONSE_TOO_LARGE');
    await rejectsWith(safeFetch(`http://news.example.test:${port}/chunked`, { maxBytes: 1024 }), 'RESPONSE_TOO_LARGE');
    const withinLimit = await safeFetch(`http://news.example.test:${port}/declared`, { maxBytes: 4096 });
    assert.equal((await withinLimit.arrayBuffer()).byteLength, 4096);
  });
});

test('a response that never completes is aborted at the timeout', async () => {
  await withOrigin((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.write('partial');
  }, async (port) => {
    const safeFetch = localFetch(port, { 'news.example.test': '127.0.0.1' });
    await rejectsWith(safeFetch(`http://news.example.test:${port}/`, { timeoutMs: 150 }), 'TIMEOUT');
  });
});

test('a non-default port is rejected by default', async () => {
  const dns = fakeLookup({ 'news.example.test': '8.8.8.8' });
  const safeFetch = createSafeFetch({ lookup: dns.lookup });
  await rejectsWith(safeFetch('http://news.example.test:8080/'), 'UNSAFE_URL');
  assert.equal(dns.calls(), 0);
});
