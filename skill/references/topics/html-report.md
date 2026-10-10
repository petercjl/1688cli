# 1688 找货 HTML 报告映射

此页是 `1688cli` 的业务 ViewModel 模板契约；HTML/CSS/交互模板由安装中的 `compact-commerce-ui` Skill 与 `commerce-ui` 模板包维护，不在本包复制渲染代码。

## 依赖与返回点

- 逻辑依赖名：`compact-commerce-ui`。从当前宿主公告的 Skill 目录或配置的 Skill roots 中按完整名称解析，读取它当下完整的 `SKILL.md`；不得凭相似名称替代。完成它的渲染、校验与预览主线后，返回 `1688cli` 主线第 7 步交付节点。
- CLI：`commerce-ui`，运行时检查 `version --json`、`doctor`、`templates list --json` 和 `schema --template compact-workbench`。目标契约为 `compact-workbench@1.0`；若版本或模板不可用，按被调用 Skill 的错误契约返回，不使用私有 HTML 备用模板。
- 输入：已经通过 `1688cli research validate` 的 `sourcing-result.json`。先运行 `1688cli research viewmodel <输入> --output <新-viewmodel.json>`，得到可复核的页面数据。
- 输出：新的 `report.html`、原始找货 JSON、ViewModel JSON，以及 `commerce-ui validate` 结果。HTML 文件不含凭证、私有本机路径或本地商品图片。

## 页面结构

新版 `2.1.0`：总览显示搜索轮次、唯一商品数、逐图视觉分析范围、相关性分布和覆盖限制；每个探索类别按唯一 `primary_style_class_id` 展示，商品卡显示视觉标签、可见依据和置信度。`needs_review` 与 `unusable` 单列，不混入确认类别。标题只在视觉聚类后用于类别命名和图文冲突提示。仍保留“全部唯一链接”页面和“价格与商家”初筛表。类别的 `representative_offer_ids` 只表示重点商品，不能用于裁剪清单。验收以完整商品库为准：唯一链接页数须等于 `products.length`。

兼容 `2.0.0`：继续按其 `category_ids` 多标签视图读取既有结果，但不得把这种旧分类方式用于新的探索任务。

以下页面结构兼容历史 `1.0.0` 结果：

`explore`：总览显示搜索轮次、入选商品数与当前样本支持的款式类别；每个 `mode_data.clusters[]` 成为一个独立侧栏页面，其 `representative_offer_ids` 商品以图卡展示。未进入任何类别的 `products[]` 留在“待分类候选”页面，不臆造类别。

`precise`：总览说明逐图找款范围；每张用户参考图成为独立页面，按 `mode_data.matches[]` 显示匹配级别、可见依据、差异和未知项。未完成逐图比对的商品单列页面，不并入“同款”。

两种模式均有“来源与待核验”页面，展示查询轨迹、人工询价问题和待核验事项。每个商品卡必须有 `image_url` 与 `url` 两个 HTTPS 地址；图片保留为网络 URL，通过 `<img>` 加载，不下载或嵌入。卡片同时显示标题、对应 SKU、平台标价、起订量、商家名、商品 ID、召回来源和判断说明。标价是指定 SKU 的当前平台返回值，不等于最终采购报价。

## 验收

1. `commerce-ui validate report.html` 成功，且其远程商品图片数量与商品卡数量相符；网络图片需要在线查看，失效时页面应显示缺图占位。
2. 检查桌面与窄屏页面：分类切换、商品详情按钮、图片可见性、文字溢出和打印展开均正常。不能仅以静态校验通过宣称视觉验收。
3. 对照 `sourcing-result.json`，新版唯一链接页不遗漏且不重复；`2.1.0` 的已分类商品只出现在一个主要视觉类别，标签和视觉依据可追溯。若部分商品缺少 HTTPS 图片或详情链接，转换命令返回 `OUTPUT_CONTRACT_FAILED`，保留 JSON 并说明 HTML 受阻。
