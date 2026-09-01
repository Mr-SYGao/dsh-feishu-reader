# 贡献指南 / Contributing

感谢你有兴趣为 **dsh-feishu-reader** 做贡献！🎉

## 开发环境

```bash
git clone git@github.com:Mr-SYGao/dsh-feishu-reader.git
cd dsh-feishu-reader
npm run test         # 单元测试（node --test）
npm run check        # 语法检查
```

> 引擎逻辑单一来源：`lib/script.js`；动态版由 `npm run build:dynamic` 生成。

## 提 Issue

- 先搜索是否已有同类 Issue
- 描述清楚：DSH 版本、飞书文档类型（docx/wiki/sheets/bitable）、期望行为 vs 实际行为
- 附上相关错误信息（可脱敏）

## 提 PR

1. Fork 本仓库并创建特性分支
2. 代码改动**必须能通过** `npm run test` 和 `npm run check`
3. 保持改动聚焦、一个 PR 解决一个问题
4. 提交信息简洁（如 `fix: ...` / `feat: ...`）
5. 描述里说明：改了什么、为什么、如何验证

## 代码风格

- 引擎（`lib/script.js`）是纯 ESM、无外部依赖，保持这一约束
- 新增功能请尽量补单元测试（`lib/script.test.js`）

有任何疑问可以提 Issue 或 PR 一起讨论。感谢你的贡献！🚢
