import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import test from 'node:test';

const { createApp } = await import('../server');
const { SafeFetchError } = await import('./safe-fetch');

const ARTICLE_HTML = `<html><head><title>Council approves the new transport plan</title></head><body><article>
<h1>Council approves the new transport plan</h1>
<p>The city council approved the new public transport plan on Tuesday after a long session.</p>
<p>The plan adds three bus lines and extends the service hours across every district.</p>
</article></body></html>`;

function fakeAuth(req: any, res: any, next: any) {
  if (req.headers.authorization !== 'Bearer test-token') return res.status(401).json({ code: 'INVALID_TOKEN' });
  req.user = { uid: req.headers['x-test-user'] || 'user-1', email: 'test@example.invalid' };
  return next();
}

function recordingFetch(respond: (url: string) => Response | Promise<Response>) {
  const urls: string[] = [];
  const fetcher: any = async (url: string) => {
    urls.push(url);
    return respond(url);
  };
  return { fetcher, urls };
}

async function withApp(dependencies: Parameters<typeof createApp>[0], run: (baseUrl: string) => Promise<void>) {
  const generateGeminiContent: any = async () => { throw new Error('Gemini must not be called in these tests.'); };
  const app = await createApp({ generateGeminiContent, ...dependencies, verifyAuth: fakeAuth as any, skipStatic: true });
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const baseUrl = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  try {
    await run(baseUrl);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

const authHeaders = (user = 'user-1') => ({ authorization: 'Bearer test-token', 'x-test-user': user });

function extract(baseUrl: string, body: unknown, headers: Record<string, string> = authHeaders()) {
  return fetch(`${baseUrl}/api/extract`, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

function proxyImage(baseUrl: string, target: string, headers: Record<string, string> = authHeaders()) {
  return fetch(`${baseUrl}/api/proxy-image?url=${encodeURIComponent(target)}`, { headers });
}

test('extract and proxy-image reject requests without a session before any outbound fetch', async () => {
  const outbound = recordingFetch(() => new Response(ARTICLE_HTML, { headers: { 'content-type': 'text/html' } }));
  await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
    assert.equal((await extract(baseUrl, { url: 'https://example.com/news/1' }, {})).status, 401);
    assert.equal((await extract(baseUrl, { rawText: 'A press release long enough to be accepted as text.', importType: 'text' }, {})).status, 401);
    assert.equal((await proxyImage(baseUrl, 'https://example.com/a.jpg', {})).status, 401);
  });
  assert.deepEqual(outbound.urls, []);
});

test('extract still returns the scraped article for a signed-in user', async () => {
  const outbound = recordingFetch(() => new Response(ARTICLE_HTML, { headers: { 'content-type': 'text/html; charset=utf-8' } }));
  await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
    const response = await extract(baseUrl, { url: 'https://example.com/news/1' });
    assert.equal(response.status, 200);
    const article = await response.json();
    assert.equal(article.title, 'Council approves the new transport plan');
    assert.equal(article.url, 'https://example.com/news/1');
    assert.equal(article.importSourceType, 'url');
    assert.match(article.content, /adds three bus lines/);
  });
  assert.deepEqual(outbound.urls, ['https://example.com/news/1']);
});

test('extract still accepts pasted text for a signed-in user', async () => {
  await withApp({}, async (baseUrl) => {
    const response = await extract(baseUrl, { rawText: 'Official statement\n\nThe organization announces its new program.', importType: 'text' });
    assert.equal(response.status, 200);
    const article = await response.json();
    assert.equal(article.title, 'Official statement');
    assert.equal(article.importSourceType, 'text');
  });
});

test('extract rejects internal URLs with 400 and never fetches them', async () => {
  const outbound = recordingFetch(() => new Response(ARTICLE_HTML));
  await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
    for (const url of ['http://169.254.169.254/computeMetadata/v1/', 'http://172.25.0.1/', 'http://[::1]/', 'http://2130706433/', 'http://example.com:8080/']) {
      assert.equal((await extract(baseUrl, { url })).status, 400, url);
    }
  });
  assert.deepEqual(outbound.urls, []);
});

