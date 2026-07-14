# ddys-stremio

Stremio addon for the DDYS API. It exposes DDYS catalogs, search, metadata, direct streams, magnet resources, and external cloud-drive/download resources.

## Features

- Stremio `manifest.json` with catalog, meta, stream, and subtitles resources.
- Catalogs for latest movies, latest series, hot movies, hot series, movies, series, anime, variety, and documentaries.
- Search through catalog extra `search`.
- Metadata pages with poster, overview, year, region, type, director, cast, rating, source website, and related items.
- Direct streams for common media URLs such as `.m3u8`, `.mp4`, `.mkv`, `.webm`, and `.mpd`.
- Magnet links converted to Stremio `infoHash` when possible.
- Cloud-drive and download-page resources exposed as `externalUrl`.
- Configurable API Base, Site Base, API Key, paging, timeout, cache, direct play, external resources, and related items.
- Shared protocol core for the Node HTTP server and Cloudflare Workers module.

## Release assets

The GitHub Release contains:

```text
ddys-stremio-v0.1.1.zip
ddys-stremio-v0.1.1.zip.sha256
```

The ZIP includes source, tests, self-checks, Worker configuration, and documentation. It excludes `node_modules`, build output, local environment files, and temporary artifacts.

Verify:

```powershell
Get-FileHash .\ddys-stremio-v0.1.1.zip -Algorithm SHA256
Get-Content .\ddys-stremio-v0.1.1.zip.sha256
```

## Run locally

```text
node src/server.mjs
```

Open:

```text
http://127.0.0.1:7821/configure
```

The page generates a Stremio install URL:

```text
stremio://127.0.0.1:7821/manifest.json
```

When custom settings are used, the URL contains a configuration token:

```text
stremio://example.com/<config-token>/manifest.json
```

## Cloudflare Workers

Entry point:

```text
src/worker.mjs
```

Configuration:

```text
wrangler.toml
```

After deployment, open:

```text
https://<worker-domain>/configure
```

## Local checks

```text
node tools/check.mjs
node tests/run.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```

The package script emits a deterministic ZIP plus a stable ASCII `.sha256` file.
