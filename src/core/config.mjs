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
  options.enableCache = toBool(options.enableCache, DEFAULTS.enableCache);
  options.enableDirectPlay = toBool(options.enableDirectPlay, DEFAULTS.enableDirectPlay);
  options.showExternalResources = toBool(options.showExternalResources, DEFAULTS.showExternalResources);
  options.includeRelatedItems = toBool(options.includeRelatedItems, DEFAULTS.includeRelatedItems);
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
  return utf8ToBase64(String(value))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/u, '');
}

export function base64UrlDecode(value) {
  const text = String(value || '').replaceAll('-', '+').replaceAll('_', '/');
  const padded = text.padEnd(text.length + ((4 - (text.length % 4)) % 4), '=');
  return base64ToUtf8(padded);
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

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  if (typeof value === 'boolean') {
    return value;
  }

  return !['false', '0', 'no', 'off'].includes(String(value).trim().toLowerCase());
}

function utf8ToBase64(value) {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  if (typeof btoa === 'function') {
    return btoa(binary);
  }

  return Buffer.from(value, 'utf8').toString('base64');
}

function base64ToUtf8(value) {
  let binary;
  if (typeof atob === 'function') {
    binary = atob(value);
  } else {
    binary = Buffer.from(value, 'base64').toString('binary');
  }

  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
