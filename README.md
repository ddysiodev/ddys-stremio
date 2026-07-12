# ddys-stremio

低端影视 API 的官方 Stremio 全功能插件。安装后可在 Stremio 中使用 DDYS 目录、搜索、详情和播放源。

## 功能

- `manifest.json`：声明 DDYS catalog、meta、stream、subtitles 资源。
- 首页目录：最新电影、最新剧集、热门电影、热门剧集。
- 分类目录：电影、剧集、动漫、综艺、纪录片。
- DDYS 搜索：通过 Stremio catalog extra `search` 提供全局搜索入口。
- 详情页：标题、封面、简介、年份、地区、类型、导演、演员、评分、源站链接。
- 播放源：`.m3u8`、`.mp4`、`.m4v`、`.mkv`、`.mov`、`.flv`、`.avi`、`.ts`、`.webm`、`.mpd` 直链。
- 磁力资源：识别 `btih` 并返回 Stremio `infoHash`。
- 外部资源：网盘、下载页等以 `externalUrl` 展示。
- 配置：API Base、Site Base、API Key、分页、首页数量、超时、缓存、直链播放、外部资源展示。
- 部署：Node HTTP 服务和 Cloudflare Workers 模块共用同一套协议核心。
- 诊断：`/health`、`/ddys/status`、`/ddys/search?q=关键词`、`/ddys/movie/{slug}`、`/ddys/cache/clear`。

## 安装到 Stremio

启动服务后打开：

```text
http://127.0.0.1:7821/configure
```

页面会生成安装链接，例如：

```text
stremio://127.0.0.1:7821/manifest.json
```

如果配置了 API Key，安装链接会变成带配置 token 的形式：

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

## Release 内容

Release ZIP 包含源码、测试、自检脚本、Worker 配置和说明文件，不包含 `node_modules`、构建产物或本机环境变量。
