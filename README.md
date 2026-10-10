# 1688cli

`@petercjl/1688cli` 是面向 Codex、SealSeek 和 WorkBuddy 的只读 1688 找货插件。它统一调用本机已有的 1688 官方找商品、找供应商 Skill，提供稳定 JSON、基础筛选和同一份可移植 Agent Skill。无需复制官方代码，也不直接调用未公开的数据接口。

应用层 Skill 以用户是否提供参考图为一级路由：无图时探索款式，有图时逐图寻找相近货源。探索模式先把每轮返回链接归并为唯一商品库，再按每批最多 10 张主图调用 Agent 视觉能力逐图打标；全部图片完成后基于可见标签进行相似性聚类。标题只在聚类后用于命名、扩词和冲突提示。之后再按主要视觉款式、标签、价格、起订量和商家初筛；HTML 同时有分类视图与全部唯一链接，商家沟通由人完成。

## 状态

版本 `0.3.0`，npm 包名 `@petercjl/1688cli`，public。三种 Agent 共用同一 CLI 和规范 Skill。macOS/Windows 安装机制和实际宿主验证分别记录于 [兼容性记录](docs/compatibility.md)。
## 安装与配置

需要 Node.js >=20、Python 3，以及已安装的官方 `1688-product-find`、`1688-source-suppliers`。官方 Skill 及其 AK 独立于本包。仅安装本包并不会获得 1688 服务访问权。

```bash
npm install --global @petercjl/1688cli
1688cli doctor --json
1688cli skill install --agent codex
1688cli skill install --agent sealseek
1688cli skill install --agent workbuddy --mode copy
```

默认查找 `~/.openclaw/workspace/skills/1688-product-find`、`~/.openclaw/workspace/skills/1688-source-suppliers` 和 `~/workspace/.1688-AK/.ak_store.json`。可用 `ALI1688_PRODUCT_SKILL_DIR`、`ALI1688_SUPPLIER_SKILL_DIR`、`ALI1688_AK_STORE` 调整。临时认证可用 `ALI_1688_AK` 环境变量；不建议将其写进仓库或命令行参数。

## 命令

```bash
1688cli capabilities --json
1688cli products search "不粘平底锅" --limit 20 --sort sold_desc --output ./pan.json
1688cli products image ./reference.jpg --limit 10
1688cli products link "https://detail.1688.com/offer/123.html" --limit 10
1688cli suppliers search "平底锅工厂" --output ./suppliers.json
1688cli screen ./pan.json --max-price 60 --max-moq 100 --min-sold 20
1688cli screen ./suppliers.json --location 浙江 --proofing
1688cli research collect ./search-manifest.json --output ./inventory.json
1688cli research visual-batches ./inventory.json --output ./visual-batches.json
1688cli research build ./inventory.json --context ./analysis.json --output ./sourcing-result.json
1688cli screen ./sourcing-result.json --relevance relevant,possible --category breakfast --supplier 甲厂 --max-price 50
1688cli research validate ./sourcing-result.json
1688cli research viewmodel ./sourcing-result.json --output ./report-viewmodel.json
commerce-ui render --input ./report-viewmodel.json --output ./report.html
commerce-ui validate ./report.html
1688cli skill source
1688cli skill status
1688cli skill update --agent codex
1688cli update --check
```

所有查询默认将 JSON 输出到 stdout。`--output` 只创建新文件，已存在时返回 `OUTPUT_EXISTS`。错误输出为 `{ "ok": false, "error": { "code", "message" } }`。`doctor --json` 不展示 AK 值。

`doctor` 的 AK 检查仅表示本地已配置，不代表服务端仍接受此 AK。若真实查询返回 `ACCESS_DENIED`，应核对 AK 有效性、权限和访问频率。

HTML 交付使用精确名称为 `compact-commerce-ui` 的当前 Skill 和 `commerce-ui` CLI，模板契约固定为已安装的 `compact-workbench@1.0`。`research viewmodel` 仅转换已验证的找货 JSON：每个商品须有 HTTPS 图片 URL 与商品链接；HTML 直接引用网络图片，不下载或嵌入本地。页面离线打开时文字、分类和链接仍在，但商品图片需要联网加载。缺少 `commerce-ui` 或模板契约时保留证据 JSON 并报告依赖问题。

商品的价格、销量、严选指数等来自官方 Skill 返回值，可能因时效和口径变化而变动；筛选是对已返回数据的本地规则判断，不代表供应商审厂或质量认证。工厂资质、货期、库存、样品和最终报价仍需人工核验。插件不提供询盘、消息、购物车、下单或支付能力。

## 架构