test('extract answers 400 without the AI fallback when the fetch layer blocks the destination', async () => {
  let geminiCalls = 0;
  const generateGeminiContent: any = async () => { geminiCalls += 1; throw new Error('unexpected'); };
  const fetcher: any = async () => { throw new SafeFetchError('UNSAFE_URL', 'blocked'); };
  await withApp({ fetch: fetcher, generateGeminiContent }, async (baseUrl) => {
    assert.equal((await extract(baseUrl, { url: 'https://rebind.example.com/news' })).status, 400);
  });
  assert.equal(geminiCalls, 0);
});

test('proxy-image returns the remote image privately and without a wildcard CORS header', async () => {
  const outbound = recordingFetch(() => new Response(new Uint8Array([1, 2, 3, 4]), { headers: { 'content-type': 'image/png' } }));
  await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
    const response = await proxyImage(baseUrl, 'https://example.com/photo.png');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/png');
    assert.equal(response.headers.get('access-control-allow-origin'), null);
    assert.equal(response.headers.get('cache-control'), 'private, max-age=86400');
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3, 4]);
  });
  assert.deepEqual(outbound.urls, ['https://example.com/photo.png']);
});

test('proxy-image refuses remote content that is not an image', async () => {
  for (const contentType of ['text/html', 'application/json', '']) {
    const outbound = recordingFetch(() => new Response('{"secret":true}', { headers: contentType ? { 'content-type': contentType } : {} }));
    await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
      const response = await proxyImage(baseUrl, 'https://example.com/data');
      assert.equal(response.status, 415, contentType);
      assert.doesNotMatch(await response.text(), /secret/);
    });
  }
});

test('proxy-image rejects internal URLs with 400 and never fetches them', async () => {
  const outbound = recordingFetch(() => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
  await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
    for (const url of ['http://169.254.169.254/latest/meta-data/', 'http://localhost/a.png', 'http://10.0.0.8/a.png', 'ftp://example.com/a.png', 'not-a-url']) {
      assert.equal((await proxyImage(baseUrl, url)).status, 400, url);
    }
  });
  assert.deepEqual(outbound.urls, []);
});

test('proxy-image maps fetch-layer refusals to client errors', async () => {
  for (const [code, status] of [['UNSAFE_URL', 400], ['RESPONSE_TOO_LARGE', 413], ['TIMEOUT', 504]] as const) {
    const fetcher: any = async () => { throw new SafeFetchError(code, 'refused'); };
    await withApp({ fetch: fetcher }, async (baseUrl) => {
      assert.equal((await proxyImage(baseUrl, 'https://example.com/a.png')).status, status, code);
    });
  }
});

test('extract and proxy-image are rate limited per user', async () => {
  process.env.EXTRACT_RATE_LIMIT_PER_MINUTE = '2';
  process.env.PROXY_IMAGE_RATE_LIMIT_PER_MINUTE = '1';
  try {
    const outbound = recordingFetch(() => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } }));
    await withApp({ fetch: outbound.fetcher }, async (baseUrl) => {
      const text = { rawText: 'Official statement\n\nThe organization announces its new program.', importType: 'text' };
      assert.equal((await extract(baseUrl, text)).status, 200);
      assert.equal((await extract(baseUrl, text)).status, 200);
      const limited = await extract(baseUrl, text);
      assert.equal(limited.status, 429);
      assert.equal((await limited.json()).code, 'RATE_LIMITED');
      assert.ok(Number(limited.headers.get('retry-after')) > 0);
      assert.equal((await extract(baseUrl, text, authHeaders('user-2'))).status, 200);

      assert.equal((await proxyImage(baseUrl, 'https://example.com/a.png')).status, 200);
      assert.equal((await proxyImage(baseUrl, 'https://example.com/a.png')).status, 429);
    });
    assert.equal(outbound.urls.length, 1);
  } finally {
    delete process.env.EXTRACT_RATE_LIMIT_PER_MINUTE;
    delete process.env.PROXY_IMAGE_RATE_LIMIT_PER_MINUTE;
  }
});
