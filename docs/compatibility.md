# 兼容性与验证记录

验证日期：2026-10-10。目标版本：0.3.0。目标：Codex、SealSeek、WorkBuddy × macOS、Windows。

| 范围 | 状态 |
| --- | --- |
| 三种 Agent 的安装、状态、受管理复制更新、备份、UTF-8 | 本机与 macOS/Windows CI 自动化测试通过 |
| Windows 文件锁、复制安装、Python launcher | macOS/Windows × Node.js 22/24 四组 CI 均通过 |
| Codex/macOS 历史商品/图搜/供应商/报告 | 0.2.0 有运行记录；0.3.0 真实商品查询返回 AUTH_REQUIRED（401），在线验收受授权阻塞 |
| WorkBuddy/macOS 技能发现 | WorkBuddy 5.7.7 已安装技能页显示 1688cli，状态已启用；完整业务任务待验收 |
| SealSeek/macOS 宿主任务 | 安装状态通过；本次 gateway health 返回 1006，宿主任务待验收 |
| 三种 Agent/Windows 宿主任务 | 待 Windows 实机验收 |

CLI 单元测试、CI 和宿主验收是独立证据。宿主未实测的映射为 implemented；不把安装测试等同于完整业务任务成功。干净上下文业务回归需用户明确要求，并提供已认可标准产物。

发布使用 GitHub Actions npm Trusted Publishing。正式发布与 npm dist-tag 以公共 registry 验证结果为准。

## 可复查证据

- [四组跨平台 QA](https://github.com/petercjl/1688cli/actions/runs/38040867421)：47 项测试、打包产物独立安装、三 Agent 的安装与状态查询、业务筛选测试均通过。
- 本机 Skill 格式、可移植性、知识层、能力契约与适配器校验均通过。
- 打包包含 CLI、完整 Skill、三种适配器和 UI 元数据，排除测试输入、用户配置及凭证。
- 通用结构审计器误报 `skill.canonical`：它只扫描 `skill/<name>/SKILL.md` 和 `skills/<name>/SKILL.md`，未识别当前合法的 `skill/SKILL.md`；它也不接受 WorkBuddy 目标。已以真实 `skill source`、打包清单和三目标安装测试补充验证，未为迎合扫描器更改规范目录。
- UI 元数据定制保护已由真实文件内容断言验证；文本标记扫描的 warn 不等同于测试缺失。

`main-run`：本地业务筛选与产物契约通过；在线搜索授权失败。`clean-regression-not-run`：未执行独立业务回归。
