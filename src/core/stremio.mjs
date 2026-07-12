import { VERSION, base64UrlDecode, base64UrlEncode, normalizeOptions } from './config.mjs';
import { createDdysClient, extractInfoHash, flattenResources } from './ddys-client.mjs';

export const ADDON_ID = 'io.ddys.stremio';
export const ADDON_NAME = '低端影视 DDYS';

const catalogs = [
  { type: 'movie', id: 'ddys-latest', name: 'DDYS 最新更新', kind: 'latest', mediaType: 'movie' },
  { type: 'movie', id: 'ddys-hot', name: 'DDYS 热门内容', kind: 'hot', mediaType: 'movie' },
  { type: 'movie', id: 'ddys-movie', name: 'DDYS 电影', kind: 'category', mediaType: 'movie' },
  { type: 'series', id: 'ddys-series', name: 'DDYS 剧集', kind: 'category', mediaType: 'series' },
  { type: 'series', id: 'ddys-anime', name: 'DDYS 动漫', kind: 'category', mediaType: 'anime' },
  { type: 'series', id: 'ddys-variety', name: 'DDYS 综艺', kind: 'category', mediaType: 'variety' },
  { type: 'movie', id: 'ddys-documentary', name: 'DDYS 纪录片', kind: 'category', mediaType: 'documentary' },
  { type: 'movie', id: 'ddys-search-movie', name: 'DDYS 搜索电影', kind: 'search', mediaType: 'movie', searchOnly: true },
  { type: 'series', id: 'ddys-search-series', name: 'DDYS 搜索剧集', kind: 'search', mediaType: 'series', searchOnly: true }
];

export function buildManifest(options = {}, baseUrl = '') {
  const settings = normalizeOptions(options);
  return {
    id: ADDON_ID,
    version: VERSION,
    name: ADDON_NAME,
    description: '低端影视 API 的 Stremio 全功能插件，支持目录、搜索、详情、播放源和外部资源。',
    logo: `${trimSlash(baseUrl)}/assets/logo.png`,
    background: `${trimSlash(baseUrl)}/assets/background.png`,
    types: ['movie', 'series'],
    resources: ['catalog', 'meta', 'stream', 'subtitles'],
    idPrefixes: ['ddys:'],
    catalogs: catalogs.map((catalog) => ({
      type: catalog.type,
      id: catalog.id,
      name: catalog.name,
      extra: catalog.searchOnly
        ? [{ name: 'search', isRequired: true }, { name: 'skip', isRequired: false }]
        : [{ name: 'search', isRequired: false }, { name: 'skip', isRequired: false }]
    })),
    behaviorHints: {
      configurable: true,
      configurationRequired: false
    },
    config: [
      { key: 'apiBase', type: 'text', title: 'API Base', default: settings.apiBase, required: true },
      { key: 'siteBase', type: 'text', title: 'Site Base', default: settings.siteBase, required: true },
      { key: 'apiKey', type: 'password', title: 'API Key', default: '' },
      { key: 'pageSize', type: 'number', title: 'Page Size', default: settings.pageSize },
      { key: 'homeLimit', type: 'number', title: 'Home Limit', default: settings.homeLimit },
      { key: 'enableDirectPlay', type: 'checkbox', title: 'Enable Direct Play', default: settings.enableDirectPlay },
      { key: 'showExternalResources', type: 'checkbox', title: 'Show External Resources', default: settings.showExternalResources }
    ]
  };
}

