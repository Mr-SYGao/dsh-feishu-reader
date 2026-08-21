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

## ✨ 特性 / Features

| | 能力 | 说明 |
| --- | --- | --- |
| 📝 | **文字读取** | 云文档 / 知识库 / 电子表格 / 多维表格，保留标题、列表、代码块 |
| 🧾 | **表格还原** | 表格转成真正的 **Markdown 表格**，合并单元格内容不丢 |
| 🖼️ | **图片下载** | 文档里的图片下载到本地，AI 用视觉工具读图 |
| 🎨 | **行内格式** | `**加粗**`、`` `代码` ``、`[链接](url)` 保留 |
| 🔐 | **安全** | 凭证不落命令行、不硬编码 |
| ⚙️ | **设置界面** | 设置里一张卡片，点点就配好 |

## 🖼️ 效果预览 / Preview

<img src="assets/preview.svg" alt="设置卡片与 Markdown 输出预览" width="100%"/>

## 🚀 三步使用

### ① 加载插件

把本仓库链接（或 [`host.js`](host.js) / [`client.js`](client.js) 的内容）发给你的 DSH 助手，说：

> **「加载这个飞书插件」**

助手会自动定义并激活插件；**如果提示批准，点一下允许**即可。

> 验证：等 1 分钟，工具列表出现 `feishu_read` / `feishu_configure` 就成功了。

### ② 配置凭证

打开 **设置 → 插件 → 插件配置 → 飞书**，填 App ID 和 App Secret，点「保存凭证」。

### ③ 开始使用

把飞书文档链接发给 AI（`/docx/`、`/wiki/`、`/sheets/`、`/base/` 都支持），AI 会读出全文、表格和图片。

---

<details>
<summary><b>📋 第一次用：先准备一个飞书应用（一次性，约 5 分钟）</b></summary>

1. 打开 [飞书开放平台](https://open.feishu.cn/app) → 创建**企业自建应用**
2. 在「凭证与基础信息」拿到 **App ID**（`cli_` 开头）与 **App Secret**
3. 应用 → **权限管理** → 开通并发布：

| 权限 | 用途 |
| --- | --- |
| `docx:document:readonly` | 读取云文档 |
| `wiki:wiki:readonly` | 读取知识库 |
| `sheets:spreadsheet:readonly` | 读取电子表格 |
| `bitable:app:readonly` | 读取多维表格 |
| `drive:drive:readonly` | 下载文档内图片 |

4. 把该应用加为文档**协作者**（知识库则把应用加入成员）

</details>

<details>
<summary><b>🤔 加载后没生效 / 找不到？</b></summary>

- 没出现批准提示 → 检查是否已在插件管理界面确认运行
- 工具列表里没有 `feishu_read` → 插件可能未激活成功，重新「加载这个飞书插件」
- 设置里找不到「飞书」卡片 → 看 **设置 → 插件 → 插件配置**（不是「全部」）
- 想**重启后不用重新加载** → 用下方的**固化安装**（一劳永逸）

</details>

<details>
<summary><b>⚙️ 进阶：DSH 插件机制 & 固化安装（重启不丢）</b></summary>

**DSH 插件是什么**：插件由 **host 半部**（服务端：工具/API，即 `host.js`）和 **client 半部**（浏览器：设置界面，即 `client.js`）组成。加载 = `cordis_define`（定义）+ `cordis_run`（激活）。

**两种加载方式**：

| | 动态加载 | 固化安装 |
| --- | --- | --- |
| 怎么装 | 会话里让助手加载 | 写进 `cordis.patch.yml` 组合文件 |
| 代码存在哪 | 进程内存 | 磁盘配置文件 |
| 重启后 | ❌ 没了，需重载 | ✅ 自动加载，不会没 |
| 适合 | 临时试用 | 正式使用 / 分发 |

**固化安装步骤**（技术向）：

1. 把 `lib/` 内容放到 `C:\Users\<你>\.dsh\profiles\desktop\plugins\dsh-feishu-reader\`
2. 把 [`cordis-patch.snippet.yml`](cordis-patch.snippet.yml) 的 `- insert:` 段合并进 `C:\Users\<你>\.dsh\profiles\desktop\cordis.patch.yml`
3. 重启 DSH → 自动加载；回滚 = 删除那一段

> 两种方式跑的是**同一套引擎**（`lib/script.js`），只是加载方式不同。

</details>

## 🔧 模型工具 / Model Tools

| 工具 | 作用 |
| --- | --- |
| `feishu_read(url, app_id?, app_secret?)` | 读取文档链接 → Markdown + 图片本地路径 |
| `feishu_configure(app_id, app_secret)` | 保存凭证（不想用设置界面时可命令行配置） |

## 🧠 工作原理 / How It Works

<img src="assets/architecture.svg" alt="架构图" width="100%"/>

1. AI 调用 `feishu_read(url)` → Host 解析链接类型与文档 token
2. 引擎（`lib/script.js`）通过 **stdin** 接收凭证，调飞书 Open API
3. 文字经 blocks 接口转结构化 Markdown（表格网格重建、行内格式保留）
4. 图片下载到本地临时目录，AI 再用视觉工具读图

## 🛠️ 开发 / Development

```bash
npm run test           # 单元测试（node --test）
npm run check          # 语法检查
npm run build:dynamic  # 从 lib/ 重新生成 host.js / client.js
```

**单一来源**：引擎逻辑只在 [`lib/script.js`](lib/script.js)，动态版由构建脚本生成。

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
<summary><b>插件重启后会不会没？</b></summary>

**动态加载**（会话里让助手加载）重启会没，需重新加载（凭证不丢、重载很快）；**固化安装**（写进组合文件）重启自动加载，不会没。
</details>

<details>
<summary><b>合并单元格显示重复内容？</b></summary>

Markdown 无法表达合并，插件把主单元格内容复制到覆盖位置，保证信息不丢（属正常）。
</details>

## 📄 License

[MIT](LICENSE) · Made with 🚢 for the DSH / Feishu community
