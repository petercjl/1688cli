# 兼容性与验证记录

目标版本：0.3.0。目标：Codex、SealSeek、WorkBuddy × macOS、Windows。

| 范围 | 状态 |
| --- | --- |
| 三种 Agent 的安装、状态、受管理复制更新、备份、UTF-8 | 本机自动化测试通过 |
| Windows 文件锁、复制安装、Python launcher | 分支测试通过，远程 Windows CI 待运行 |
| Codex/macOS 历史商品/图搜/供应商/报告 | 0.2.0 有运行记录，0.3.0 待在线复核 |
| SealSeek/macOS、WorkBuddy/macOS 宿主发现与任务 | 待宿主验收 |
| 三种 Agent/Windows 宿主任务 | 待 Windows 实机验收 |

CLI 单元测试、CI 和宿主验收是独立证据。宿主未实测的映射为 implemented；不把安装测试等同于完整业务任务成功。干净上下文业务回归需用户明确要求，并提供已认可标准产物。

发布使用 GitHub Actions npm Trusted Publishing。正式发布与 npm dist-tag 以公共 registry 验证结果为准。