- `src/provider.mjs`：官方 Skill 子进程桥接与 AK 注入。
- `src/normalize.mjs`：统一商品和供应商结构，保留来源信息。
- `src/capabilities.mjs`：机器可读能力注册表。
- `skill/SKILL.md`：唯一规范 Agent Skill；macOS 默认受管理链接，Windows 默认校验哈希的受管理副本。
- `src/skill-manager.mjs`：安装、状态和更新；已有非受管理目标不覆盖。
- `src/research-validator.mjs`：对 Skill 的探索型、精确型结果进行只读结构校验。
- `src/research-collect.mjs` 与 `src/research-build.mjs`：确定性地归并所有返回链接并生成完整商品库，不因精选展示而丢数据。
- `src/visual-batches.mjs`：生成不含标题和其他文字条件的 10 图视觉工作批次，避免文字污染款式判断。
- `src/research-viewmodel.mjs`：将找货证据稳定映射为分类商品 ViewModel；HTML/CSS 由共享的 `commerce-ui` 模板包生成。

## 安装、更新与恢复契约

`skill source --json` 返回包内唯一来源。`skill status --agent <agent> --json` 返回 installed、managed、current、edited 和实际路径。`skill install|update` 支持 `--mode copy|link`、`--path <目录>`，未知 Agent 和已有非受管理目录均拒绝覆盖。`--agent all` 操作三个目标；`--path` 只接受单个 Agent。

默认目录：Codex 使用 `CODEX_HOME/skills/1688cli` 或 `~/.codex/skills/1688cli`；WorkBuddy 使用 `~/.workbuddy/skills/1688cli`；SealSeek 使用 `~/.sealseek/skills/1688cli`，已有 `~/.agents/skills/1688cli` 安装继续使用原位置。Windows 的 `~` 表示当前用户主目录。可用 `ALI1688_CODEX_SKILLS_DIR`、`ALI1688_SEALSEEK_SKILLS_DIR`、`ALI1688_WORKBUDDY_SKILLS_DIR` 指定宿主实际加载的 Skill 根目录。

macOS 默认链接，Windows 默认复制；WorkBuddy 可显式使用复制模式。副本更新保留自定义 `agents/openai.yaml`。检测到其他本地修改时停止；审阅后用 `--force` 会先完整备份再更新。目录锁阻止重命名时，对受管理副本执行有备份的原位同步。结果和错误包含备份路径；失败时保留恢复材料。手动恢复时先退出占用 Skill 的宿主，将备份复制到新的恢复目录核对，再替换目标；不要丢弃当前目录。

`1688cli update check`（兼容 `--check`）只查询 npm `latest`；`update install`（兼容 `--apply`）显式更新全局包，备份原包，核对版本，并同步已有受管理 Skill。普通查询不检查或自动升级。不会降级或安装预发布版本，Git 源码仓库通过 Git 更新。离线查询失败不修改安装；更新失败返回完整包备份路径。需要回退时，先检查备份，再用 npm 安装已知可用的确切旧版本并同步 Skill。配置与 AK 始终在包外。

## 外部服务依赖

本包执行官方提供者，应用 Skill 决定搜索策略和报告内容。安装 npm 包不复制官方代码、不创建 AK。

- 官方商品 Skill：[1688-product-find](https://clawhub.ai/1688aiinfra/1688-product-find)，已验证版本 1.7.0。
- 官方供应商 Skill：[1688-source-suppliers](https://clawhub.ai/1688aiinfra/1688-source-suppliers)，已验证版本 1.0.0。
- 从官方页面安装完整 Skill 后，用 `ALI1688_PRODUCT_SKILL_DIR` / `ALI1688_SUPPLIER_SKILL_DIR` 指向包含 `cli.py` 的目录。CLI 自动发现 `.1688cli/providers`、OpenClaw、SealSeek、WorkBuddy、共享 Agent 和 Codex Skill 目录。
- Python 3 需可导入 `requests`、`keyring`、`PIL`。优先发现宿主管理的 Python，再检查虚拟环境和 PATH；`ALI1688_PYTHON` 显式指定时只验证该解释器。通过该解释器的受管理环境或 venv 安装官方 requirements，然后重新运行 doctor；不修改受保护的系统 Python。
- `doctor` 验证解释器和依赖导入，分别报告查询依赖和 HTML 报告依赖。缺少报告依赖不影响独立商品查询。`report_ready` 表示本地报告契约探测成功，不表示已完成报告。
- HTML 依赖独立的 `@petercjl/commerce-ui` 包和 `compact-commerce-ui` Skill；安装后通过该 CLI 的 `skill source/status/install` 管理。Agent 视觉能力由各宿主提供，缺失时报告能力错误。

AK 由官方服务授权；`doctor` 只报告是否配置。在线有效性须以真实查询结果为准。日志和错误不输出 AK。
