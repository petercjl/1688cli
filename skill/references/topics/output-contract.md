# 交付契约：完整商品库与两种模式

## 当前版本 `2.1.0`：主图打标后聚类

探索模式的新任务使用 `2.1.0`。`research collect` 生成完整商品库后，先运行：

```bash
1688cli research visual-batches <inventory.json> --output <新-visual-batches.json>
```

该清单固定 `batch_size: 10`，每批只包含 `offer_id` 和 `image_url`；标题、SKU、搜索词、价格和商家不得进入视觉节点。Agent 对每批最多 10 张图并发检查，但必须逐图返回结果。每个商品在 `assessments` 中增加：

```json
{
  "relevance": "relevant",
  "category_ids": ["round-shallow-single-handle"],
  "primary_style_class_id": "round-shallow-single-handle",
  "assessment": "主图显示圆形浅锅身和单长柄。",
  "visual_profile": {
    "basis": "primary_image",
    "status": "classified",
    "subject": "圆形浅煎锅",
    "visual_tags": ["圆形", "浅锅身", "单长柄"],
    "visual_evidence": ["主图可见完整圆形浅锅身与一根长柄"],
    "confidence": "high"
  },
  "title_conflict": "not_checked",
  "title_note": ""
}
```

`visual_profile.status` 为 `classified`、`needs_review` 或 `unusable`。后两者的 `primary_style_class_id` 必须为 `null`、`category_ids` 必须为空；不得强行归类。`confidence` 为 `high`、`medium`、`low` 或 `unavailable`。图片判断时只能使用主图可见证据，不能从标题或视觉猜测材质、涂层、钢号、性能和质量。

全部图片打标后才建立 `mode_data.clusters[]`。每个类别增加 `visual_signature[]` 和完整 `member_offer_ids[]`；同一商品只能属于一个主要视觉款式类别。`mode_data` 同时包含：

```json
{
  "visual_batch_size": 10,
  "visual_analysis_complete": true,
  "clustering_basis": "visual_tags_after_image_analysis",
  "visual_batches": [
    {"batch_id": "visual-0001", "offer_ids": ["123", "456"]}
  ]
}
```

完整状态下，每个有可用主图的商品必须且只能出现在一个视觉批次；没有可用主图的商品必须标为 `unusable`。聚类完成后才可读取标题和 SKU，为类别补充平台常用叫法并写 `title_conflict`（`none` / `possible` / `clear` / `not_checked`）及 `title_note`。标题不能直接生成或改写主要款式类别。

`category_ids` 在 `2.1.0` 只保存唯一的主要视觉类别，用于兼容筛选和 HTML；多维可见属性全部写入 `visual_tags[]`。HTML 分类页按主要视觉类别组织，商品卡展示视觉标签、依据与置信度；待核验和不可用图片不得混入已确认类别。

## 兼容版本 `2.0.0`

先把全部成功查询写入新的 `search-manifest.json`，每项包含唯一 `search_id`、`method`（`text` / `image` / `link`）、真实 `input`、`reason` 和相对清单文件的 `raw_path`；用户图搜还要有 `reference_id`。运行 `1688cli research collect <search-manifest.json> --output <新-inventory.json>`。这个命令只读取已保存的商品查询 JSON，输出 `search_log`、按 `offer_id` 去重的全部 `products` 和 `coverage`。失败/阻塞查询在最终 `search_log` 中如实补记。

```json
{"searches":[
  {"search_id":"q1","method":"text","input":"平底锅","reason":"宽词召回","raw_path":"q1.json"},
  {"search_id":"q2","method":"text","input":"早餐平底锅","reason":"从 q1 款式分型扩展","raw_path":"q2.json"}
]}
```

最终结果沿用下方公共结构，但 `schema_version` 为 `2.0.0`，并增加 `coverage`。将 inventory 的每个商品和每轮成功搜索完整带入；商品可增加判断字段，但不能删掉未入选或被判不相关的商品。每轮成功的商品搜索必须有 `offer_ids`，覆盖本轮所有返回的唯一商品 ID；校验器要求这些 ID 的并集与 `products` 的 ID 集合完全相等。`coverage.returned_rows` 为商品查询返回行数之和，`coverage.unique_offers` 为唯一商品数，`coverage.backend_exhaustive` 只有经实际完整遍历证实时才可设 `true`；`limitations[]` 说明分页、单次上限、失败分支和未探索方向。

Agent 只写 `analysis.json`，含 `mode`、`status`、`request`、`mode_data`、`human_handoff`、`stop_reason`、按商品 ID 键控的 `assessments`，以及可选的 `additional_searches` 和 `coverage` 补充。`assessments` 每项写 `relevance`、`category_ids`、`assessment`；未判断可省略。运行 `1688cli research build <inventory.json> --context <analysis.json> --output <新-sourcing-result.json>`，由 CLI 合并全部商品并校验，防止 Agent 人工复制清单时丢链接。

