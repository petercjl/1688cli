---
name: 1688cli
description: Use 1688cli for high-coverage, read-only 1688 sourcing by keyword or image. Preserve every discovered offer, analyze product images in batches of ten, cluster visible product styles, compare prices and suppliers, and deliver categorized HTML plus traceable JSON.
---

# 1688 找货

## 目标与边界

把用户的商品需求转化为高覆盖、可追溯的 1688 搜索、唯一商品库、价格与商家初筛以及人工询价交接。商品查询只通过 `@petercjl/1688cli` 的稳定 CLI；Agent 负责观察结果、选择下一轮词或图、判断相关性。平台标价、销量、材质、工厂标签等是待核实的平台信息。询盘、消息、订单和付款由人执行。

本 Skill 是包内唯一规范副本。Codex、SealSeek 与 WorkBuddy 的安装目录是受管理目标，业务方法只在此处维护。

## 运行环境

通过 `1688cli skill source --json` 定位当前包内规范 Skill，并从该目录解析资源。运行 `1688cli version --json`、`1688cli capabilities --json` 和 `1688cli doctor --json`。按宿主选择 `adapters/codex.json`、`adapters/sealseek.json` 或 `adapters/workbuddy.json`；使用当前宿主提供的终端、视觉和文件交付能力。安装与更新使用 `1688cli skill install|update --agent <agent>`，本地修改须先审阅，备份后才可覆盖。macOS 与 Windows 共用 CLI 契约，实际兼容性以包内验证记录为准。

## 输入与一级路由

接受自然语言、关键词、可访问的参考图片路径/URL，或多张参考图；预算、采购量、场景、材质和地区为可选约束。**按用户输入中是否有参考图选择模式：**

- `explore`：没有用户参考图。即使文字描述很具体，仍从文字需求探索实际款式和平台叫法；结果中的商品图可作为后续图搜种子，但不改变本次模式。
- `precise`：有一张或多张用户参考图。每张图分别建搜索锚点，文字条件用于解释目标与筛选。多图默认保留各自来源；只有证据清楚时才把它们视为同一商品的不同视角，含义不明且会影响筛选时向用户确认。

如果图片仅在对话中可见、无法作为本机文件路径或 HTTPS URL 交给 CLI，先尝试使用宿主明确提供的可访问路径；仍不可用时请求用户提供文件或链接。不要假装完成图搜，也不要用生成图代替用户参考图。

## 主线：两种模式汇合于 CLI 查询

1. **立项。** 保留用户原话与参考图清单，提取硬约束、偏好及未知项。只在缺失信息会改变产品类别或安全边界时提问；其余开放条件作为探索空间。建立新的研究目录，不覆盖既有文件。
2. **按需加载当前模式的方法。** 只在当前知识依赖节点需要制定搜索策略时读取 [references/SCHEMA.md](references/SCHEMA.md)、[references/index.md](references/index.md) 和近期 [references/log.md](references/log.md)，然后只走当前模式的查询路由：`explore` 用 [模糊需求路由](references/queries/vague-search.md)，`precise` 用 [参考图路由](references/queries/image-led-search.md)。完成该节点后回到第 3 步；输出契约留到交付节点，其他后续节点资料保持延迟加载。不要在启动时读取全部参考资料。
3. **检查执行能力。** 运行 `1688cli doctor --json` 与 `1688cli capabilities --json`，按 [capabilities.json](capabilities.json) 和当前平台的 `adapters/<platform>.json` 核对所需能力。`doctor` 只检查本地 AK 是否配置，不能证明服务端仍接受。能力缺失时保留真实错误，停止相关分支。
4. **扩展查询。** 每个词、图或链接写明搜索假设与来源，逐轮保存原始 JSON。无图模式从大类词开始；搜索词只负责召回，不负责定义款式类别。有图模式逐图首搜，再由相符商品反推平台叫法。记录每轮返回、新增唯一商品和新增相关商品。搜索预算按任务规模设置；不能只因找到几个代表款而停止。底层仍只通过 `1688cli products search/image/link`。
5. **归并完整商品库。** 将成功查询登记到新清单 JSON，运行 `1688cli research collect <search-manifest.json> --output <新-inventory.json>`。它按 `offer_id` 生成唯一商品库，保留全部来源及 SKU/价格观察。遇到授权、限流或服务错误时保留部分结果；单次零结果不等于平台无货。
6. **逐图视觉打标。** 探索模式运行 `1688cli research visual-batches <inventory.json> --output <新-visual-batches.json>`，得到只含 `offer_id` 与 `image_url` 的批次；标题、SKU、搜索词、价格和商家不得进入本节点输入。若当前视觉能力需要本地文件，运行 `1688cli research visual-materialize <visual-batches.json> --output-dir <新目录>`，只下载本任务的商品主图并保留 ID 映射。按批次调用当前 Agent 广告的 `sourcing.image.inspect`：每批最多 10 张、同一轮并发读取，逐张返回主体、可见结构标签、可见依据、置信度和 `classified` / `needs_review` / `unusable`。不得从图像猜材质、涂层、钢号、功能或质量。最后不足 10 张可按实际数量执行；能力不能并发检查并逐图对应时返回 `CAPABILITY_UNAVAILABLE`，不得退回标题分类。
7. **视觉相似性聚类。** 全部可用图片完成逐图打标后，运行 `1688cli research visual-compile <visual-batches.json> --tag-dir <视觉标签目录> --output <新-visual-catalog.json>`，先校验每个 `offer_id` 恰有一条标签，再根据主体形态、轮廓、结构、部件关系、开孔/分格、深浅及其他可见标签聚类。每个已分类商品只有一个主要结构簇；多维可见特征留在 `visual_tags[]`，材质和营销属性不充当款式类别。类别名称先描述可见形态，之后才可读取标题帮助使用平台常用叫法，并记录标题与图片冲突。图片不可判或跨多款拼图进入待核验区，不强行归类。
8. **相关性、搜索扩展与价格商家初筛。** 相关性优先依据图片主体；标题、SKU 和搜索词只在视觉判断之后用于语义复核、发现冲突和提出下一轮检索词。在相关或可能相关商品内按主要视觉类别、可见标签、规格、采购量、标价、起订量和商家筛选。相同商品 ID 在总库只占一行；不同商家的相似款保留为不同链接。按实际 SKU 与起批档位比价，不一致或未知时标待核验。商家身份优先依据返回的会员 ID，名称相似不足以合并。
9. **整理证据。** 按 [输出契约](references/topics/output-contract.md) 编写 `analysis.json`，包含视觉批次、逐图标签、聚类、相关性、人工交接与停止理由，`schema_version` 使用 `2.1.0`。运行 `1688cli research build <inventory.json> --context <analysis.json> --output <新-sourcing-result.json>` 确定性地保留完整商品库，再运行 `1688cli research validate`。`complete` 表示本轮已完成既定范围、逐图打标和聚类，不表示全平台已搜全。
10. **生成 HTML 交付。** 读取 [HTML 报告映射](references/topics/html-report.md)。通过当前宿主 Skill 目录或已广告的 Skill 目录按**精确名称**解析 `compact-commerce-ui`，完整加载它的当前 `SKILL.md`，执行其主线，再返回本主线。依次运行 `1688cli research viewmodel <sourcing-result.json> --output <新-viewmodel.json>`、`commerce-ui render --input <viewmodel.json> --output <新-report.html>`、`commerce-ui validate <report.html>`。分类页按主要视觉款式展示，可见标签用于说明和筛选；待核验图片单列。商品卡展示 HTTPS 网络主图、视觉依据、SKU/标价/起订量/商家及来源。交付 HTML、完整 JSON、查询清单、视觉批次清单和覆盖摘要。

