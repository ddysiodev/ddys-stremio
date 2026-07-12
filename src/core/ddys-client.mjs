import { DEFAULTS, normalizeOptions } from './config.mjs';

const directMediaPattern = /\.(m3u8|mp4|m4v|mkv|mov|flv|avi|ts|webm|mpd)(\?|#|$)/iu;
const cache = new Map();

export function createDdysClient(options = {}, runtime = {}) {
  const settings = normalizeOptions(options);
  const fetchImpl = runtime.fetch || globalThis.fetch;

  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch is required to use the DDYS client.');
  }

  async function latest(limit, signal) {
    const root = await getJson('/latest', { limit: String(clamp(limit ?? settings.homeLimit, settings.homeLimit, 1, 80)) }, signal);
    return readMovieList(root, settings);
  }

  async function hot(limit, signal) {
    const root = await getJson('/hot', { limit: String(clamp(limit ?? settings.homeLimit, settings.homeLimit, 1, 80)) }, signal);
    return readMovieList(root, settings);
  }

  async function movies(mediaType = 'movie', page = 1, perPage = settings.pageSize, signal) {
    const root = await getJson('/movies', {
      type: mediaType || 'movie',
      page: String(Math.max(1, Number(page) || 1)),
      per_page: String(clamp(perPage, settings.pageSize, 1, 80))
    }, signal);

    return readPagedMovies(root, settings);
  }

  async function search(query, page = 1, perPage = settings.pageSize, signal) {
    if (!String(query || '').trim()) {
      return {
        data: [],
        total: 0,
        page: Math.max(1, Number(page) || 1),
        perPage: clamp(perPage, settings.pageSize, 1, 80),
        totalPages: 1
      };
    }

    const root = await getJson('/search', {
      q: String(query || '').trim(),
      page: String(Math.max(1, Number(page) || 1)),
      per_page: String(clamp(perPage, settings.pageSize, 1, 80))
    }, signal);

    return readPagedMovies(root, settings);
  }

  async function detailBundle(slug, signal) {
    const encodedSlug = encodeURIComponent(String(slug || ''));
    const detailRoot = await getJson(`/movies/${encodedSlug}`, null, signal);
    const sourcesRoot = await getJsonOrFallback(`/movies/${encodedSlug}/sources`, signal);
    const relatedRoot = await getJsonOrFallback(`/movies/${encodedSlug}/related`, signal);

    return {
      movie: readMovie(unwrapData(detailRoot), settings),
      sourceGroups: readSourceGroups(unwrapData(sourcesRoot)),
      related: readRelated(unwrapData(relatedRoot), settings)
    };
  }

  async function diagnostics(signal) {
    const sample = await latest(1, signal);
    return {
      ok: true,
      apiBase: settings.apiBase,
      siteBase: settings.siteBase,
      apiKeyConfigured: Boolean(settings.apiKey),
      sampleCount: sample.length,
      cacheEnabled: settings.enableCache,
      cacheMinutes: settings.cacheMinutes
    };
  }

  async function getJsonOrFallback(path, signal) {
    try {
      return await getJson(path, null, signal);
    } catch {
      return {};
    }
  }

  async function getJson(path, query, signal) {
    const url = buildUrl(settings.apiBase, path, query);
    const cacheKey = `${url}|auth:${settings.apiKey ? '1' : '0'}`;

    if (settings.enableCache && cache.has(cacheKey)) {
      const entry = cache.get(cacheKey);
      if (entry.expiresAt > Date.now()) {
        return cloneJson(entry.value);
      }

      cache.delete(cacheKey);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('DDYS API request timed out.')), settings.timeoutSeconds * 1000);
    const abort = () => controller.abort(signal.reason);
    if (signal) {
      if (signal.aborted) {
        controller.abort(signal.reason);
      } else {
        signal.addEventListener('abort', abort, { once: true });
      }
    }

    try {
      const headers = {
        accept: 'application/json',
        'user-agent': settings.userAgent
      };
      if (settings.apiKey) {
        headers.Authorization = `Bearer ${settings.apiKey}`;
      }

      const response = await fetchImpl(url, { headers, signal: controller.signal });
      const text = await response.text();
      let root;
      try {
        root = JSON.parse(text || '{}');
      } catch (error) {
        throw new Error(`DDYS API returned non-JSON response: HTTP ${response.status}`, { cause: error });
      }

      if (!response.ok || isEnvelopeFailure(root)) {
        throw new Error(readMessage(root) || `DDYS API HTTP ${response.status}`);
      }

      if (settings.enableCache) {
        cache.set(cacheKey, {
          value: cloneJson(root),
          expiresAt: Date.now() + settings.cacheMinutes * 60 * 1000
        });
      }

      return root;
    } finally {
      clearTimeout(timeout);
      if (signal) {
        signal.removeEventListener('abort', abort);
      }
    }
  }

  return {
    options: settings,
    latest,
    hot,
    movies,
    search,
    detailBundle,
    diagnostics
  };
}