每条商品增加 `relevance`（`relevant` / `possible` / `irrelevant` / `unreviewed`）、`category_ids[]` 和 `observations[]`。`observations[]` 保留来源搜索 ID、SKU ID/名称、平台价格、起订量和商家会员 ID。已判断的商品须在 `assessment` 写依据；`complete` 状态不得留 `unreviewed`。同一商品 ID 在 `products` 中仅一条，`category_ids` 可以含多个不同类别；不同商家的相似款保留各自商品 ID。`mode_data.clusters[].representative_offer_ids` 仅表示重点展示，不定义完整商品清单。价格筛选只能在对应 SKU、数量和计价条件可比时形成排序；商家身份优先使用会员 ID，不根据名称相似推断。

输出摘要分列：返回行数、唯一商品数、相关数、可能相关数、不相关数、未判断数、类别数、可识别商家数、每轮新增唯一商品数，以及人工询价候选。停止理由写明边际新增、预算、授权/限流或尚待搜索路线；不能以“已找到足够代表款”作为覆盖型搜索的完成依据。

筛选可使用 `1688cli screen <sourcing-result.json> --relevance relevant,possible --category <类别ID> --supplier <名称或会员ID> --max-price <数值> --max-moq <数值>`；该筛选只处理本地已发现商品，不会补搜，也不代表不同 SKU 价格已可比。

以下 `1.0.0` 结构仅用于读取已有研究结果；新的探索找货任务使用 `2.1.0`，已有 `2.0.0` 结果继续兼容读取。

输出新的 `sourcing-result.json`、分类商品 HTML 和一段可读摘要。JSON 是证据底座；HTML 按 [HTML 报告映射](html-report.md) 转换与渲染。JSON 顶层结构稳定，新增分支只能增加新的 `mode_data` 形态，不改变公共证据字段：

交付前运行 `1688cli research validate <sourcing-result.json>`；失败时修正本地结果，不能将未通过契约的文件标为已完成。

随后运行 `1688cli research viewmodel <sourcing-result.json> --output <新-viewmodel.json>`，再按当前 `compact-commerce-ui` 的主线生成并验证 HTML。商品卡图片和详情地址必须为 HTTPS 网络链接；渲染时只引用图片 URL，不下载到本地。若渲染依赖或图片链接受阻，保留已验证 JSON，明确报告 HTML 未完成。

```json
{
  "schema": "1688-sourcing-result",
  "schema_version": "1.0.0",
  "mode": "explore",
  "status": "complete",
  "request": { "original_text": "平底锅", "reference_images": [], "hard_constraints": [], "preferences": [] },
  "search_log": [],
  "products": [],
  "mode_data": {},
  "human_handoff": { "questions": [], "unverified": [] },
  "stop_reason": ""
}
```

`status` 取 `complete`、`partial` 或 `needs_input`；`mode` 取 `explore` 或 `precise`。每张用户参考图在 `request.reference_images[]` 中有唯一 `reference_id` 和 `source`。`search_log` 每项至少有 `search_id`、`method`（`text` / `image` / `link` / `supplier`）、`input` 或 `reference_id`、`reason`、`result_count`、`status`、`raw_path`；以图搜图项必须写明 `reference_id`。失败也保留真实状态。`products` 每项至少有 `offer_id`、`title`、`url`、`image_url`、`price`、`sku_title`、`moq`、`supplier_name`、`source_search_ids`、`assessment`；未返回的字段使用 `null` 或空串，不猜值，商品来源须指向成功的搜索记录。保留本地原始查询 JSON 以便复核。

## `explore` 的 `mode_data`

`2.1.0` 包含逐图视觉批次和 `clusters[]`：每个类别有 `cluster_id`、`name`、`visual_signature`、`distinguishing_cues`、`member_offer_ids`、`representative_offer_ids`、`search_terms_seen`、`next_search_options`；以及 `priority_cluster_ids`。人读摘要先给“本次发现的视觉款式地图”，再给每类代表商品和推荐深入方向。它是供用户选择的供给概览，不伪装成 1688 官方类目或单一精确款式的最终匹配清单。

## `precise` 的 `mode_data`

包含 `references[]`：每张用户图有 `reference_id`、`source`、`relation_to_other_images`；`matches[]`：每项有 `reference_id`、`offer_id`、`match_level`（`likely_same` / `similar_alternative` / `mismatch` / `uncertain`）、`visible_evidence`、`differences`、`unknowns`。`references[]` 的 ID 必须与输入逐一一致。`complete` 的每张图都有成功的以图搜图记录；`partial` 的每张图都有已记录的尝试。人读摘要先给逐图匹配情况，再给可联系的商品—商家候选。多图结果不能无依据地汇总成一张“同款”排名。

## 公共核验

- `search_log` 中所有成功/失败查询都能对应到真实 CLI 调用；商品来源 ID 可追溯。
- `products` 按商品 ID 去重；同一商品不同返回规格不可无说明地合并价格。
- 人工询价问题至少覆盖目标 SKU/尺寸、采购量和阶梯价、税票/运费、样品、交期、质量与售后责任；只列问题，不代发消息。
- `stop_reason` 说明是达到足够候选、边际新发现不足、缺图、授权/限流/服务失败，或用户要求停止；不得将部分结果写成完整覆盖。
