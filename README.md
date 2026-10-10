# 1688 原子查询

关键词、图片和链接查商品，查供应商，对已有结果执行明确筛选。

## 安装与使用

```sh
npm install -g @petercjl/1688cli
1688cli skill install --agent codex
1688cli doctor --json
1688cli capabilities --json
```

Agent 可选择 `codex`、`sealseek`、`workbuddy`。macOS 默认使用链接；Windows 默认受管理副本。所有平台使用同一份包内 Skill，通过 `1688cli skill source --json` 定位。`skill status` 检查哈希和所有权，`skill update` 同步安装，`update check|install` 更新稳定 npm 版本。开发源码由 Git 管理。

## 架构与依赖

`@petercjl/1688cli` 属于原子能力层；`@petercjl/1688-product-sourcing` 与 `@petercjl/1688-opportunity-sourcing-research` 属于独立应用层。`@petercjl/taobao-ai-ops` 注册和管理这些独立组件。

原子包依赖 Node.js 20+、官方 1688 provider、Python requests/keyring/Pillow 和用户自有 AK。安装不附带服务授权。应用通过版本化商品/供应商契约获取事实，自己管理查询计划、分析、项目文件和业务 QA。找货应用的 HTML 依赖 commerce-ui 的 compact-workbench@1.0；机会选品应用携带自己的报告模板并使用 Python 3 标准库。

平台数据均为只读；不发送询盘、不下单、不支付。输出文件仅写入新路径。凭证在用户环境中，包内不含凭证。doctor 只检查本地配置，实际授权以服务响应为准。

## 使用入口

先完整读取包内 `skill/SKILL.md`。原子查询用 `1688cli products search/image/link`、`suppliers search`、`screen`。找货应用的确定性处理用 `1688-product-sourcing research ...`；机会选品应用用 `1688-opportunity-sourcing-research script ...`，脚本和参数见该 Skill。

应用的 `tool <arguments...>` 委托安装的原子依赖，支持 `tool skill source --json` 动态加载依赖说明。输入的关键词、图片和限制原样传入；服务错误和证据缺失保留给应用决定恢复路径。

## 验证与发布

`npm test`、`npm run check`、`node scripts/packed-smoke.mjs` 验证生命周期和契约。GitHub Actions 覆盖 macOS/Windows 与 Node 22/24。真实 Agent 视觉、浏览器与服务登录另行验证，状态见 [兼容性](docs/compatibility.md)。发布经 GitHub Actions/npm Trusted Publishing。
