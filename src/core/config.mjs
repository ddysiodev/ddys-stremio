export const VERSION = '0.1.0';

export const DEFAULTS = Object.freeze({
  apiBase: 'https://ddys.io/api/v1',
  siteBase: 'https://ddys.io',
  apiKey: '',
  userAgent: `ddys-stremio/${VERSION}`,
  pageSize: 24,
  homeLimit: 24,
  timeoutSeconds: 12,
  cacheMinutes: 10,
  enableCache: true,
  enableDirectPlay: true,
  showExternalResources: true,
  includeRelatedItems: true
});

export function normalizeOptions(input = {}) {
  const options = { ...DEFAULTS, ...(input || {}) };
  options.apiBase = normalizeBaseUrl(options.apiBase, DEFAULTS.apiBase);
  options.siteBase = normalizeBaseUrl(options.siteBase, DEFAULTS.siteBase);
  options.apiKey = String(options.apiKey || '').trim();
  options.userAgent = String(options.userAgent || DEFAULTS.userAgent).trim() || DEFAULTS.userAgent;
  options.pageSize = clampNumber(options.pageSize, DEFAULTS.pageSize, 1, 80);
  options.homeLimit = clampNumber(options.homeLimit, DEFAULTS.homeLimit, 1, 80);
  options.timeoutSeconds = clampNumber(options.timeoutSeconds, DEFAULTS.timeoutSeconds, 3, 60);
  options.cacheMinutes = clampNumber(options.cacheMinutes, DEFAULTS.cacheMinutes, 1, 120);
  options.enableCache = options.enableCache !== false && options.enableCache !== 'false';
  options.enableDirectPlay = options.enableDirectPlay !== false && options.enableDirectPlay !== 'false';
  options.showExternalResources = options.showExternalResources !== false && options.showExternalResources !== 'false';
  options.includeRelatedItems = options.includeRelatedItems !== false && options.includeRelatedItems !== 'false';
  return options;
}

export function encodeConfigToken(input = {}) {
  const options = normalizeOptions(input);
  const minimal = {};
  for (const [key, value] of Object.entries(options)) {
    if (DEFAULTS[key] !== value && value !== '' && value !== undefined && value !== null) {
      minimal[key] = value;
    }
  }

  return base64UrlEncode(JSON.stringify(minimal));
}

export function decodeConfigToken(token) {
  if (!token || token === '-' || token === 'default') {
    return normalizeOptions();
  }

  try {
    const json = base64UrlDecode(token);
    return normalizeOptions(JSON.parse(json));
  } catch {
    return normalizeOptions();
  }
}

export function configFromSearchParams(searchParams) {
  const input = {};
  for (const key of Object.keys(DEFAULTS)) {
    if (searchParams.has(key)) {
      input[key] = searchParams.get(key);
    }
  }

  return input;
}

export function base64UrlEncode(value) {
  return Buffer.from(String(value), 'utf8')
    .toString('base64')
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function base64UrlDecode(value) {
  const text = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = text.padEnd(text.length + ((4 - (text.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64').toString('utf8');
}

export function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

function normalizeBaseUrl(value, fallback) {
  const text = String(value || fallback).trim() || fallback;
  if (!/^https?:\/\//iu.test(text)) {
    return fallback;
  }

  return text.replace(/\/+$/u, '');
}

function clampNumber(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number) || number === 0) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(number)));
}
