<div align="center">

<img src="assets/logo.svg" width="110" alt="dsh-feishu-reader logo"/>

# 🚢 dsh-feishu-reader

**读取飞书文档 — 文字 / 表格 / 图片，一键转 Markdown 喂给 AI**
<br/>
*Read Feishu (Lark) docs — text, tables & images — as Markdown for your AI*

[![version](https://img.shields.io/badge/version-1.1.0-3370ff?style=flat-square)](https://github.com/Mr-SYGao/dsh-feishu-reader)
[![license](https://img.shields.io/badge/license-MIT-green?style=flat-square)](LICENSE)
[![node](https://img.shields.io/badge/node-%3E%3D18-339933?style=flat-square)](package.json)
[![tests](https://img.shields.io/badge/tests-12%20passed-37c96b?style=flat-square)](#-开发)
[![PRs](https://img.shields.io/badge/PRs-welcome-8a5cf6?style=flat-square)](https://github.com/Mr-SYGao/dsh-feishu-reader)

</div>

---

## 📖 目录 / Contents

- [✨ 特性 / Features](#-特性--features)
- [🖼️ 效果预览 / Preview](#-效果预览--preview)
- [🚀 快速开始 / Quick Start](#-快速开始--quick-start)
- [🔧 模型工具 / Model Tools](#-模型工具--model-tools)
- [🧠 工作原理 / How It Works](#-工作原理--how-it-works)
- [💾 固化常驻 / Persistence](#-固化常驻--persistence)
- [🛠️ 开发 / Development](#-开发--development)
- [❓ 常见问题 / FAQ](#-常见问题--faq)
- [📄 License](#-license)

## ✨ 特性 / Features

| | 能力 | 说明 |
| --- | --- | --- |
| 📝 | **文字读取** | docx blocks 接口，保留标题 / 列表 / 引用 / 代码块结构 |
| 🧾 | **表格还原** | 按 `row_size × column_size` 网格重建 **Markdown 表格**（含表头），合并单元格内容不丢失 |
| 🖼️ | **图片下载** | `drive/v1/medias/{token}/download` 全量下载到本地，AI 可用视觉工具读图 |
| 🎨 | **行内格式** | `**加粗**`、`` `行内代码` ``、`[链接](url)` 保留 |
| 🗃️ | **临时缓存** | 图片按 token 缓存（24h TTL）、文档内容缓存（10 分钟），避免重复请求 |
| 🔐 | **安全凭证** | App Secret 存凭证库、经 **stdin** 传给引擎，**不落命令行参数** |
| ⚙️ | **设置界面** | 「设置 → 插件 → 插件配置」折叠卡片，可视化配置 |

支持链接类型：**docx**（云文档）· **wiki**（知识库）· **sheets**（电子表格）· **base**（多维表格）。

## 🖼️ 效果预览 / Preview

<img src="assets/preview.svg" alt="设置卡片与 Markdown 输出预览" width="100%"/>

## 🚀 快速开始 / Quick Start

### 1️⃣ 创建飞书自建应用

打开 [飞书开放平台](https://open.feishu.cn/app) → 创建**企业自建应用**，在「凭证与基础信息」拿到 **App ID**（`cli_` 开头）与 **App Secret**。

### 2️⃣ 开通权限（应用 → 权限管理 → 开通并发布）

| 权限 | 用途 |
| --- | --- |
| `docx:document:readonly` | 读取云文档 |
| `wiki:wiki:readonly` | 读取知识库 |
| `sheets:spreadsheet:readonly` | 读取电子表格 |
| `bitable:app:readonly` | 读取多维表格 |
| `drive:drive:readonly` | 下载文档内图片 |

### 3️⃣ 授权文档给应用

- 云文档 / 表格：把应用加为文档**协作者**
- 知识库：把应用加入知识库**成员**

### 4️⃣ 加载插件：DSH 插件的使用方式

> **DSH 插件是什么**：DSH（DeepSeek Harness）的插件是 **Cordis 插件**，由两个半部组成——
> **host 半部**（服务端：模型工具、API 调用逻辑，即 `host.js`）和 **client 半部**（浏览器：设置界面，即 `client.js`）。
> 加载插件 = 把这两个半部定义出来并激活。

**方式 A · 动态加载（最快，推荐给多数用户）**

1. **让助手帮你加载**（最简单）：把本仓库地址（或 `host.js` / `client.js` 的内容）发给你的 DSH 助手，说「帮我加载这个飞书插件」。助手会调用 DSH 插件工具完成：
   - `cordis_define`：`host.js` 内容 → `code.host`，`client.js` 内容 → `code.client`（**定义**插件）
   - `cordis_run`：**激活**插件。因为包含浏览器界面，首次激活需要你在界面上**点批准**
2. **手动加载**（如果你有插件管理界面/工具）：步骤同上，把 [`host.js`](host.js) / [`client.js`](client.js) 的内容分别填入 `code.host` / `code.client`，然后 `cordis_run`。
3. **验证成功**：
   - 模型工具列表出现 `feishu_read` / `feishu_configure`
   - **设置 → 插件 → 插件配置** 出现「飞书」卡片

> ⚠️ 动态插件是**当前进程内临时**的：DSH 重启后需重新加载（已保存的凭证不受影响）。想一劳永逸，用**方式 B**。

**方式 B · 固化常驻（DSH 重启后自动加载）** —— 见下方 [固化常驻](#-固化常驻--persistence)。

### 5️⃣ 配置凭证

- 设置页：**设置 → 插件 → 插件配置 → 飞书**，填入 App ID / App Secret，点「保存凭证」
- 或调用工具：`feishu_configure(app_id, app_secret)`

## 🔧 模型工具 / Model Tools

| 工具 | 作用 |
| --- | --- |
| `feishu_read(url, app_id?, app_secret?)` | 读取文档链接 → Markdown + 图片本地路径 |
| `feishu_configure(app_id, app_secret)` | 保存凭证（App ID → 设置，App Secret → 凭证库） |

> 直接把链接丢给 AI 即可，例如 `https://xxx.feishu.cn/wiki/WlMnOp...`。

## 🧠 工作原理 / How It Works

<img src="assets/architecture.svg" alt="架构图" width="100%"/>

1. AI 调用 `feishu_read(url)` → Host 解析链接类型与文档 token
2. 引擎（`lib/script.js`，Node ≥ 18 自带 `fetch`）通过 **stdin** 接收凭证，调飞书 Open API
3. 文字经 blocks 接口转结构化 Markdown（表格网格重建、行内格式保留）
4. 图片下载到系统临时目录，AI 再用本地视觉工具（`modlens_read_image` / `read_image`）读图

> 为什么用子进程：Host 侧 `web.fetch` 不支持带鉴权头的请求，故由 `subprocess` 启动本机 `node` 执行引擎。

## 💾 固化常驻 / Persistence

**原理**：DSH 的宿主组合由多层 `cordis.yml` 补丁组成（bundle 层 + 你的 profile 补丁层）。把插件写进 profile 的 `cordis.patch.yml`，DSH 每次启动就会自动加载它——这就是「正式安装」的方式。

`lib/` 目录是**真实 Cordis 插件包**（ESM + 真实库 API），与其它 `@deepseek-ai/*` 插件同款做法：

1. 把 `lib/` 内容放到 profile 插件目录：`C:\Users\<你>\.dsh\profiles\desktop\plugins\dsh-feishu-reader\`
2. 把 [`cordis-patch.snippet.yml`](cordis-patch.snippet.yml) 里的 `- insert:` 段合并进你的补丁层 `C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`（该文件即「用户补丁层」，默认是空的 `[]`，就是留给用户加插件行的）
3. 重启 DSH → 插件自动加载，工具与设置卡片都在
4. **回滚**：删除刚加的 insert 段即可

> 动态加载（方式 A）与固化（方式 B）跑的是**同一套引擎**（`lib/script.js`），只是加载方式不同。

凭证兼容：App ID 读设置命名空间 `feishu`，App Secret 读凭证库 `FEISHU_APP_SECRET`，并回退旧凭证 `FEISHU_APP_ID` —— 现有配置不用重配。

## 🛠️ 开发 / Development

```bash
npm run test           # 单元测试（node --test，12 个用例）
npm run check          # 语法检查（lib/ + 生成的动态版）
npm run build:dynamic  # 从 lib/ 重新生成 host.js / client.js
```

**单一来源**：引擎逻辑只在 [`lib/script.js`](lib/script.js)，动态版由构建脚本生成，杜绝两处漂移。

## ❓ 常见问题 / FAQ

<details>
<summary><b>图片下载失败？</b></summary>

检查应用是否开通 `drive:drive:readonly` 并发布，且文档已分享给应用。
</details>

<details>
<summary><b>报「缺少飞书凭证」？</b></summary>

到设置卡片或 `feishu_configure` 保存 App ID / App Secret；或调用时直接传 `app_id` / `app_secret`。
</details>

<details>
<summary><b>合并单元格显示重复内容？</b></summary>

Markdown 无法表达合并，插件把主单元格内容复制到覆盖位置以保证信息不丢（视觉上非合并，属正常）。
</details>

<details>
<summary><b>动态插件重启后没了？</b></summary>

动态插件是进程内临时的。如需常驻，用[固化常驻](#-固化常驻--persistence)方案。
</details>

## 📄 License

[MIT](LICENSE) · Made with 🚢 for the DSH / Feishu community
