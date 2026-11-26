# AGENTS.md

## Testing Notes

- `src/utils/host/translate/api/__tests__/free-api.test.ts` depends on live external translation services.
- When running tests locally as an AI agent, set `SKIP_FREE_API=true`.
- If `SKIP_FREE_API=true` is set, treat `free-api.test.ts` as intentionally skipped during local validation.

## Site Rules Notes

- `src/utils/site-rules/built-in/rules.json` is also published to installed extensions on every merge to `main` that changes it (`.github/workflows/publish-site-rules.yml`), and they pick it up within about six hours. Code still only ships with a release.
- If a rule depends on code in the same PR, set `"minExtensionVersion"` on it to the version that code will ship in: the current `package.json` version with the patch number bumped. Older versions keep their bundled copy of the rule, or skip a new one. A rule using a field that older versions don't know is skipped by them automatically.
- Deleting a rule removes it from every installed version within about six hours. If new code makes a rule unnecessary, keep the rule until that code is released and delete it in a follow-up PR.
- Rule CSS can't load anything (`url(`, `image-set(`, `image(`, `src(`, `@import`), and no CSS string may end in a hex escape such as `\75`, with or without a carriage return after it, or installed extensions refuse the rule.

## PR Notes

- PR titles must use conventional commit format, such as `fix(subtitles): ...`; avoid extra prefixes like `[codex]`.
- User-facing fixes and features should include a `.changeset/*.md` file for `@read-frog/extension` unless the change intentionally does not need a release. use conventional commit format for the changeset content.

## Read Frog Personal 开发约定

- 个人功能在 `personal` 分支实现。`main` 跟踪 `upstream/main`，`origin` 是个人 Fork。远程推送、删除已有数据、产生额外服务费用前取得用户确认。个人版从解压目录安装，变更写入 [Personal 变更记录](docs/personal/CHANGELOG.md)。
- 个人笔记代码集中在 `src/personal/`。优先复用指令执行、字段匹配、消息机制、设计组件和主题。更新上游接入点时，在[架构清单](docs/personal/ARCHITECTURE.md)记录文件及原因。
- 保持固定的个人扩展公钥与 ID。网页保存通过后台消息，持久存储限于扩展 origin。已发布的数据库版本用追加升级处理，并为旧备份保留可验证的读取路径。
- 仅传输保存笔记所需的数据。个人 API Key 在扩展设置中填写。新增模型选项时复查配置导出涉及的敏感字段。使用模拟服务验收 AI 调用。
- 交付前运行静态检查、全量测试、生产构建和隔离 Chrome 验收，确认第 11 和第 100 条、离线与重启持久化。浏览器验收使用专门的 Chrome for Testing 临时资料。实际范围和外部服务的验证情况写入[测试说明](docs/personal/TESTING.md)。