export function clearDdysCache() {
  cache.clear();
}

export function isDirectMedia(url) {
  return directMediaPattern.test(String(url || ''));
}

export function isMagnet(url) {
  return /^magnet:\?/iu.test(String(url || ''));
}

export function extractInfoHash(url) {
  const value = String(url || '');
  const match = value.match(/(?:xt=urn:btih:|btih:)([a-z0-9]{32,40})/iu);
  return match ? match[1].toLowerCase() : '';
}

export function flattenResources(sourceGroups = []) {
  const resources = [];
  sourceGroups.forEach((group, groupIndex) => {
    (group.items || []).forEach((resource, itemIndex) => {
      resources.push({ ...resource, groupName: group.name, groupIndex, itemIndex });
    });
  });
  return resources;
}

function readMovieList(root, settings) {
  const data = unwrapData(root);
  if (!Array.isArray(data)) {
    return [];
  }

  return data
    .map((item) => readMovie(item, settings))
    .filter((item) => item.slug && item.title);
}

function readPagedMovies(root, settings) {
  const data = unwrapData(root);
  const movies = Array.isArray(data) ? readMovieList(root, settings) : [];
  const meta = root && typeof root === 'object' ? root.meta || {} : {};
  return {
    data: movies,
    total: readInt(meta, movies.length, 'total', 'count'),
    page: readInt(meta, 1, 'page'),
    perPage: readInt(meta, movies.length || settings.pageSize, 'per_page', 'perPage', 'limit'),
    totalPages: readInt(meta, 1, 'total_pages', 'last_page', 'totalPages')
  };
}

function readMovie(element, settings) {
  if (!element || typeof element !== 'object' || Array.isArray(element)) {
    return emptyMovie();
  }

  const slug = firstString(element, 'slug', 'vod_id', 'id', 'key', 'code', 'video_id');
  const title = firstString(element, 'title', 'name', 'vod_name', 'title_cn') || slug;
  const category = toStringList(firstValue(element, 'category', 'vod_class', 'genre', 'genres', 'tags'));
  return {
    slug,
    title,
    poster: absoluteUrl(firstString(element, 'poster', 'pic', 'cover', 'vod_pic', 'image', 'thumbnail'), settings.siteBase),
    year: firstString(element, 'year', 'release_year', 'vod_year', 'date', 'release_date'),
    region: joinValues(firstValue(element, 'region', 'area', 'vod_area')),
    typeName: joinValues(firstValue(element, 'type_name', 'type', 'category', 'vod_class')),
    actor: joinValues(firstValue(element, 'actor', 'actors', 'cast', 'vod_actor')),
    director: joinValues(firstValue(element, 'director', 'directors', 'vod_director')),
    overview: firstString(element, 'intro', 'description', 'summary', 'content', 'vod_content'),
    remarks: joinValues(firstValue(element, 'remarks', 'vod_remarks', 'episode', 'episode_text', 'score', 'year')),
    url: absoluteUrl(firstNonEmpty(firstString(element, 'url', 'link', 'href'), slug ? `/movie/${slug}` : ''), settings.siteBase),
    date: firstString(element, 'date', 'pubdate', 'updated_at', 'update_time', 'vod_time', 'created_at'),
    score: readFloat(firstValue(element, 'score', 'rating', 'rate', 'vod_score')),
    tags: category
  };
}

function readSourceGroups(data) {
  const groups = [];
  if (Array.isArray(data)) {
    addGroup(groups, '在线播放', data);
    return groups;
  }

  if (!data || typeof data !== 'object') {
    return groups;
  }

  addGroup(groups, '在线播放', collectArrays(data, 'online', 'play', 'playlist', 'episodes'));
  addGroup(groups, '下载资源', collectArrays(data, 'download', 'downloads'));
  addGroup(groups, '网盘资源', collectArrays(data, 'cloud', 'netdisk', 'drive'));

  const used = new Set(['online', 'play', 'playlist', 'episodes', 'download', 'downloads', 'cloud', 'netdisk', 'drive']);
  for (const [key, value] of Object.entries(data)) {
    if (!used.has(key.toLowerCase()) && Array.isArray(value)) {
      addGroup(groups, readableGroupName(key), value);
    }
  }

  return groups.filter((group) => group.items.length > 0);
}

function readRelated(data, settings) {
  const movies = [];
  if (Array.isArray(data)) {
    movies.push(...data.map((item) => readMovie(item, settings)));
  } else if (data && typeof data === 'object') {
    movies.push(...collectArrays(data, 'series', 'related', 'items').map((item) => readMovie(item, settings)));
  }

  const seen = new Set();
  return movies
    .filter((item) => item.slug && item.title)
    .filter((item) => {
      if (seen.has(item.slug)) {
        return false;
      }

      seen.add(item.slug);
      return true;
    })
    .slice(0, 12);
}