export async function buildCatalog(type, id, extra = {}, options = {}, runtime = {}) {
  const catalog = catalogs.find((item) => item.type === type && item.id === id);
  if (!catalog) {
    return { metas: [] };
  }

  const settings = normalizeOptions(options);
  const client = createDdysClient(settings, runtime);
  const skip = Math.max(0, Number(extra.skip) || 0);
  const search = String(extra.search || '').trim();
  const limit = settings.pageSize;
  let movies = [];
  let total = 0;

  if (search) {
    const result = await client.search(search, Math.floor(skip / limit) + 1, limit, runtime.signal);
    movies = filterCatalogType(result.data, catalog.mediaType);
    total = result.total || movies.length;
  } else if (catalog.kind === 'search') {
    movies = [];
  } else if (catalog.kind === 'latest') {
    const fetched = await client.latest(skip + settings.homeLimit, runtime.signal);
    movies = fetched.slice(skip, skip + settings.homeLimit);
    total = fetched.length;
  } else if (catalog.kind === 'hot') {
    const fetched = await client.hot(skip + settings.homeLimit, runtime.signal);
    movies = fetched.slice(skip, skip + settings.homeLimit);
    total = fetched.length;
  } else {
    const result = await client.movies(catalog.mediaType, Math.floor(skip / limit) + 1, limit, runtime.signal);
    movies = result.data;
    total = result.total || movies.length;
  }

  return {
    metas: movies.map((movie) => toPreviewMeta(movie, catalog.type)),
    cacheMaxAge: settings.cacheMinutes * 60,
    ...(total ? { total } : {})
  };
}

export async function buildMeta(type, encodedId, options = {}, runtime = {}) {
  const id = parseDdysId(encodedId);
  if (!id.slug) {
    return { meta: null };
  }

  const settings = normalizeOptions(options);
  const client = createDdysClient(settings, runtime);
  const bundle = await client.detailBundle(id.slug, runtime.signal);
  const movie = bundle.movie.slug ? bundle.movie : { ...bundle.movie, slug: id.slug, title: id.slug };
  const metaType = type || inferStremioType(movie);
  const resources = flattenResources(bundle.sourceGroups);
  const videos = metaType === 'series'
    ? resources.map((resource) => ({
        id: createSourceId(movie.slug, resource.groupIndex, resource.itemIndex),
        title: `${resource.groupName} - ${resource.name}`,
        season: 1,
        episode: resource.itemIndex + 1,
        released: parseReleased(movie.date),
        overview: resource.url
      }))
    : undefined;

  return {
    meta: {
      ...toPreviewMeta(movie, metaType),
      type: metaType,
      description: buildDescription(movie, bundle.sourceGroups),
      releaseInfo: parseYear(movie.year) || movie.year || undefined,
      released: parseReleased(movie.date),
      genres: movie.tags,
      director: splitPeople(movie.director),
      cast: splitPeople(movie.actor),
      country: movie.region || undefined,
      website: movie.url || undefined,
      imdbRating: movie.score ? String(movie.score) : undefined,
      behaviorHints: {
        defaultVideoId: videos?.[0]?.id || createMetaId(movie.slug)
      },
      ...(videos?.length ? { videos } : {}),
      ...(settings.includeRelatedItems && bundle.related.length ? { links: bundle.related.map(toRelatedLink) } : {})
    },
    cacheMaxAge: settings.cacheMinutes * 60
  };
}

export async function buildStreams(type, encodedVideoId, options = {}, runtime = {}) {
  const parsed = parseDdysId(encodedVideoId);
  if (!parsed.slug) {
    return { streams: [] };
  }

  const settings = normalizeOptions(options);
  const client = createDdysClient(settings, runtime);
  const bundle = await client.detailBundle(parsed.slug, runtime.signal);
  let resources = flattenResources(bundle.sourceGroups);

  if (parsed.source) {
    resources = resources.filter((resource) => resource.groupIndex === parsed.source.groupIndex && resource.itemIndex === parsed.source.itemIndex);
  }

  const streams = [];
  for (const resource of resources) {
    const stream = toStream(resource, settings);
    if (stream) {
      streams.push(stream);
    }
  }

  if (streams.length === 0 && bundle.movie.url && settings.showExternalResources) {
    streams.push({
      name: 'DDYS 源站',
      title: '打开 DDYS 源站',
      externalUrl: bundle.movie.url,
      description: bundle.movie.url
    });
  }

  return {
    streams,
    cacheMaxAge: settings.cacheMinutes * 60
  };
}

export function buildSubtitles() {
  return { subtitles: [] };
}

export function createMetaId(slug) {
  return `ddys:${base64UrlEncode(slug || '')}`;
}

export function createSourceId(slug, groupIndex, itemIndex) {
  return `${createMetaId(slug)}:src:${groupIndex}:${itemIndex}`;
}

