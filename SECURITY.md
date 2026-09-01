# 安全策略 / Security Policy

## 报告漏洞

如果你发现 **dsh-feishu-reader** 的安全问题，请通过 GitHub 的**私有安全公告**（Security Advisory）报告：

- **报告入口**：https://github.com/Mr-SYGao/dsh-feishu-reader/security/advisories/new

> 使用你的 GitHub 账号即可提交，报告会私密送达维护者。

## 报告内容

- 受影响版本（`npm view dsh-feishu-reader` 可查）
- 问题类型（如信息泄露、注入、越权等）
- 复现步骤
- 影响范围
- 建议修复方向（可选）

## 说明

本插件通过飞书开放平台 API 读取文档，**凭证保存在本机 DSH 凭证库**，不会上传。请勿在 Issue、日志、工具调用参数中泄露你的密钥。
