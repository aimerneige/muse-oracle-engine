# 网页 UX 重构交付报告

## 改动概览

- 工作分支：`feat/web-ux-refactor`；基于 `525c1e0`，改动保留在工作区。
- 按方案顺序完成 engine 拆分、store/pipeline、React 组件与步骤页、字典式 i18n、响应式样式、旧实现删除。
- 标准漫画默认走「设定 → 分镜 → 成稿」；长漫画和四格增加梗概或候选选择步骤。
- 设定页采用模式卡、角色作品筛选与搜索、已选托盘、发色色块、画风说明卡和高级参数。角色添加、编辑、导入、导出移入次要入口。
- `GenerationStep` 统一 AI/手动流程：未配置时默认手动，复制 Prompt、粘贴结果后 450ms 去抖自动解析，原地反馈错误；再次生成使用行内覆盖确认。
- 梗概可编辑，四格候选卡可多选；分镜按话折叠、逐格展开编辑，文本框随内容增长。旧项目只有合并分镜时仍可编辑合并文本。
- 成稿页将一话四格分镜、图片 Prompt、图片区和复制、重试、下载放在同一卡片内；支持 lightbox、ZIP、项目 JSON、批量图片下载。
- 底栏集中主操作、进度和停止；流水线复用同一套解析与生成 action，支持从未完成处继续。四格在候选选择处等待用户决定。
- 自动保存去抖 350ms，`beforeunload` 刷盘；历史仅在新建项目或手动存快照时写入，最多保留 20 项。
- 语言切换不刷新页面；角色和画风按语言展示，状态文案本地化；保留浅色、深色和系统主题。
- 删除旧 `app.js`、HTML 字符串注入、DOM 文本替换、alert 劫持及旧样式隐藏规则。README 网页流程、入口标题和 Web manifest 品牌同步更新。

## 文件结构

```text
web/src/
  main.jsx / App.jsx
  engine/
    storage.js / characters.js / templates.js / prompts.js / parsers.js
    exporters.js
    providers/text.js / image.js / shared.js
  store/
    ProjectStore.jsx / actions.js / selectors.js / pipeline.js
  components/
    AppHeader.jsx / Stepper.jsx / ActionBar.jsx / Dialog.jsx
    SettingsDialog.jsx / CharacterEditorDialog.jsx
    GenerationStep.jsx / CharacterPicker.jsx / OutlineView.jsx
    StoryboardView.jsx
  steps/
    SetupStep.jsx / OutlineStep.jsx / StoryboardStep.jsx / ArtworkStep.jsx
  i18n/
    index.js / LocaleProvider.jsx / zh-CN.js / en-US.js
    workspace.js / styles.js
  styles/tokens.css / app.css
web/tests/
  engine.spec.js / studio.spec.js / api.spec.js / ux.spec.js
  fixtures/legacy-baseline.json
web/test-results/ux/                    # 16 张截图，测试产物
```

`App.jsx` 负责页面编排及工具窗口状态，业务转换在 engine/store 中。通用 `Dialog` 基于原生模态 dialog，提供焦点进入、Escape 关闭和焦点恢复；历史、日志、确认、lightbox 复用该组件。

## 旧行为基准与兼容性

迁移之前，使用 Node VM 直接执行旧 `app.js` 中的模板、角色、Prompt 构建及解析函数，读取原有生成数据，保存固定输入与基准输出。迁移后测试读取固定基准，不从新实现重新生成预期值。

- 原始 `app.js` SHA-256：`ae5a723fd6c1997ba3937c8ac5b77f3a3ec87279b96c6cacf29b13d71153c075`。
- 比较标准分镜、长漫画梗概、四格候选、长漫画批量分镜、长漫画逐话及四格逐篇 Prompt。
- 对全部 9 种画风的图片 Prompt 逐字比较。
- 比较 JSON 代码块解析、标准分镜归一化、长漫画批量分镜归一化和四格字幕移除输出；另验证错误格数、重复话数、缺话及缺服装状态的拒绝行为。
- 沿用 `lovelive-engine-web-settings/project/history/characters/locale/theme` 原键；旧项目无 `storyMode` 时仍按标准漫画恢复，无长度开关时仍从原话数推导。
- `hydrateProject` / `persistableProject` 保持原规则：图片不持久化；历史和 JSON 保留 Prompt、原始输出和结构化分镜。项目名称使用可选 `name` 属性，旧项目无需迁移。
- 一话的四格合成一张图片，未改成四次独立出图；图片数量、Prompt 组织和原解析规则保留。

