# ddys-stremio

Official full-feature Stremio addon for the DDYS API. It provides DDYS catalogs, search, metadata, streams, external resources, and diagnostics.

## Features

- Stremio `manifest.json` with catalog, meta, stream, and subtitles resources.
- Catalogs for latest, hot, movies, series, anime, variety, and documentaries.
- Search through catalog extra `search`.
- Metadata pages with poster, overview, year, region, type, director, cast, rating, and source links.
- Direct streams for common media URLs such as `.m3u8`, `.mp4`, `.mkv`, `.webm`, and `.mpd`.
- Magnet links converted to Stremio `infoHash` when possible.
- Cloud drive and download-page resources exposed as `externalUrl`.
- Configurable API Base, Site Base, API Key, paging, timeout, cache, direct play, and external-resource display.
- Both Node HTTP server and Cloudflare Workers module.

## Run

```text
node src/server.mjs
```

Open:

```text
http://127.0.0.1:7821/configure
```
