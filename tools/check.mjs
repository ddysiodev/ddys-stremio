import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const required = [
  'package.json',
  'README.md',
  'README.en.md',
  'LICENSE',
  'wrangler.toml',
  '.github/workflows/build.yml',
  'docs/architecture.md',
  'tools/check.mjs',
  'tools/build-package.ps1',
  'tests/run.mjs',
  'src/server.mjs',
  'src/worker.mjs',
  'src/core/config.mjs',
  'src/core/ddys-client.mjs',
  'src/core/stremio.mjs',
  'src/core/http.mjs'
];

const forbiddenDirs = new Set(['.git', 'node_modules', 'dist', 'package', 'coverage', 'bin', 'obj']);

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

async function main() {
  for (const file of required) {
    assert(await exists(file), `Missing required file: ${file}`);
  }

  const pkg = JSON.parse(await read('package.json'));
  assert(pkg.name === 'ddys-stremio', 'package name mismatch.');
  assert(pkg.version === '0.1.0', 'package version mismatch.');
  assert(pkg.type === 'module', 'package must be ESM.');

  const stremio = await read('src/core/stremio.mjs');
  for (const fragment of ['catalog', 'meta', 'stream', 'subtitles', 'ddys-latest', 'ddys-search-movie', 'infoHash', 'externalUrl', 'behaviorHints']) {
    assert(stremio.includes(fragment), `Stremio core missing ${fragment}.`);
  }

  const client = await read('src/core/ddys-client.mjs');
  for (const fragment of ['/latest', '/hot', '/movies', '/search', '/sources', '/related', 'Authorization', 'Bearer', 'AbortController']) {
    assert(client.includes(fragment), `DDYS client missing ${fragment}.`);
  }

  const http = await read('src/core/http.mjs');
  for (const fragment of ['manifest.json', 'catalog', 'configure', 'stremio://', 'access-control-allow-origin']) {
    assert(http.includes(fragment), `HTTP layer missing ${fragment}.`);
  }
  assert(!http.includes("node:fs"), 'Worker-safe HTTP layer must not import node:fs.');

  const readme = await read('README.md');
  for (const fragment of ['Stremio', 'manifest.json', 'Cloudflare Workers', 'DDYS 搜索']) {
    assert(readme.includes(fragment), `README missing ${fragment}.`);
  }
  assert(!readme.includes('## **开发打包**'), 'README contains unwanted developer packaging section.');

  const files = await listFiles();
  for (const file of files) {
    const relative = path.relative(root, file).replaceAll(path.sep, '/');
    assert(!relative.endsWith('.env'), 'Environment files must not be included.');
    assert(!relative.includes('/node_modules/'), 'node_modules must not be included.');
  }

  const allText = (await Promise.all(files.filter((file) => /\.(mjs|js|md|json|toml|yml|ps1)$/i.test(file)).map((file) => fs.readFile(file, 'utf8')))).join('\n');
  assert(!/ghp_[A-Za-z0-9_]+/.test(allText), 'GitHub token-like value found.');
  assert(!/npm_[A-Za-z0-9_]+/.test(allText), 'npm token-like value found.');

  console.log(JSON.stringify({ ok: true, package: 'ddys-stremio', files: files.length }, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