## 与方案的差异及原因

1. 建议的组件清单按实际复用需求合并：候选、梗概在 `OutlineView`；图片网格及卡片在 `ArtworkStep`；确认、历史、日志、lightbox 共用 `Dialog`；toast 直接由 React 渲染。避免为薄包装新增接口，保留明确的步骤边界。
2. 字典由 `zh-CN.js` / `en-US.js` 导出，具体工作台文案集中在 `workspace.js`，画风英文名与说明在 `i18n/styles.js`。生成数据没有英文画风字段，因此使用显示层映射，未修改生成文件。
3. 仓库没有独立存档的真实模型输出 JSON。基准使用旧测试的合法四格结构、内置真实角色及原始模板构造固定场景，实际通过旧函数生成预期输出；未把合成样例宣称为真实 API 返回值。迁移工具为一次性辅助，旧代码删除时一同移除，固定基准及回归测试保留。
4. 流水线采用单请求顺序执行，无新增并发或自动退避。与旧图片循环遇错后继续尝试剩余图片不同，新流水线遇错即停并展示错误，重跑跳过已成功图片；这样失败阶段和续跑位置明确，也避免配置错误时继续消耗请求。停止不会触发 OpenAI 的非流式回退。
5. Gemini 保留原 `generateContent` 请求和 JSON 返回路径，并能读取 SSE 返回；OpenAI 保留流式优先、非流式回退。没有主动切换 Gemini 官方请求到实验性流式端点。
6. API 成功图片展示在卡片内，由用户点击下载或批量下载，不再每张返回时强制触发浏览器下载。未配置图片 API 时，保留手动复制 Prompt 与导出路径。
7. 未增加可选的「测试连接」按钮；设置提供配置状态、官方 API 切换、Key 显隐和底部保存按钮。
8. 截图为固定视口验收图，确保能够同时检查底栏和当前步骤的首屏；长页的完整内容通过交互测试与人工滚动验收。

## 验证结果

每阶段结束后均在 `web/` 执行 `npm run build` 和 `npm test`，失败修复后才进入下一阶段。

| 阶段 | 构建 | Playwright |
| --- | --- | --- |
| engine 拆分与旧输出基准 | 通过 | 7 项通过 |
| store / pipeline | 通过 | 7 项通过 |
| 组件与步骤页 | 通过 | 7 项通过 |
| i18n | 通过 | 8 项通过 |
| 样式替换 | 通过 | 8 项通过 |
| 删除旧实现 | 通过 | 8 项通过 |
| 扩展验收与最终回归 | 通过 | **16 项通过** |

最终覆盖内容：

- 首次设定校验；标准漫画复制 Prompt、粘贴自动解析、成稿卡片数量、ZIP 下载与重载恢复。
- 长漫画梗概、批量分镜、按话分组；四格候选未选禁用、选择后逐篇解析。
- 无效 JSON 原地报错、修改后解锁；旧格式项目恢复；模态窗口 Escape 与焦点恢复。
- 英文切换保留草稿、英文角色和设置面板无中文 UI 残留；深色偏好、命名快照、新建和历史恢复。
- `page.route` mock Gemini JSON、Gemini SSE、OpenAI SSE、图片接口；自动解析、出图、放大预览、停止后重试、图片失败重试与跳过已成功图片、一键流水线。
- 四步骤 × 桌面/移动 × 浅色/深色共 16 张截图；390px 视口无横向溢出，底栏位于视口内。
- `git diff --check` 通过。
- `./web/build_dist.sh` 成功；发布产物在 `web/dist/`。构建脚本执行前后两份生成数据 SHA-256 均相同，未留下生成数据差异。
- 未新增项目依赖，`package.json` / `package-lock.json` 无变化。临时使用 Prettier 整理本次新增或重写文件，未加入项目依赖。

修复过的验证失败包括 ESM 测试路径写法、数据副作用模块加载时序、步骤栏新增主操作后的测试定位，以及主题/语言下拉的可访问名称。最终无测试失败或跳过。

## 截图

路径：`web/test-results/ux/{setup,outline,storyboard,artwork}-{desktop,mobile}-{light,dark}.png`。

- 桌面：1440 × 1000。
- 移动：390 × 844。
- 截图使用长漫画的四步骤流程，包含已选角色、已解析梗概、已解析分镜及图片占位卡片。
- 这些是本地测试产物，按仓库现有忽略规则不纳入 Git；以后完整执行 `npm test` 会重新生成。

