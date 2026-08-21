# dsh-feishu-reader

DSH（DeepSeek Harness）Cordis 插件：**读取飞书文档**。既可作为动态插件即时加载，也可固化成真实插件包常驻（DSH 重启后自动加载）。

- 支持链接类型：云文档（`/docx/`）、知识库（`/wiki/`）、电子表格（`/sheets/`）、多维表格（`/base/`）
- 文字 → 结构化 Markdown（标题 / 列表 / 引用 / 代码块，基于 blocks 接口）
- 图片 → 下载到本地临时缓存，供 AI 用本地视觉工具（如 `modlens_read_image` / `read_image`）读图

## 功能特性

| 能力 | 说明 |
| --- | --- |
| 文字读取 | docx blocks 接口，保留文档结构 |
| 表格还原 | docx 表格按 `row_size × column_size` 网格重建为 **Markdown 表格**（含表头） |
| 图片下载 | `drive/v1/medias/{token}/download`，全部图片落到本地 |
| 临时缓存 | 图片存系统临时目录 `%TEMP%/dsh-feishu-images`，按飞书文件 token 命名，**同一张图不重复下载**，每次读取自动清理超 24 小时的旧缓存 |
| 凭证管理 | App ID / App Secret 存到设置命名空间 `feishu`（`settings.yaml`），兼容回退到凭证库（`FEISHU_APP_ID` / `FEISHU_APP_SECRET`） |
| 设置界面 | 在「设置 → 插件 → 插件配置」里提供折叠式配置卡片 |
| 模型工具 | `feishu_read` / `feishu_configure` |

## 快速开始

### 1. 创建飞书自建应用

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建企业自建应用
2. 「凭证与基础信息」里拿到 **App ID**（`cli_` 开头）和 **App Secret**

### 2. 开通权限（应用 → 权限管理 → 开通并发布）

| 权限 | 用途 |
| --- | --- |
| `docx:document:readonly` | 读取云文档 |
| `wiki:wiki:readonly` | 读取知识库 |
| `sheets:spreadsheet:readonly` | 读取电子表格 |
| `bitable:app:readonly` | 读取多维表格 |
| `drive:drive:readonly` | 下载文档内图片 |

### 3. 授权文档给应用

- 云文档 / 表格：把该应用加为文档**协作者**
- 知识库：把应用加入知识库**成员**

### 4. 加载插件

**方式 A：动态插件（临时，进程内）**——通过 DSH 插件工具（`cordis_define` + `cordis_run`）加载：

- `host.js` 内容 → `code.host`
- `client.js` 内容 → `code.client`

