# 架构与上游接入点

依据上游 `faebc639`（1.62.1）及本分支的实际测试。个人版保留模型执行、原有结果布局和设置导入流程，将笔记保存与管理放在独立的扩展数据库中。

## 从选区到保存

1. `src/types/config/selection-toolbar.ts` 描述指令、服务商引用、Prompt、图标、布局及 `outputSchema`。`src/utils/custom-actions.ts` 解析内置或用户指令。字段有稳定 ID、展示名称和类型，部分字段直接取选中文字。
2. `src/components/custom-action/use-custom-action-execution.ts` 生成请求，把模型字段和选区字段分开。`src/utils/content-script/background-stream-client.ts` 通过运行时 Port 传输流式结果。后台 `src/entrypoints/background/background-stream.ts` 的自带密钥路径用 `getModelById` 选取原服务商，再通过 SDK 的 `streamText` 和 `Output.object` 得到结构化对象。内容脚本合并选区字段，用原指令布局展示。
3. 原云端路径在 `use-save-to-notebase.ts` 中读取登录会话，查询 `notebase.list`、`getSchema`，校验所属账号和列，再调 `notebaseRow.create` 或 `createMany`。`save-to-notebase-dialog-host.tsx` 可向官方创建 Notebase，官方额度错误交给 `notebase-limit-toast.ts`。设置表单可查询官方库或打开官网管理。通用 `src/utils/orpc/client.ts` 通过后台 fetch 携带登录 cookie。这些服务端写入、账号与额度判断均由原项目负责。
4. 个人保存入口取完成的结果、当时的选择文字和来源。内容脚本只发送指令 ID、名称、字段定义和相应值，使用已有 `@webext-core/messaging` 的 `savePersonalNotes` 消息。后台扩展 service worker 提交事务，回传库名和数量。单条按钮与翻译建议的多选保存共用此入口。原有模型配置、鉴权和官网复习功能各走各自的原有路径。
5. 官方的 `src/utils/notebase/mapping.ts` 提供字段名归一化和类型兼容规则。个人版沿用同名同型自动匹配，并允许手动按 ID 映射不同名的列。一个字段只对应一个目标列，至少映射一列。其余字段保存在原始结果里。

## 扩展存储

上游 `src/utils/db/dexie/app-db.ts` 的版本已到 v8，包含翻译缓存、批处理、日志和术语库，后台有独立清理任务。个人库复用 Dexie 4.4.7，使用单独数据库 `read-frog-personal-notes` v1。读取、写入都发生在同一个扩展 origin。网页只发保存消息，设置页直接操作该库。入口 `personalNotes()` 检查扩展协议。Dexie 的实时查询让已打开的管理页能看到后台的新提交。

| 表          | 主要数据                                                            | 用途                                     |
| ----------- | ------------------------------------------------------------------- | ---------------------------------------- |
| `libraries` | UUID、名称、字段定义及创建和修改时间                                | 字段 ID 稳定，支持文本和数字             |
| `bindings`  | 指令 ID 为主键、目标库 ID、输出字段 ID 到列 ID 的映射               | 同一指令一个目标库，多条指令可共用一个库 |
| `notes`     | UUID、库 ID、指令快照、可编辑的列值、原始字段快照、选区、来源、时间 | 保留当时看到的结果，支持追溯与后续编辑   |

存储入口见 `src/personal/notes/store.ts`。首次按指令建库、建立绑定及整批写入处于同一事务。重复交付同一批请求时按行 UUID 去重，失败会整体回滚。编辑校验上次读取的修改时间，发现另一窗口先保存会提示重新打开。删除笔记库时在同一事务移除其笔记和映射。上游已有 `unlimitedStorage` 权限，个人代码无条数上限。列表先按库读出，再在内存中过滤和排序，每页 30 条。极大库的查询、备份仍受机器内存和磁盘限制。

来源复用 `src/utils/note-origin.ts` 及上游定义，辨认网页、视频和电子书，清理已知凭据参数并保留可用位置。原始结构化输出与可编辑列值分别存储。用户配置、请求头、API Key、Prompt 和模型连接对象均不进入保存消息。用户写入选区、正文或提示词中的文字按其原文处理。

**版本演进。** 已交付的 Dexie v1 表声明及 JSON `format/version` 是兼容契约。以后追加 Dexie 版本并测试原地升级，必要时用 `.upgrade()` 转换旧行。JSON 读取器按版本做转换或在写入前拒绝未知版本。当前是第一次引入该数据库，没有历史个人版数据库需要迁移。

## 笔记阅读

