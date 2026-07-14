# ddys-stremio

低端影视 API 的 Stremio 插件。安装后可在 Stremio 中使用 DDYS 目录、搜索、详情页、直链播放源、磁力资源和外部网盘/下载资源。

## 功能

- `manifest.json`：声明 catalog、meta、stream、subtitles 资源。
- 首页目录：最新电影、最新剧集、热门电影、热门剧集。
- 分类目录：电影、剧集、动漫、综艺、纪录片。
- DDYS 搜索：通过 Stremio catalog extra `search` 提供全局搜索入口。
- 详情页：标题、封面、简介、年份、地区、类型、导演、演员、评分、源站链接和相关条目。
- 播放源：`.m3u8`、`.mp4`、`.m4v`、`.mkv`、`.mov`、`.flv`、`.avi`、`.ts`、`.webm`、`.mpd` 直链。
- 磁力资源：识别 `btih` 并返回 Stremio `infoHash`。
- 外部资源：网盘、下载页等以 `externalUrl` 展示。
- 配置页：API Base、Site Base、API Key、分页、首页数量、超时、缓存、直链播放、外部资源和相关条目开关。
- 部署：Node HTTP 服务和 Cloudflare Workers 模块共用同一套协议核心。
- 诊断：`/health`、`/ddys/status`、`/ddys/search?q=关键词`、`/ddys/movie/{slug}`、`/ddys/cache/clear`。

## Release 资产

GitHub Release 提供两个文件：

```text
ddys-stremio-v0.1.1.zip
ddys-stremio-v0.1.1.zip.sha256
```

ZIP 包含源码、测试、自检脚本、Worker 配置和说明文件；不包含 `node_modules`、`dist`、`coverage`、`package`、`releases`、本机环境变量或临时产物。

校验：

```powershell
Get-FileHash .\ddys-stremio-v0.1.1.zip -Algorithm SHA256
Get-Content .\ddys-stremio-v0.1.1.zip.sha256
```

## 安装到 Stremio

本地启动后打开配置页：

```text
http://127.0.0.1:7821/configure
```

页面会生成安装链接，例如：

```text
stremio://127.0.0.1:7821/manifest.json
```

如果配置了 API Key 或自定义 API Base，安装链接会变成带配置 token 的形式：

```text
stremio://example.com/<config-token>/manifest.json
```

## 本地运行

```text
node src/server.mjs
```

默认端口：

```text
7821
```

默认 API Base：

```text
https://ddys.io/api/v1
```

公开读取接口默认不需要 API Key。配置 API Key 后，插件会向 DDYS API 请求附加：

```http
Authorization: Bearer <apiKey>
```

## Cloudflare Workers

Worker 入口：

```text
src/worker.mjs
```

配置文件：

```text
wrangler.toml
```

部署后使用：

```text
https://<worker-domain>/configure
```

## 本地检查

```text
node tools/check.mjs
node tests/run.mjs
powershell -NoProfile -ExecutionPolicy Bypass -File tools/build-package.ps1
```

打包脚本会生成确定性 ZIP 和稳定的 ASCII `.sha256` 文件。