**方式 B：固化常驻（推荐）**——见下方 [固化（常驻）](#固化常驻dsh-重启后自动加载)。

### 5. 配置凭证

两种方式任选：

- 设置页：**设置 → 插件 → 插件配置 → 飞书**，填入 App ID / App Secret，点「保存凭证」
- 或调用工具 `feishu_configure(app_id, app_secret)`

## 使用

给 AI 一条飞书文档链接即可，例如：

```
https://xxx.feishu.cn/docx/AbCdEf...
https://xxx.feishu.cn/wiki/WlMnOp...
https://xxx.feishu.cn/sheets/QrSt...
https://xxx.feishu.cn/base/UvWx...
```

AI 会调用 `feishu_read(url)`：

1. 解析链接类型与文档 token
2. 读取文字（blocks → Markdown）
3. 下载全部图片到本地临时缓存（命中缓存则不重复下载）
4. 返回 Markdown + 图片本地路径，再用本地视觉工具读图

## 固化（常驻，DSH 重启后自动加载）

`lib/` 目录是**真实 Cordis 插件包**（ESM + 真实库 API），可挂进宿主组合，与其它 `@deepseek-ai/*` 插件同款做法：

1. 把 `lib/` 的内容放到 profile 的插件目录：
   `C:\Users\Mr.Gao\.dsh\profiles\desktop\plugins\dsh-feishu-reader\`
2. 把 [`cordis-patch.snippet.yml`](cordis-patch.snippet.yml) 里的 `- insert:` 段合并进：
   `C:\Users\Mr.Gao\.dsh\profiles\desktop\cordis.patch.yml`
3. 重启 DSH。回滚：删除 `cordis.patch.yml` 里刚加的 insert 段即可。

固化版的凭证：App ID 存设置命名空间 `feishu`（`settings.yaml`），App Secret 存凭证库
（`FEISHU_APP_SECRET`）；读取时兼容回退旧凭证（`FEISHU_APP_ID`），现有凭证不用重配。

## 实现说明

- Host 侧 `web.fetch` 不支持带鉴权头的请求，因此实际 HTTP 调用由 `subprocess` 启动本机 `node` 运行引擎（`lib/script.js`）完成（Node ≥ 18 自带 `fetch`）
- **安全**：App Secret 通过 stdin 传给引擎子进程，**不落命令行参数**
- 引擎单一来源：`lib/script.js`（动态版 `host.js` / `client.js` 由 `scripts/build-dynamic.mjs` 生成）
- 图片缓存：`<系统临时目录>/dsh-feishu-images/`，按文件 token 缓存，TTL 24 小时
- 文档内容缓存：`<系统临时目录>/dsh-feishu-cache/`，TTL 10 分钟，避免重复请求
- 不包含任何硬编码密钥

## 已知限制

- Markdown 无法表达表格合并单元格：合并的主单元格内容会复制到覆盖位置（信息不丢），但视觉上非合并
- 单次读取最多下载 30 张图片（超过部分仅提示，不下载）

## License

[MIT](LICENSE)

---

# dsh-feishu-reader (English)

A DSH (DeepSeek Harness) Cordis plugin that **reads Feishu (Lark) documents** — cloud docs (`/docx/`), wiki (`/wiki/`), spreadsheets (`/sheets/`), and Bitable (`/base/`).

- Text → structured Markdown (headings / lists / quotes / code blocks, via the docx blocks API)
- Tables → proper Markdown tables (reconstructed from `row_size × column_size` grid + `merge_info`; merged content is repeated so nothing is lost)
- Images → downloaded to a local temp cache for the AI to read with local vision tools (e.g. `modlens_read_image` / `read_image`)
- Inline styles preserved (`**bold**`, `` `code` ``, `[links](url)`)

## Features

| Capability | Description |
| --- | --- |
| Text | docx blocks API, document structure preserved |
| Tables | Markdown table reconstruction with header row |
| Images | downloaded via `drive/v1/medias/{token}/download` to local temp cache |
| Temp cache | `<temp>/dsh-feishu-images` keyed by file token (no re-download), 24h TTL; doc content cached 10 min |
| Credentials | App ID in settings namespace `feishu`, App Secret in the credentials store (`FEISHU_APP_SECRET`) |
| Settings UI | collapsible card under Settings → Plugins → Plugin config |
| Model tools | `feishu_read` / `feishu_configure` |

## Quick start

1. Create a Feishu custom app at [open.feishu.cn](https://open.feishu.cn/app); copy the **App ID** (`cli_…`) and **App Secret**.
2. Enable & publish permissions: `docx:document:readonly`, `wiki:wiki:readonly`, `sheets:spreadsheet:readonly`, `bitable:app:readonly`, `drive:drive:readonly` (image download).
3. Share the docs with the app (add it as a collaborator; for wiki, add it to the space members).
4. Load the plugin (see below), then configure credentials via the settings card or `feishu_configure`.

## Loading

- **Dynamic (temporary, in-process):** paste `host.js` / `client.js` into `cordis_define` (`code.host` / `code.client`). These are generated from `lib/` via `npm run build:dynamic`.
- **Persistent (recommended):** the `lib/` directory is a real Cordis package (ESM + real APIs). Put it under your profile's `plugins/`, add the row from [`cordis-patch.snippet.yml`](cordis-patch.snippet.yml) to `cordis.patch.yml`, restart DSH. Rollback: remove the inserted row.

## Development

```bash
npm run test          # unit tests (node --test)
npm run check         # syntax checks
npm run build:dynamic # regenerate host.js / client.js from lib/
```

## Security & design notes

- Credentials are passed to the engine subprocess via **stdin**, never in command-line arguments.
- The engine (`lib/script.js`) is the single source of truth; both the dynamic and package builds run the same code.
- No hardcoded secrets.

## Known limitations

- Markdown cannot express merged table cells: the merged master content is repeated into covered positions (no data loss, but not visually merged).
- At most 30 images are downloaded per read.

## License

[MIT](LICENSE)
