import { clearDdysCache, createDdysClient } from './ddys-client.mjs';
import { configFromSearchParams, decodeConfigToken, encodeConfigToken, normalizeOptions, safeJson } from './config.mjs';
import { buildCatalog, buildManifest, buildMeta, buildStreams, buildSubtitles, listCatalogDefinitions } from './stremio.mjs';

const transparentPng = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/azk1qkAAAAASUVORK5CYII=';

export async function handleRequest(request, runtime = {}) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  const { token, segments } = extractConfigAndSegments(url.pathname);
  const options = normalizeOptions({
    ...decodeConfigToken(token),
    ...configFromSearchParams(url.searchParams)
  });
  const baseUrl = detectBaseUrl(url, token);

  try {
    if (segments.length === 0) {
      return htmlResponse(renderHome(baseUrl, options));
    }

    if (segments[0] === 'configure') {
      return htmlResponse(renderConfigure(baseUrl, options));
    }

    if (segments[0] === 'health') {
      return jsonResponse({ ok: true, addon: 'ddys-stremio' });
    }

    if (segments[0] === 'assets') {
      return assetResponse(segments[1]);
    }

    if (segments[0] === 'manifest.json') {
      return jsonResponse(buildManifest(options, baseUrl));
    }

    if (segments[0] === 'catalog' && segments.length >= 3) {
      const [resource, type, id, extraFile = ''] = segments;
      void resource;
      const extra = parseExtra(extraFile, url.searchParams);
      return jsonResponse(await buildCatalog(type, stripJson(id), extra, options, runtime));
    }

    if (segments[0] === 'meta' && segments.length >= 3) {
      const [, type, id] = segments;
      return jsonResponse(await buildMeta(type, stripJson(id), options, runtime));
    }

    if (segments[0] === 'stream' && segments.length >= 3) {
      const [, type, id] = segments;
      return jsonResponse(await buildStreams(type, stripJson(id), options, runtime));
    }

    if (segments[0] === 'subtitles') {
      return jsonResponse(buildSubtitles());
    }

    if (segments[0] === 'ddys') {
      return handleDdysApi(segments, options, { ...runtime, url });
    }

    return jsonResponse({ error: 'Not found' }, 404);
  } catch (error) {
    return jsonResponse({
      error: error.message || 'Internal error'
    }, 500);
  }
}

async function handleDdysApi(segments, options, runtime) {
  const client = createDdysClient(options, runtime);
  if (segments[1] === 'status') {
    return jsonResponse(await client.diagnostics(runtime.signal));
  }

  if (segments[1] === 'search') {
    const query = runtime.url?.searchParams?.get('q') || '';
    return jsonResponse(await client.search(query, 1, options.pageSize, runtime.signal));
  }

  if (segments[1] === 'movie' && segments[2]) {
    return jsonResponse(await client.detailBundle(decodeURIComponent(segments[2]), runtime.signal));
  }

  if (segments[1] === 'cache' && segments[2] === 'clear') {
    clearDdysCache();
    return jsonResponse({ ok: true, cacheCleared: true });
  }

  return jsonResponse({ error: 'Not found' }, 404);
}

function extractConfigAndSegments(pathname) {
  const rawSegments = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const known = new Set(['manifest.json', 'catalog', 'meta', 'stream', 'subtitles', 'configure', 'health', 'assets', 'ddys']);
  if (rawSegments.length > 1 && !known.has(rawSegments[0])) {
    return { token: rawSegments[0], segments: rawSegments.slice(1) };
  }

  return { token: '', segments: rawSegments };
}

function detectBaseUrl(url, token) {
  const basePath = token ? `/${encodeURIComponent(token)}` : '';
  return `${url.protocol}//${url.host}${basePath}`;
}

function parseExtra(extraFile, searchParams) {
  const extra = {};
  const clean = stripJson(extraFile || '');
  if (clean) {
    for (const pair of clean.split('&')) {
      const [key, value = ''] = pair.split('=');
      if (key) {
        extra[decodeURIComponent(key)] = decodeURIComponent(value);
      }
    }
  }

  for (const [key, value] of searchParams.entries()) {
    if (!key.startsWith('api') && key !== 'siteBase' && key !== 'apiKey') {
      extra[key] = value;
    }
  }

  return extra;
}

function stripJson(value) {
  return String(value || '').replace(/\.json$/iu, '');
}

function jsonResponse(body, status = 200) {
  return new Response(safeJson(body), {
    status,
    headers: corsHeaders({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': status === 200 ? 'public, max-age=60' : 'no-store'
    })
  });
}

function htmlResponse(body, status = 200) {
  return new Response(body, {
    status,
    headers: corsHeaders({
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    })
  });
}

async function assetResponse(name) {
  if (name !== 'logo.png' && name !== 'background.png') {
    return jsonResponse({ error: 'Not found' }, 404);
  }

  return new Response(base64ToBytes(transparentPng), {
    headers: corsHeaders({
      'content-type': 'image/png',
      'cache-control': 'public, max-age=86400'
    })
  });
}

function corsHeaders(headers = {}) {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'GET,HEAD,OPTIONS',
    ...headers
  };
}

