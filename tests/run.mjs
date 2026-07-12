import assert from 'node:assert/strict';
import { base64UrlDecode, base64UrlEncode, decodeConfigToken, encodeConfigToken, normalizeOptions } from '../src/core/config.mjs';
import { buildCatalog, buildManifest, buildMeta, buildStreams, createMetaId } from '../src/core/stremio.mjs';
import { handleRequest } from '../src/core/http.mjs';

const sampleMovie = {
  slug: 'sample-movie',
  title: '示例电影',
  poster: '/poster.jpg',
  year: '2026',
  region: '中国',
  type_name: '电影',
  actor: '演员A / 演员B',
  director: '导演A',
  intro: '简介',
  remarks: 'HD',
  score: '8.8'
};

const sampleSeries = {
  slug: 'sample-series',
  title: '示例剧集',
  poster: '/series.jpg',
  year: '2026',
  region: '中国',
  type_name: '剧集',
  actor: '演员C',
  director: '导演B',
  intro: '剧集简介',
  remarks: '更新至02'
};

const sourcePayload = {
  data: {
    online: [
      { name: '第1集', url: 'https://media.example.com/ep1.m3u8' },
      { name: '第2集', url: 'magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567' }
    ],
    cloud: [
      { name: '网盘', url: 'https://cloud.example.com/share', code: '1234' }
    ]
  }
};

function mockFetch(url) {
  const pathname = new URL(url).pathname;
  if (pathname.endsWith('/latest') || pathname.endsWith('/hot')) {
    return json({ data: [sampleMovie, sampleSeries] });
  }

  if (pathname.endsWith('/movies')) {
    return json({ data: [sampleMovie, sampleSeries], meta: { total: 2, page: 1, per_page: 24, total_pages: 1 } });
  }

  if (pathname.endsWith('/search')) {
    return json({ data: [sampleMovie, sampleSeries], meta: { total: 2, page: 1, per_page: 24, total_pages: 1 } });
  }

  if (pathname.endsWith('/movies/sample-series')) {
    return json({ data: sampleSeries });
  }

  if (pathname.endsWith('/movies/sample-series/sources')) {
    return json(sourcePayload);
  }

  if (pathname.endsWith('/movies/sample-series/related')) {
    return json({ data: [sampleMovie] });
  }

  if (pathname.endsWith('/movies/sample-movie')) {
    return json({ data: sampleMovie });
  }

  if (pathname.endsWith('/movies/sample-movie/sources')) {
    return json(sourcePayload);
  }

  if (pathname.endsWith('/movies/sample-movie/related')) {
    return json({ data: [] });
  }

  return json({}, 404);
}

function json(body, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));
}

const options = { apiBase: 'https://api.example.test', siteBase: 'https://ddys.example.test' };
const runtime = { fetch: mockFetch };

const token = encodeConfigToken(options);
assert.equal(decodeConfigToken(token).apiBase, options.apiBase);
assert.equal(base64UrlDecode(base64UrlEncode('低端影视')), '低端影视');
assert.equal(normalizeOptions({ enableDirectPlay: '0' }).enableDirectPlay, false);

const manifest = buildManifest(options, 'https://addon.example.test');
assert.equal(manifest.id, 'io.ddys.stremio');
assert(manifest.resources.includes('catalog'));
assert(manifest.catalogs.some((catalog) => catalog.extra.some((extra) => extra.name === 'search')));

const latest = await buildCatalog('movie', 'ddys-latest-movie', {}, options, runtime);
assert.equal(latest.metas.length, 1);
assert.equal(latest.metas[0].id, createMetaId('sample-movie'));

const latestSeries = await buildCatalog('series', 'ddys-latest-series', {}, options, runtime);
assert.equal(latestSeries.metas.length, 1);
assert.equal(latestSeries.metas[0].type, 'series');

const search = await buildCatalog('movie', 'ddys-search-movie', { search: '示例' }, options, runtime);
assert.equal(search.metas.length, 1);
assert.equal(search.metas[0].type, 'movie');

const seriesSearch = await buildCatalog('series', 'ddys-search-series', { search: '示例' }, options, runtime);
assert.equal(seriesSearch.metas.length, 1);
assert.equal(seriesSearch.metas[0].type, 'series');

const meta = await buildMeta('series', createMetaId('sample-series'), options, runtime);
assert.equal(meta.meta.name, '示例剧集');
assert.equal(meta.meta.videos.length, 3);

const allStreams = await buildStreams('series', createMetaId('sample-series'), options, runtime);
assert.equal(allStreams.streams.length, 3);
assert(allStreams.streams.some((stream) => stream.url?.endsWith('.m3u8')));
assert(allStreams.streams.some((stream) => stream.infoHash));
assert(allStreams.streams.some((stream) => stream.externalUrl));

const response = await handleRequest(new Request(`https://addon.example.test/${token}/catalog/movie/ddys-search-movie/search=${encodeURIComponent('示例')}.json`), runtime);
assert.equal(response.status, 200);
const body = await response.json();
assert.equal(body.metas.length, 1);
assert.equal(body.metas[0].type, 'movie');

const manifestResponse = await handleRequest(new Request(`https://addon.example.test/${token}/manifest.json`), runtime);
assert.equal(manifestResponse.status, 200);
assert.equal((await manifestResponse.json()).catalogs.length, manifest.catalogs.length);

const originalBuffer = globalThis.Buffer;
globalThis.Buffer = undefined;
try {
  assert.equal(decodeConfigToken(encodeConfigToken({ apiBase: 'https://worker.example.test' })).apiBase, 'https://worker.example.test');
} finally {
  globalThis.Buffer = originalBuffer;
}

console.log(JSON.stringify({ ok: true, tests: 12 }, null, 2));