## 已知限制与人工验收

- 没有使用真实 API Key 调用付费模型；真实服务的 CORS、鉴权、模型可用性、限流和真实输出质量需要人工验收。mock 测试只能验证客户端流程。
- 浏览器关闭或重载后不会恢复图片二进制，这是沿用的持久化策略；请单独下载图片。跨域 URL 图片的下载行为及浏览器对批量下载的许可也需要人工确认。
- 保持旧模板和解析规则，包括模板中固有中文以及严格四格约束；切换界面语言不会翻译用户故事、角色设定正文、模型输出或改变对白语言。
- 旧浏览器、Safari、屏幕阅读器，以及几十话长项目下的实际滚动、编辑、流式输出与停止体验尚需人工验收；当前自动化使用仓库配置的 Chrome。
- 重点检查三种模式真实手动/API 闭环、四格选择后的自动续跑、改写后图片内容一致性、设置 Key 显隐与保存，以及移动端长角色名、长错误信息和弹窗键盘操作。
- localStorage 配额不足时会显示保存错误；重要作品应及时导出。没有引入服务端存储或浏览器数据库。

## 范围和约束

运行时代码变更仅在 `web/`；仓库外层仅按方案同步 README 和新增本报告。原有方案文件保留。没有读取、创建或修改任何精确名为 `.env` 的文件；Vite 保留 `envDir: false`。没有修改 Go、Prompt 模板、两份生成数据或依赖文件；没有 commit、push、部署，也没有运行 `deploy.sh`。

## 第二轮打磨

1. **成稿摘要与标题**：显示层移除 Markdown 标题、强调、链接等标记，压缩空白，超过 100 字加省略号；展开编辑仍保留原文。合并为「第 N 话 · 已完成/总数」一个卡片标题，移除卡片顶部的重复分隔线。
2. **成稿主操作与导出**：进入成稿后，尚无图片 Prompt 时主按钮为「生成全部图片 Prompt」；已配置图片 API 且还有缺图时为「生成全部图片（x/N）」；其余状态为「导出作品」。导出使用按钮触发的原生 popover 下拉，依次提供图片 Prompt ZIP、下载全部图片、项目 JSON，支持 Escape 关闭；不再使用 details 三角入口。
3. **解析后的生成区**：手动和 API 解析成功后收起为「✓ 已解析 · N 格」，结构化结果直接排在下方；提供「查看原文 / 重新粘贴」和「重新生成」入口。解析失败保留输入区域；恢复已有项目后回看分镜也保持收起。
4. **移动底栏**：≤760px 隐藏说明文字，上一步改为有可访问名称的箭头按钮，自动完成选项压缩为带名称的复选框与闪电标记；底栏不换行，底部保留 safe-area-inset-bottom。缩小按钮与上下内边距，为安全区域留出空间。
5. **模式选择**：使用 radiogroup/radio、aria-checked 和单一 Tab 停靠点；方向键循环切换，Home/End 跳到首尾。仅选中卡片显示强调描边、背景与勾选标记，未选中卡片 hover/focus 使用轻微背景与中性边框变化。
6. **步骤页标题**：移除各页重复的「MUSE ORACLE · 0x」与大标题，保留步骤条作为导航；移动端隐藏步骤状态小字，维持紧凑布局。

验证：更新 studio、API 与 UX Playwright 断言，覆盖纯文本摘要及截断、编辑原文、单层标题与无顶部分隔线、三种主按钮状态、导出菜单及 Escape、手动/API 解析后收起、主动展开与刷新恢复、390px 各步骤与 760px 底栏高度 ≤80px、模式单选与键盘切换、未选中 hover 文字颜色，以及各步骤无重复大标题。`npm run build`、`npm test`（16 项，含旧 Prompt/解析逐字基准）、`./web/build_dist.sh` 均通过，`git diff --check` 通过。

重新生成 `web/test-results/ux/` 下 16 张桌面/移动、浅色/深色截图，新增 `storyboard-full.png` 与 `artwork-full.png` 两张 fullPage 截图，共 18 张。截图仍为被 Git 忽略的本地测试产物。

本轮仅修改 `web/` 和本报告，保留上一轮工作区改动；未修改 engine、Go、模板、依赖或生成数据，构建脚本前后两份生成数据 SHA-256 一致。未接触 `.env`，未 commit、push、部署，未运行 `deploy.sh`。
