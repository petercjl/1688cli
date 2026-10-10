---
name: 1688cli
description: Execute explicit read-only 1688 product searches by keyword, image or link, supplier searches, and local filtering. Use as the atomic capability contract for 1688 applications or a direct single query.
---

# 1688 原子查询能力

## 责任与契约

本包执行调用方明确指定的查询、规范化数据和本地筛选。应用负责查询策略、选品判断、视觉分类、报告和业务验收。商品契约为 `1688-products@1`，供应商为 `1688-suppliers@1`；通过 `capabilities --json` 发现当前能力。

## 主线

1. 用 `1688cli skill source --json` 找到当前规范 Skill，读取它；运行 `1688cli version --json`、`1688cli capabilities --json`、`1688cli doctor --json`。
2. 检查 Node.js 20+、官方 `1688-product-find` / `1688-source-suppliers` provider、Python 3 的 requests/keyring/Pillow，以及用户自己的 1688 AK。安装 npm 包仅提供执行能力，不授予服务访问权限。doctor 的认证项只验证本地配置。
3. 按调用方输入执行下面的一次原子操作，保留 UTF-8 查询、图片语义和明确筛选条件。默认 limit=10；调用方可显式传入。以图查找每次接收一个可访问的图片路径或 URL。
4. 返回完整 JSON 和真实错误，写文件时仅接受新路径。把业务结果交还调用应用，由其决定下一步。

```bash
1688cli products search "平底锅" --limit 20 --output products.json
1688cli products image "https://example.com/reference.jpg" --limit 20
1688cli products link "商品链接" --limit 20
1688cli suppliers search "平底锅工厂"
1688cli screen products.json --max-price 50 --max-moq 10
```

商品返回 `{ok,kind,query,count,products[]}`，行内含 offer_id、title、url、image_url、price、moq、sku_id、sku_title、supplier_name、supplier_member_id、销量/库存/服务标签和 source。缺失数字为 null。供应商返回 suppliers[]，保留公司链接、地区、服务及来源。平台字段是待核实的平台声明；图搜相似度不保证同款。当前能力不提供已验证的全平台分页或总量。

## 失败与恢复

`AUTH_REQUIRED` / `ACCESS_DENIED` 交还调用方刷新官方授权；不输出凭证。缺少 provider 或 Python 时安装官方依赖并重跑 doctor。超时保留失败状态，读取操作可在调用方允许后重试。`OUTPUT_EXISTS` 改用新路径。业务数据只经本 CLI 的官方适配器获取。支持范围为只读查询，不含询盘、发送消息、下单或付款。

## 生命周期与平台

```bash
1688cli skill install --agent codex
1688cli skill status --json
1688cli skill update --agent sealseek
1688cli skill install --agent workbuddy
1688cli update check
1688cli update install
```

Codex、SealSeek、WorkBuddy 共用一个规范 Skill；macOS 默认链接，Windows 默认受管理副本。更新校验哈希，拒绝占用路径和未经处理的本地改动，保留恢复备份。平台验证范围见包内 compatibility 文档。

应用入口：`1688-product-sourcing` 处理关键词/参考图找货；`1688-opportunity-sourcing-research` 处理兼容机会文件的六类组合选品。应用分别发布，原子包不加载其策略。
