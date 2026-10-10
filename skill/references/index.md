# 找货方法索引

- 用户没有提供参考图：读取 [模糊需求路由](queries/vague-search.md)。
- 用户提供一张或多张参考图：读取 [参考图路由](queries/image-led-search.md)。
- 已完成搜索、准备交付：读取 [输出契约](topics/output-contract.md)。
- 生成分类商品页面：在证据 JSON 通过校验后读取 [HTML 报告映射](topics/html-report.md)，并动态加载当前 `compact-commerce-ui` Skill。

每个路由只加载当前决策所需的主题。供应商谈价由人工完成；本 Skill 只准备可核验的候选与询价问题。