列表中的每条笔记链接到 `#/local-notes/:noteId`。设置页按主键在一次只读事务中取得笔记和所属库，使用保存时的字段值生成阅读视图。此路径支持刷新、单独开标签页、离线和已移除的指令模板。通过列表进入时，沿用设置页的历史返回和滚动恢复。搜索、排序与分页保存在当前设置页的内存中。

`src/personal/notes/reading.ts` 识别完整的 JSON 对象、数组及带代码围栏的 JSON。`src/personal/ui/readable-value.tsx` 将词语与释义、回复方式与正文、标题与角度排成条目，其余键值按名称递归展示。普通文本、残缺 JSON、超过 100,000 字符或嵌套超过 12 层的内容按原文显示。文本由 React 转义。进入「编辑笔记」后才显示可编辑的存储值，保存时沿用修改时间冲突检查。数据库和备份继续使用 v1。

## 导入导出与同步

- `backup.ts` 使用 Zod 严格校验 JSON 顶层、字段、时间、值类型和引用。读快照和写入恢复各在一个事务中。库、绑定、笔记的同 ID 同内容会跳过。有一条同 ID 内容不同，就回滚本次导入。
- `cloud-csv.ts` 读取官方 Notes 导出的 UTF-8 CSV，支持 BOM、引号、换行及中文。表头成为文本列，合法行写入单独的库。逻辑表内容的散列决定库 ID，改文件名或行分隔符不会重复导入。个人版 CSV 按当前库导出映射列、选区、来源、指令与时间，以引号和公式前缀转义供表格软件打开。
- 设置迁移继续使用偏好设置中的手动导入、`migrateConfig` 及上游备份。当前配置 schema 为 131。用户原指令的 ID 和输出结构可沿用，重新选择本地目标库即可。个人数据备份记录这些指令 ID 的映射，完整换机还应带上设置 JSON。
- `src/utils/google-drive/` 单独用扩展身份 OAuth 和 Drive 的 `appDataFolder` 读写配置与术语数据。Google 的回调由 `browser.identity.getRedirectURL()` 根据扩展身份生成。本次构建未配置个人 OAuth 客户端，本地笔记备份使用文件往返。

## 扩展启动时的数据校验