export function parseDdysId(value) {
  const parts = String(value || '').split(':');
  if (parts[0] !== 'ddys' || !parts[1]) {
    return { slug: '', source: null };
  }

  let slug = '';
  try {
    slug = base64UrlDecode(parts[1]);
  } catch {
    slug = '';
  }

  const source = parts[2] === 'src'
    ? {
        groupIndex: Number.parseInt(parts[3], 10),
        itemIndex: Number.parseInt(parts[4], 10)
      }
    : null;

  if (source && (!Number.isFinite(source.groupIndex) || !Number.isFinite(source.itemIndex))) {
    return { slug, source: null };
  }

  return { slug, source };
}

export function listCatalogDefinitions() {
  return catalogs.map((catalog) => ({ ...catalog }));
}

function toPreviewMeta(movie, type) {
  return {
    id: createMetaId(movie.slug),
    type: type || inferStremioType(movie),
    name: movie.title || movie.slug,
    poster: movie.poster || undefined,
    posterShape: 'poster',
    background: movie.poster || undefined,
    description: buildDescription(movie),
    releaseInfo: parseYear(movie.year) || movie.year || undefined,
    genres: movie.tags,
    imdbRating: movie.score ? String(movie.score) : undefined
  };
}

function toStream(resource, settings) {
  const title = `${resource.groupName} - ${resource.name}`;
  if (resource.isDirect && settings.enableDirectPlay) {
    return {
      name: 'DDYS',
      title,
      url: resource.url,
      description: resource.url,
      behaviorHints: {
        bingeGroup: resource.groupName || 'DDYS',
        notWebReady: false
      }
    };
  }

  if (resource.isMagnet) {
    const infoHash = extractInfoHash(resource.url);
    if (infoHash) {
      return {
        name: 'DDYS 磁力',
        title,
        infoHash,
        sources: [resource.url],
        description: resource.url,
        behaviorHints: {
          bingeGroup: resource.groupName || 'DDYS'
        }
      };
    }
  }

  if (settings.showExternalResources) {
    return {
      name: 'DDYS 外部',
      title,
      externalUrl: resource.url,
      description: resource.url
    };
  }

  return null;
}

function filterCatalogType(movies, mediaType) {
  if (!['series', 'anime', 'variety'].includes(mediaType)) {
    return movies;
  }

  return movies.filter((movie) => inferStremioType(movie) === 'series');
}

function inferStremioType(movie) {
  const text = `${movie.typeName || ''} ${movie.remarks || ''} ${movie.tags?.join(' ') || ''}`.toLowerCase();
  return /series|episode|anime|variety|剧|番|综艺/iu.test(text) ? 'series' : 'movie';
}

function buildDescription(movie, sourceGroups = []) {
  const lines = [];
  if (movie.overview) lines.push(movie.overview);
  addDetail(lines, '年份', movie.year);
  addDetail(lines, '地区', movie.region);
  addDetail(lines, '类型', movie.typeName);
  addDetail(lines, '导演', movie.director);
  addDetail(lines, '演员', movie.actor);
  addDetail(lines, '源站', movie.url);

  if (sourceGroups.length) {
    const count = sourceGroups.reduce((sum, group) => sum + (group.items?.length || 0), 0);
    if (count) {
      lines.push(`资源: ${count} 个`);
    }
  }

  return lines.filter(Boolean).join('\n');
}

function toRelatedLink(movie) {
  return {
    name: movie.title,
    category: 'related',
    url: movie.url || `stremio:///detail/${inferStremioType(movie)}/${createMetaId(movie.slug)}`
  };
}

function addDetail(lines, label, value) {
  if (String(value || '').trim()) {
    lines.push(`${label}: ${value}`);
  }
}

function splitPeople(value) {
  return String(value || '')
    .split(/[\/,，|;；]/u)
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function parseYear(value) {
  const match = String(value || '').match(/\d{4}/u);
  return match ? match[0] : '';
}

function parseReleased(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : undefined;
}

function trimSlash(value) {
  return String(value || '').replace(/\/+$/u, '');
}