## CLI 契约与结果边界

```bash
1688cli products search "平底锅" --limit 20 --output <新路径>.json
1688cli products image <参考图路径或HTTPS URL> --limit 20 --output <新路径>.json
1688cli products link <商品链接> --limit 20 --output <新路径>.json
1688cli research collect <search-manifest.json> --output <新-inventory.json>
1688cli research visual-batches <inventory.json> --output <新-visual-batches.json>
1688cli research visual-materialize <visual-batches.json> --output-dir <新目录>
1688cli research visual-compile <visual-batches.json> --tag-dir <视觉标签目录> --output <新-visual-catalog.json>
1688cli research build <inventory.json> --context <analysis.json> --output <新-sourcing-result.json>
1688cli suppliers search "平底锅工厂" --output <新路径>.json
1688cli research viewmodel <sourcing-result.json> --output <新路径>.json
```

查询结果的 `products[]` 提供 `offer_id`、标题、图片 URL、商品链接、标价、起订量、规格、商家名称和来源时间等；字段缺失时标为未知。商品标题、搜索来源和图搜排序均不能替代主图款式判断。图搜相似度仅表示该次检索的排序信号，不是“同款”的充分证明。多次查询的价格可能来自不同 SKU，不得未经规格对齐直接判定谁更便宜。供应商查询结果和商品商家只在身份有直接证据时关联，不能凭名称相似自动认定为同一企业。

## 异常与返回

- `AUTH_REQUIRED` / `ACCESS_DENIED`：记录已完成的查询与未完成分支，提示检查官方 AK、权限或频率，返回第 5 步的部分结果。
- `PROVIDER_MISSING` / `CAPABILITY_UNAVAILABLE`：指出缺少的 Skill/CLI 或适配能力，不用网页抓取、原始 HTTP 或猜测接口替代。
- 图像不可用：保留文字和其他参考图的成功分支；精确路线缺少全部可用图时请求可访问的文件或 URL。
- 视觉能力不可用或不能维持逐图 ID 对应：保留完整商品库并返回 `CAPABILITY_UNAVAILABLE`；不得用标题、搜索词或 SKU 伪装成视觉分类。
- 结果杂乱、同质或零结果：按当前模式的策略变换语义轴或代表图，再回到第 4 步；若没有有证据的新方向，则结束并说明覆盖边界。
- 输出目标已存在：使用新路径，保留历史研究结果。
- `compact-commerce-ui` 或 `commerce-ui` 缺失、当前契约不支持：返回 `DEPENDENCY_UNAVAILABLE` / `CLI_UNAVAILABLE` / `CONTRACT_UNSUPPORTED`，保留已验证的 JSON；不要在本 Skill 中临时编写 HTML 渲染器。网络图片地址缺失或非 HTTPS 时，先修正商品清单或明确标记受阻，不把无图链接混入已完成的 HTML 商品卡。

## 演进与验证

新增找货方式时，先定义触发条件、策略节点、CLI 输入和统一输出字段，再加入对应的查询路由/主题页；不要复制主线。固定的去重、合并、模式字段和输出校验宜进入 CLI 或包内确定性脚本。当前搜索只暴露 `limit`，本 CLI 未经验证不宣称具有真正的分页或平台总量；多词、多图交叉检索是扩大召回，不是完整遍历证明。每次改动检查真实文件和包内容，运行 `npm test`、`npm pack --dry-run`、基础 Skill/可移植性/知识层/能力契约校验，并分别用无图和多图任务做主对话试跑。独立干净上下文回归仅在用户认可标准输出且明确要求时进行。
