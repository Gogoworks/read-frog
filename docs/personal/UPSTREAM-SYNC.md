# 同步上游

本地 `main` 跟踪官方 `upstream/main`。`personal` 承载个人改动，`origin` 指向 Gogoworks 的 Fork。最初同步点为 `faebc6393405caef0363df9c233c298d7056ddf1`。本指南中的 Git 操作均保存在本机。

## 更新工作树

1. 在个人版「本地笔记」导出完整 JSON，在「偏好设置」导出设置文件。用 `git status --short --branch` 确认工作区已保存，再用 `git remote -v` 核对两个远端。
2. 从官方获取更新，快进本地 `main`。若快进失败，先用 `git log --oneline --left-right main...upstream/main` 检查本地改动，再决定如何保存分歧。
3. 切回 `personal` 合并。可以先建一个本地保护分支，如 `git branch personal-before-sync-20261126`，以后更新请换用当日日期。

```sh
git fetch upstream
git switch main
git merge --ff-only upstream/main
git switch personal
git merge main
```

冲突时根据架构清单逐项比对两边的行为。`git status` 会列出冲突文件。解决后用 `git add <文件>` 和 `git merge --continue` 完成合并。需要撤销正在进行的合并时可用 `git merge --abort`。远程发布或推送另行确认。

## 合并检查

- 检查 `wxt.config.ts` 的 Personal 公钥、显示名称与上游新增权限。Chrome 固定 ID 必须为 `ihfgmajgigafdpkfldmikhmgkifhneff`。
- 检查自定义指令字段类型、名称标准化和选择文字的来源。上游若增加新类型，同时更新本地模型、映射表单、导入校验及对应测试。
- 检查内容脚本的保存入口、后台消息名、指令编辑页和设置路由。原有会员及官方服务的鉴权与额度仍由上游路径处理。
- 对已发布数据结构追加 Dexie 版本与升级函数。升级备份格式时保留旧版读取器，使用旧数据库和备份样本做迁移测试。
- 检查新服务商配置是否引入新的凭据字段，更新导出过滤与测试。配置版本号随上游迁移器维护。

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm fmt:check
SKIP_FREE_API=true WXT_SKIP_ENV_VALIDATION=true corepack pnpm test --maxWorkers=6
corepack pnpm test:dev-local
corepack pnpm build
corepack pnpm test:personal:chrome
```

最后一条使用专用 Chrome for Testing 和临时资料，选择二进制的方法见[测试说明](TESTING.md)。测试通过后，从原位置重新加载个人版。回归还应覆盖已存在库的保存、设置迁移、完整 JSON 恢复和退出浏览器后读取。[上游文件清单](ARCHITECTURE.md)
