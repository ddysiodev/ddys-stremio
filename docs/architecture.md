# 架构说明

`ddys-stremio` 是独立 Stremio Addon，不依赖 CMS、Emby、Jellyfin 或 TVBox 项目。

## 模块

- `src/core/config.mjs`：默认配置、配置 token、范围限制。
- `src/core/ddys-client.mjs`：DDYS API 客户端、缓存、超时、解析兼容、直链/磁力识别。
- `src/core/stremio.mjs`：Stremio manifest、catalog、meta、stream、subtitles 映射。
- `src/core/http.mjs`：HTTP 路由、配置页、诊断接口、CORS。
- `src/server.mjs`：Node HTTP 服务。
- `src/worker.mjs`：Cloudflare Workers 入口。
- `tests/run.mjs`：纯 Node mock 测试，不依赖 npm 包。

## Stremio 路由

- `/manifest.json`
- `/<config-token>/manifest.json`
- `/catalog/{type}/{id}.json`
- `/catalog/{type}/{id}/{extra}.json`
- `/meta/{type}/{id}.json`
- `/stream/{type}/{videoId}.json`
- `/subtitles/{type}/{id}.json`

## 边界处理

- 搜索词为空时返回空 catalog，不请求远端。
- `sources`、`related` 异常时详情仍可返回。
- 直链以 `url` stream 返回。
- 磁力链接提取 `btih` 后以 `infoHash` stream 返回。
- 网盘和下载页以 `externalUrl` 返回。
- 配置 token 无效时回落默认配置。
- Worker 核心不依赖 `node:fs`、`node:path` 等 Node 专属模块。
- 配置 token 编解码不依赖 Node `Buffer`，可在 Cloudflare Workers 默认运行时中执行。