Zod 4 在创建对象校验器时会尝试编译一个空函数，Chrome 的扩展页面策略会记录这次拦截。生产构建的共享模块可能早于入口处的 `z.config({ jitless: true })` 执行。WXT 因此在包含 Zod 运行时的代码块开头启用 `jitless`，也覆盖 `ai-sdk-ollama` 内置的 Zod。初始化仅在能取得扩展运行时 ID 的环境中生效。更新 Zod、Ollama SDK 或打包器后，用浏览器验收脚本检查重新加载和各扩展页面的启动过程。[Chrome 扩展页面安全策略](https://developer.chrome.com/docs/extensions/reference/manifest/content-security-policy?hl=zh-cn#extension_pages_policy)

## 新增文件

| 位置                                                                       | 职责                                                       |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `src/personal/notes/{model,save,store,browse,reading,backup,cloud-csv}.ts` | 数据模型、保存投影、事务、查询、阅读排版、JSON 和 CSV      |
| `src/personal/ui/`                                                         | 设置页、映射表单、笔记阅读与编辑、确认弹窗、备份和保存反馈 |
| `src/personal/config-export.ts`                                            | 过滤当前和历史服务商配置中的凭据                           |
| `src/components/custom-action/save-button-view.tsx`                        | 两个适配器共用的原样书签按钮                               |
| `src/personal/__tests__/`、`scripts/personal/`                             | 模拟 IndexedDB 单测、真实 Chrome 临时资料的端到端验收      |
| `docs/personal/`                                                           | 使用、维护与验收文档                                       |

## 修改过的上游文件

路径均相对于项目根目录。以后合并上游时，优先逐项检查这些文件。

| 文件                                                                                                                  | 修改原因                                                            |
| --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `.gitignore`                                                                                                          | 让 docs/personal 下的版本文档进入 Git，沿用其他上游文档忽略规则。   |
| `AGENTS.md`                                                                                                           | 在上游测试、站点规则和 PR 规范后追加个人版工作约定。                |
| `package.json`                                                                                                        | 设定本地 Chrome 构建和验收命令，声明 CSV 解析器及测试依赖。         |
| `pnpm-lock.yaml`                                                                                                      | 锁定 CSV 解析器、IndexedDB 测试实现和浏览器测试客户端。             |
| `wxt.config.ts`                                                                                                       | 声明个人版名称和固定公钥，在扩展校验器初始化前关闭 Zod 动态编译。   |
| `scripts/dev-local.node-test.mjs`                                                                                     | 用一次性 Git 目录测试工作树选择，使独立 Fork 也能运行这项上游测试。 |
| `src/components/custom-action/custom-action-panel.tsx`                                                                | 在原结果卡插入本地保存按钮，传入原始选区和来源。                    |
| `src/components/custom-action/save-to-notebase-button.tsx`                                                            | 与本地入口共用原书签按钮外观，原云端组件仍可独立测试。              |
| `src/components/recovery/recovery-fallback.tsx`                                                                       | 恢复页面以去凭据的设置导出帮助用户带走配置。                        |
| `src/entrypoints/background/index.ts`                                                                                 | 注册单一的本地保存消息，延迟打开扩展数据库。                        |
| `src/entrypoints/content-runtime/selection/selection-toolbar/custom-action-button/provider.tsx`                       | 从指令卡宿主移除仅云端保存才需要的登录、建库对话框。                |
| `src/entrypoints/content-runtime/selection/selection-toolbar/note-suggestion/note-suggestion-card.tsx`                | 勾选的建议作为一次批量本地写入提交。                                |
| `src/entrypoints/content-runtime/selection/selection-toolbar/note-suggestion/__tests__/note-suggestion-card.test.tsx` | 从本地保存入口验证勾选、重试和选区传递。                            |
| `src/entrypoints/content-runtime/selection/selection-toolbar/translate-button/provider.tsx`                           | 把翻译卡已经持有的原选区传给笔记建议。                              |
| `src/entrypoints/subtitles.content/learning/word-lookup-card.tsx`                                                     | 同一结果卡提供本地保存，取消云端保存对话框的挂载。                  |
| `src/entrypoints/options/app.tsx`                                                                                     | 注册笔记列表和单条笔记阅读页，按需加载页面。                        |
| `src/entrypoints/options/app-sidebar/nav-items.ts`                                                                    | 注册本地笔记列表路径和含笔记 ID 的详情路径。                        |
| `src/entrypoints/options/app-sidebar/settings-nav.tsx`                                                                | 在设置导航加入本地笔记入口，阅读详情时保持选中状态。                |
| `src/entrypoints/options/app-sidebar/__tests__/settings-nav.test.tsx`                                                 | 锁定已有导航顺序和新增入口。                                        |
| `src/entrypoints/options/command-palette/search-items.ts`                                                             | 搜索字段映射时展示本地连接说明。                                    |
| `src/entrypoints/options/index.html`                                                                                  | 让设置页标签显示个人版名称。                                        |
| `src/entrypoints/popup/index.html`                                                                                    | 让弹窗页面使用个人版名称。                                          |
| `src/entrypoints/options/pages/custom-actions/action-config-form/index.tsx`                                           | 在可编辑指令和内置指令的原页签挂载本地映射。                        |
| `src/entrypoints/options/pages/custom-actions/action-config-form/editor-tabs.tsx`                                     | 用本地库的实际绑定和字段兼容性驱动页签状态点。                      |
| `src/entrypoints/options/pages/custom-actions/action-config-form/__tests__/notebase-connection-field.test.tsx`        | 在原编辑器上下文中挂载官方连接表单，继续覆盖官方组件的真实逻辑。    |
| `src/entrypoints/options/pages/custom-actions/action-config-form/__tests__/beta-gating.test.tsx`                      | 隔离本地连接区，继续测试原指令编辑行为。                            |
| `src/entrypoints/options/pages/custom-actions/action-config-form/__tests__/output-schema-autosave.test.tsx`           | 隔离本地连接区，继续覆盖结构化字段的自动保存。                      |
| `src/entrypoints/options/pages/preference/config/config-backup/components/backup-config-item.tsx`                     | 历史设置备份通过相同的去凭据导出入口下载。                          |
| `src/entrypoints/options/pages/preference/config/manual-config-sync/index.tsx`                                        | 手动配置导出使用去凭据策略，原有导入、版本迁移和术语处理继续工作。  |
| `src/hooks/use-export-config.ts`                                                                                      | 导出前集中筛除敏感配置。                                            |
| `src/locales/en.yml`                                                                                                  | 提供新增界面的英语文案及语言回退。                                  |
| `src/locales/zh-CN.yml`                                                                                               | 提供简体中文界面和错误反馈。                                        |
| `src/utils/__tests__/notebase.test.ts`                                                                                | 映射测试使用新的最小输入类型，继续验证上游匹配规则。                |
| `src/utils/message.ts`                                                                                                | 声明内容脚本到后台的类型化消息契约。                                |
| `src/utils/notebase/mapping.ts`                                                                                       | 让同名、同类型匹配接受两种笔记库共有的字段属性。                    |
