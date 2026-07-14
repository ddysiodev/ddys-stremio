import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const version = '0.1.1';
const required = [
  '.gitignore',
  '.github/workflows/build.yml',
  'LICENSE',
  'README.md',
  'README.en.md',
  'docs/architecture.md',
  'package.json',
  'wrangler.toml',
  'src/server.mjs',
  'src/worker.mjs',
  'src/core/config.mjs',
  'src/core/ddys-client.mjs',
  'src/core/http.mjs',
  'src/core/stremio.mjs',
  'tests/run.mjs',
  'tools/build-package.ps1',
  'tools/check.mjs'
];

const forbiddenDirs = new Set(['.git', '.wrangler', 'node_modules', 'dist', 'package', 'coverage', 'bin', 'obj', 'build', 'releases']);
const textFilePattern = /\.(mjs|js|md|json|toml|ya?ml|ps1|txt|gitignore)$/iu;
const mojibakeCodePoints = [
  0xfffd, 0x9428, 0x93be, 0x9363, 0x527c, 0x93c8, 0x7ec0, 0x8f70,
  0x7de5, 0x9353, 0x6ce6, 0x6d63, 0x5ea3, 0x8930, 0x8fab, 0x93c2,
  0x626e, 0x6578, 0x9411, 0x93bc, 0x6ec5, 0x5132, 0x568e, 0x74a7,
  0x52ec, 0x93bb, 0x612c, 0x942e, 0x53a0, 0x6220, 0x6d0f, 0x7ebe,
  0x4f78, 0x5a67, 0x612e, 0x7039, 0x590e, 0x95b0, 0x5d87, 0x7586,
  0x9352, 0x55db, 0x68e3, 0x682d, 0x74d2, 0x546e, 0x7f02, 0x64b3,
  0x935a, 0xe21c, 0x705e, 0x66e0, 0x9422, 0x71b8, 0x95be, 0x70ac,
  0x951b
];
const mojibakePattern = new RegExp(`[${mojibakeCodePoints.map((codePoint) => String.fromCodePoint(codePoint)).join('')}]`, 'u');
const secretPattern = /ghp_[A-Za-z0-9_]+|github_pat_[A-Za-z0-9_]+|npm_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]+/u;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function exists(relative) {
  try {
    await fs.access(path.join(root, relative));
    return true;
  } catch {
    return false;
  }
}

async function read(relative) {
  return fs.readFile(path.join(root, relative), 'utf8');
}

async function listFiles(dir = root, out = []) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (forbiddenDirs.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await listFiles(full, out);
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(root, file).replaceAll(path.sep, '/');
}

function includesAll(text, fragments, label) {
  for (const fragment of fragments) {
    assert(text.includes(fragment), `${label} missing ${fragment}`);
  }
}