function addGroup(groups, name, elements) {
  const items = Array.from(elements || [])
    .map((element, index) => readResource(element, index))
    .filter((item) => item.url);

  if (items.length > 0) {
    groups.push({ name, items });
  }
}

function readResource(element, index = 0) {
  if (typeof element === 'string') {
    return {
      name: `资源${index + 1}`,
      url: element,
      isDirect: isDirectMedia(element),
      isMagnet: isMagnet(element),
      headers: {}
    };
  }

  if (!element || typeof element !== 'object' || Array.isArray(element)) {
    return { name: '', url: '', isDirect: false, isMagnet: false, headers: {} };
  }

  const url = firstString(element, 'url', 'link', 'href', 'play_url', 'download_url', 'magnet', 'ed2k');
  let label = joinValues(firstValue(element, 'name', 'title', 'label', 'episode', 'quality', 'format'));
  if (!label) {
    label = `资源${index + 1}`;
  }

  const code = firstString(element, 'extract_code', 'code', 'password', 'passcode');
  if (code) {
    label += ` 提取码 ${code}`;
  }

  return {
    name: label,
    url,
    isDirect: isDirectMedia(url),
    isMagnet: isMagnet(url),
    headers: readHeaders(firstValue(element, 'headers', 'header'))
  };
}

function collectArrays(element, ...keys) {
  const out = [];
  for (const key of keys) {
    const value = getProperty(element, key);
    if (Array.isArray(value)) {
      out.push(...value);
    }
  }

  return out;
}

function unwrapData(root) {
  return root && typeof root === 'object' && !Array.isArray(root) && Object.hasOwn(root, 'data') ? root.data : root;
}

function isEnvelopeFailure(root) {
  return root && typeof root === 'object' && root.success === false;
}

function readMessage(root) {
  return firstString(root || {}, 'message', 'error', 'msg');
}

function getProperty(element, name) {
  if (!element || typeof element !== 'object' || Array.isArray(element)) {
    return undefined;
  }

  if (Object.hasOwn(element, name)) {
    return element[name];
  }

  const found = Object.keys(element).find((key) => key.toLowerCase() === String(name).toLowerCase());
  return found ? element[found] : undefined;
}

function firstValue(element, ...names) {
  for (const name of names) {
    const value = getProperty(element, name);
    if (value !== undefined && value !== null && value !== '') {
      return value;
    }
  }

  return undefined;
}

function firstString(element, ...names) {
  return elementText(firstValue(element, ...names));
}

function firstNonEmpty(...values) {
  return values.find((value) => String(value || '').trim()) || '';
}

function elementText(value) {
  if (value === undefined || value === null) {
    return '';
  }

  if (Array.isArray(value)) {
    return value.map(elementText).filter(Boolean).join(' / ');
  }

  if (typeof value === 'object') {
    return '';
  }

  return String(value).trim();
}

function joinValues(value) {
  return elementText(value);
}

function toStringList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map(elementText).filter(Boolean))];
  }

  const text = elementText(value);
  if (!text) {
    return [];
  }

  return [...new Set(text.split(/[\/,，|;；]/u).map((item) => item.trim()).filter(Boolean))];
}

function readFloat(value) {
  const number = Number(elementText(value));
  return Number.isFinite(number) ? number : null;
}

function readInt(element, fallback, ...keys) {
  const value = keys.length ? firstValue(element, ...keys) : element;
  const number = Number.parseInt(elementText(value), 10);
  return Number.isFinite(number) ? number : fallback;
}

function readHeaders(value) {
  const headers = {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return headers;
  }

  for (const [key, headerValue] of Object.entries(value)) {
    const text = elementText(headerValue);
    if (key && text) {
      headers[key] = text;
    }
  }

  return headers;
}

function absoluteUrl(value, baseUrl = DEFAULTS.siteBase) {
  const text = String(value || '').trim();
  if (!text) {
    return '';
  }

  if (/^https?:\/\//iu.test(text)) {
    return text;
  }

  if (text.startsWith('//')) {
    return `https:${text}`;
  }

  if (text.startsWith('/')) {
    return `${String(baseUrl || DEFAULTS.siteBase).replace(/\/+$/u, '')}${text}`;
  }

  return text;
}

function buildUrl(baseUrl, path, query) {
  const url = new URL(`${String(baseUrl || DEFAULTS.apiBase).replace(/\/+$/u, '')}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && String(value).trim()) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

function readableGroupName(key) {
  switch (String(key || '').toLowerCase()) {
    case 'quark':
      return '夸克资源';
    case 'aliyun':
      return '阿里云盘';
    case 'baidu':
      return '百度网盘';
    case 'magnet':
      return '磁力资源';
    case 'other':
      return '其他资源';
    default:
      return String(key || '').trim() || '其他资源';
  }
}

function emptyMovie() {
  return {
    slug: '',
    title: '',
    poster: '',
    year: '',
    region: '',
    typeName: '',
    actor: '',
    director: '',
    overview: '',
    remarks: '',
    url: '',
    date: '',
    score: null,
    tags: []
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}