function renderHome(baseUrl, options) {
  const manifestUrl = `${baseUrl}/manifest.json`;
  const stremioUrl = `stremio://${manifestUrl.replace(/^https?:\/\//iu, '')}`;
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ddys-stremio</title>${style()}</head>
<body>
<main>
  <h1>低端影视 DDYS</h1>
  <p>Stremio 全功能插件：目录、搜索、详情、播放源、外部资源和诊断。</p>
  <div class="actions">
    <a href="${escapeHtml(stremioUrl)}">安装到 Stremio</a>
    <a href="${escapeHtml(baseUrl)}/configure">配置插件</a>
    <a href="${escapeHtml(manifestUrl)}">查看 manifest</a>
  </div>
  <pre>${escapeHtml(safeJson({ manifestUrl, apiBase: options.apiBase, catalogs: listCatalogDefinitions().map((item) => item.id) }))}</pre>
</main>
</body></html>`;
}

function renderConfigure(baseUrl, options) {
  const token = encodeConfigToken(options);
  return `<!doctype html>
<html lang="zh-CN">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>配置 DDYS Stremio</title>${style()}</head>
<body>
<main>
  <h1>配置 DDYS Stremio</h1>
  <form id="form">
    ${input('apiBase', 'API Base', options.apiBase)}
    ${input('siteBase', 'Site Base', options.siteBase)}
    ${input('apiKey', 'API Key', options.apiKey, 'password')}
    ${input('pageSize', '分页数量', options.pageSize, 'number')}
    ${input('homeLimit', '首页数量', options.homeLimit, 'number')}
    ${input('timeoutSeconds', '超时秒数', options.timeoutSeconds, 'number')}
    ${input('cacheMinutes', '缓存分钟', options.cacheMinutes, 'number')}
    ${checkbox('enableCache', '启用缓存', options.enableCache)}
    ${checkbox('enableDirectPlay', '启用直链播放', options.enableDirectPlay)}
    ${checkbox('showExternalResources', '展示外部资源', options.showExternalResources)}
    ${checkbox('includeRelatedItems', '展示相关影片', options.includeRelatedItems)}
    <button type="submit">生成安装链接</button>
  </form>
  <div class="result">
    <a id="install" href="#">安装到 Stremio</a>
    <code id="manifest">${escapeHtml(`${baseUrl.replace(/\/$/u, '')}/${token}/manifest.json`)}</code>
  </div>
</main>
<script>
const baseUrl = ${JSON.stringify(baseUrl)};
function b64url(text){return btoa(unescape(encodeURIComponent(text))).replace(/\\+/g,'-').replace(/\\//g,'_').replace(/=+$/,'');}
function value(id){return document.getElementById(id).value;}
function checked(id){return document.getElementById(id).checked;}
function build(){
  const data = {
    apiBase: value('apiBase'),
    siteBase: value('siteBase'),
    apiKey: value('apiKey'),
    pageSize: Number(value('pageSize')) || 24,
    homeLimit: Number(value('homeLimit')) || 24,
    timeoutSeconds: Number(value('timeoutSeconds')) || 12,
    cacheMinutes: Number(value('cacheMinutes')) || 10,
    enableCache: checked('enableCache'),
    enableDirectPlay: checked('enableDirectPlay'),
    showExternalResources: checked('showExternalResources'),
    includeRelatedItems: checked('includeRelatedItems')
  };
  const token = b64url(JSON.stringify(data));
  const manifest = baseUrl.replace(/\\/$/,'') + '/' + token + '/manifest.json';
  const install = 'stremio://' + manifest.replace(/^https?:\\/\\//, '');
  document.getElementById('manifest').textContent = manifest;
  document.getElementById('install').href = install;
}
document.getElementById('form').addEventListener('submit', function(event){ event.preventDefault(); build(); });
build();
</script>
</body></html>`;
}

function input(id, label, value, type = 'text') {
  return `<label><span>${escapeHtml(label)}</span><input id="${id}" type="${type}" value="${escapeHtml(String(value ?? ''))}"></label>`;
}

function checkbox(id, label, value) {
  return `<label class="check"><input id="${id}" type="checkbox" ${value ? 'checked' : ''}><span>${escapeHtml(label)}</span></label>`;
}

function style() {
  return `<style>
body{font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;margin:0;background:#111827;color:#f9fafb}
main{max-width:820px;margin:0 auto;padding:32px 20px}
h1{font-size:32px;margin:0 0 12px}
p{color:#cbd5e1}
.actions{display:flex;gap:12px;flex-wrap:wrap;margin:24px 0}
a,button{background:#0ea5e9;color:white;text-decoration:none;border:0;border-radius:6px;padding:10px 14px;font-weight:700;cursor:pointer}
form{display:grid;gap:14px;margin-top:20px}
label{display:grid;gap:6px;color:#cbd5e1}
input{border:1px solid #334155;background:#0f172a;color:#f8fafc;border-radius:6px;padding:10px}
.check{display:flex;align-items:center;gap:10px}
.check input{width:auto}
pre,code{display:block;background:#0f172a;border:1px solid #334155;border-radius:6px;padding:12px;overflow:auto;color:#e2e8f0}
.result{display:grid;gap:12px;margin-top:24px}
</style>`;
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function base64ToBytes(value) {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(value, 'base64');
  }

  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}