async function main() {
  for (const file of required) {
    assert(await exists(file), `Missing required file: ${file}`);
  }

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.name === 'ddys-stremio', 'package name mismatch.');
  assert(pkg.version === version, 'package version mismatch.');
  assert(pkg.private === true, 'package must stay private; this is a Stremio addon bundle, not an npm library.');
  assert(pkg.type === 'module', 'package must be ESM.');
  assert(pkg.scripts?.start === 'node src/server.mjs', 'start script mismatch.');
  assert(pkg.scripts?.check === 'node tools/check.mjs', 'check script mismatch.');
  assert(pkg.scripts?.test === 'node tests/run.mjs', 'test script mismatch.');
  assert(pkg.scripts?.package?.includes('tools/build-package.ps1'), 'package script mismatch.');
  assert(pkg.engines?.node?.includes('>=20'), 'Node engine must be declared.');

  const config = await read('src/core/config.mjs');
  includesAll(config, [`VERSION = '${version}'`, 'TextEncoder', 'TextDecoder', 'normalizeOptions', 'encodeConfigToken', 'decodeConfigToken'], 'config');

  const client = await read('src/core/ddys-client.mjs');
  includesAll(client, ['/latest', '/hot', '/movies', '/search', '/sources', '/related', 'Authorization', 'Bearer', 'AbortController', 'cacheMinutes', 'isDirectMedia', 'isMagnet', 'extractInfoHash', '在线播放', '网盘资源'], 'DDYS client');

  const stremio = await read('src/core/stremio.mjs');
  includesAll(stremio, ['catalog', 'meta', 'stream', 'subtitles', 'ddys-latest', 'ddys-search-movie', 'infoHash', 'externalUrl', 'behaviorHints', 'configurable', '低端影视 DDYS', '最新电影', '最新剧集', '热门电影', '搜索电影', '资源:'], 'Stremio core');

  const http = await read('src/core/http.mjs');
  includesAll(http, ['manifest.json', 'catalog', 'meta', 'stream', 'configure', 'health', 'assets', 'logo.png', 'background.png', 'stremio://', 'access-control-allow-origin', 'OPTIONS'], 'HTTP layer');
  assert(!http.includes("node:fs"), 'Worker-safe HTTP layer must not import node:fs.');
  assert(!http.includes("node:path"), 'Worker-safe HTTP layer must not import node:path.');

  const server = await read('src/server.mjs');
  includesAll(server, ['createServer', 'handleRequest', 'HEAD', 'ddys-stremio listening'], 'Node server');

  const worker = await read('src/worker.mjs');
  includesAll(worker, ['export default', 'async fetch', 'handleRequest', 'globalThis.fetch.bind'], 'Worker entry');

  const wrangler = await read('wrangler.toml');
  includesAll(wrangler, ['name = "ddys-stremio"', 'main = "src/worker.mjs"', 'compatibility_date', 'workers_dev = true'], 'wrangler.toml');

  const readme = await read('README.md');
  includesAll(readme, ['Stremio', 'manifest.json', 'Cloudflare Workers', 'DDYS 搜索', `ddys-stremio-v${version}.zip`, `ddys-stremio-v${version}.zip.sha256`, 'Get-FileHash', 'node tools/check.mjs'], 'README.md');

  const readmeEn = await read('README.en.md');
  includesAll(readmeEn, ['Stremio addon', 'Release assets', `ddys-stremio-v${version}.zip`, `ddys-stremio-v${version}.zip.sha256`, 'Cloudflare Workers', 'Local checks'], 'README.en.md');

  const architecture = await read('docs/architecture.md');
  includesAll(architecture, ['Stremio Addon', 'Worker 核心', '配置 token', '.sha256', '固定排序'], 'architecture doc');

  const workflow = await read('.github/workflows/build.yml');
  includesAll(workflow, ['actions/checkout@v4', 'actions/setup-node@v4', 'node-version: "24"', 'node tools/check.mjs', 'node tests/run.mjs', 'tools/build-package.ps1', `ddys-stremio-v${version}.zip`, `ddys-stremio-v${version}.zip.sha256`, 'actions/upload-artifact@v4'], 'workflow');
  assert(workflow.includes(`name: ddys-stremio-v${version}`), 'workflow artifact must be versioned.');

  const buildScript = await read('tools/build-package.ps1');
  includesAll(buildScript, ['ddys-stremio-v{0}.zip', 'DdysZipCrc32', '0x04034b50', '0x02014b50', '0x06054b50', '[System.StringComparer]::Ordinal.Compare', 'Get-FileHash', '[System.IO.File]::WriteAllText', '[System.Text.Encoding]::ASCII', 'Assert-InRoot', '.wrangler', 'releases', 'sha256'], 'build script');
  assert(!buildScript.includes('Compress-Archive'), 'build script must not use non-deterministic Compress-Archive.');
  assert(!buildScript.includes('Set-Content -LiteralPath $ShaFile'), 'checksum writer must not add implicit newlines.');

  const files = await listFiles();
  for (const file of files) {
    const relative = rel(file);
    const segments = relative.split('/');
    for (const segment of segments) {
      assert(!forbiddenDirs.has(segment), `forbidden directory leaked: ${relative}`);
    }
    assert(!/(^|\/)\.env($|\.)/iu.test(relative), `env file leaked: ${relative}`);
    assert(!/\.(log|tmp|cache|zip|tgz|sha256)$/iu.test(relative), `generated file leaked: ${relative}`);
    assert(!['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'].includes(path.basename(relative)), `lockfile leaked: ${relative}`);
  }

  for (const file of files.filter((item) => textFilePattern.test(item))) {
    const relative = rel(file);
    const text = await fs.readFile(file, 'utf8');
    assert(!secretPattern.test(text), `token-like secret found in ${relative}`);
    assert(!mojibakePattern.test(text), `mojibake-like text found in ${relative}`);
  }

  console.log(JSON.stringify({ ok: true, package: 'ddys-stremio', version, files: files.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
