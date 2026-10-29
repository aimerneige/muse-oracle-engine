# Web UX 重构方案（web/）

> 目标：把当前"旧命令式页面 + 外层 Studio 皮肤"的网页，重构为真正以 React 状态驱动、流程清晰、手动/API 两种工作流都顺手的创作工作台。
> 范围：仅 `web/`。不改 Go 代码、不改 Prompt 模板、不手改 `web/src/data.js` / `web/src/generated/data.js`。

---

## 一、现状诊断

### 1. 架构问题（导致 UX 难以改好的根因）
- `App.jsx` 用 `dangerouslySetInnerHTML` 注入一整段 HTML 字符串，实际逻辑全在 3600 行命令式 `app.js`（`getElementById` + 手动 `innerHTML` + `addEventListener`）。React 只是一个外壳。
- "Studio 三步流程"是通过 CSS 把旧的 tab 界面隐藏/拼接出来的（`studio.css` 中 `.layout[data-step=...] #xxx { display:none }`），旧的子 tab、旧的"下一步"按钮仍然存在。
- 英文界面靠 `i18n/dom.js` 的 MutationObserver 做文本替换，覆盖不全：英文模式下仍出现"继续""使用官方 API"、画风名为中文等。
- 大量 `window.confirm` / `alert` / 多个只有"知道了"按钮的 `<dialog>`。

### 2. 交互问题（按页面）

**全局 / 顶栏**
- 顶栏 7 个同等权重的控件：语言、主题、GitHub、"全自动执行长漫画"、"继续"、"保存项目"、"新建"。主操作不明确；"继续"语义含糊；"保存项目"与"自动保存"概念冲突。
- 品牌混乱：顶栏和侧栏都写 "LoveLive 4-koma Engine"，而项目是多 IP 的"圣谕自演机"。
- 移动端顶栏占两行按钮，导航再占两行，首屏几乎看不到内容。
- 状态以原始英文值展示（`draft`、`pending`）。

**第 1 步 创意设定**
- 最关键的决策"流程模式（标准 / 长漫画 / 四格）"被埋在一个下拉框里，且默认为长漫画；切换模式后整个后续流程都变了，但用户感知不到。
- 筛选控件（作品、角色搜索）和项目参数（画风、流程、语言、长度）混排在同一个 3 列表格里。
- 角色选择是一面"芯片墙"，每个芯片都粘着一个"编辑"按钮，编辑比选择更显眼；没有按作品分组，没有视觉区分；"已选角色"在列表下方，离得远。
- "角色设定 添加/导入/导出"这种低频管理功能常驻在主表单底部。
- "使用剧情长度"复选框 + 数字框含义不清（单位是"话"，每话 4 格，界面上看不出来）。

**第 2 步 剧情分镜**
- 同一屏有 3~4 套"前进"入口：侧栏步骤、内部子 tab（梗概 / 批量分镜）、卡片内"下一步"、底栏"确认梗概，进入分镜 →"，且有两个同样醒目的主按钮。
- 手动流程和 API 流程混在一起："生成梗概 Prompt"和"调用 LLM 生成梗概"并排，用户不知道该点哪个；用户在点击前也不知道 API 是否已配置好。
- 手动流程需要：生成 Prompt → 展开折叠区 → 复制 → 粘贴到结果框 → 点"解析" → 点"下一步"，步骤太多，而且解析失败的反馈不在原地。
- 卡片套卡片套卡片（panel > tab-panel > flow-section > card），视觉层次很重。
- 四格模式的候选选择靠复选框 + "全选" + 弹窗提示"请至少选择一个"。

**第 3 步 图片成稿**
- 每个分镜都是一个高约 180px 的大文本框，4 格就要滚动一整屏，长漫画（几十格）基本不可用。
- 图片 Prompt 用 tab 一次只显示一格，并且又折叠在 details 里；图片结果卡片在更下方，三者（分镜 / Prompt / 图片）分离，无法对照。
- "生成图片 Prompt"、"调用图片 API"、"导出图片 Prompt"、"导出 JSON"散落在不同位置；底栏主按钮又是"导出项目 JSON"。
- 没有批量出图的进度（x / N）展示，单张失败只能在对应卡片里找。

**设置 / 历史 / 日志**
- 设置弹窗的"保存"按钮在左上角；中英混杂；没有"测试连接"或已配置状态提示。
- 历史、日志可以保留为次要入口。

---

## 二、目标体验

### 信息架构
```
┌ 顶栏：品牌「圣谕自演机」 · 项目名(可改)+保存状态(已自动保存 ✓)   [⚙ 模型] [⋯ 更多：新建/历史/日志/导入导出/语言/主题/GitHub]
├ 步骤条（横向 stepper，桌面/移动统一）：① 设定  ② 剧情  ③ 分镜  ④ 成稿
│   - 步骤随模式变化：标准漫画 = 设定 → 分镜 → 成稿；长漫画/四格 = 设定 → 梗概(四格:选择候选) → 分镜 → 成稿
│   - 每步显示状态：未开始 / 进行中 / 已完成 / 有错误；已完成的步骤可点击回看
├ 主内容区（每步只有一个主行动）
└ 底部固定行动栏：左侧次要(上一步)，右侧唯一主按钮（随状态变化文字），中间显示进度/提示
```
- 不再有内部子 tab、卡片里的"下一步"、顶栏的"继续"。
- "全自动"改为每一步主按钮旁的"一键生成到底"开关或分裂按钮（Split button：`AI 生成` ▾ `从这里自动完成全部`），并在运行时显示统一的进度条 + 停止按钮。

### 第 1 步 设定
1. 顶部用 3 张**模式卡片**（标准漫画 / 长漫画 / 四格漫画）做单选，卡片上一句话说明产出（例如"长漫画：多话连载，每话 4 格"）。默认改为**标准漫画**（最短路径），或者保留用户上次的选择。
2. **故事灵感**大文本框 + 灵感示例 chip（保留）。
3. **角色选择**：
   - 左侧作品分组（tab 或下拉）+ 搜索；右侧/上方"已选角色"托盘（sticky），数量徽标。
   - 角色卡：显示名字（中/英）、作品名、发色色块（来自数据里的发色，没有就用首字母头像）。点击切换选中，选中态清晰（勾选标记 + 描边）。
   - "编辑"收进卡片悬停时出现的小图标或"⋯"菜单；"添加/导入/导出角色设定"移到列表末尾的"管理角色"折叠区或"更多"菜单。
4. **画风**：用带名称和一句描述的卡片/列表单选，替代下拉框（模板名多语言）。
5. 次要参数（对白语言、话数）放在"高级选项"折叠区；话数改成"自动规划 / 指定 N 话（每话 4 格，共 4N 格）"的单选 + 数字步进器，实时显示总格数。
6. 校验在原地显示（字段下方提示），主按钮在条件不满足时 disabled 并说明缺什么（"还差：选择至少 1 位角色"）。

### 第 2/3 步 剧情与分镜 —— 统一的「生成块」组件 `GenerationStep`
所有"Prompt → 模型 → 结果 → 解析"的环节（标准分镜、长漫画梗概、批量分镜、四格候选、四格分镜）复用同一个组件：
- 顶部分段控件：`AI 生成` | `手动（复制 Prompt 到其他工具）`，记住用户偏好；未配置 API Key 时默认手动，并在 AI 选项上显示"未配置，去设置"。
- **AI 模式**：一个主按钮"生成"；流式输出显示在只读区域（可折叠"查看原始输出"）；完成后自动解析，成功直接展示结构化结果，失败就在原地显示错误和"重试 / 改为手动粘贴"。
- **手动模式**：两步引导 ①「复制 Prompt」按钮（Prompt 预览可展开）②「粘贴结果」文本框，**粘贴或输入结束后自动解析**（去抖），实时显示 ✓ 解析成功（N 格）/ ✗ 错误原因；去掉独立的"解析"按钮（可保留为小号"重新解析"）。
- 已有结果时再次生成，用行内确认（"将覆盖当前结果"）代替 `<dialog>` 和 `confirm`。
- 解析后的结果用**可读的结构化卡片**展示：
  - 梗概：标题、简介、每话一张卡（话数、标题、梗概），可内联编辑。
  - 四格候选：卡片网格，点击卡片选中/取消（多选，有"全选"），选中数量显示在底部行动栏，0 个时主按钮 disabled 并提示，不再弹窗。
  - 分镜：按话分组的格子列表，每格默认显示一段可读摘要，点击展开为编辑器（auto-grow textarea，不是固定 180px）。长漫画按话折叠/锚点导航。

### 第 4 步 成稿
- **分镜-Prompt-图片三位一体的格子网格**（桌面 2~3 列，移动 1 列）。每格卡片包括：
  - 格号 + 分镜摘要（可展开编辑）
  - 图片区：未生成为占位框；生成中为骨架屏/进度；成功显示缩略图（点击放大 lightbox）；失败显示错误 + 重试
  - 操作：复制 Prompt、重新生成、下载
- 网格上方工具条：`生成全部图片 Prompt`（如果还没有）、`生成全部图片`（显示 x/N 进度，可停止，只补生成缺失或失败的）、`导出`下拉（图片 Prompt ZIP / 项目 JSON / 下载全部图片）。
- 长漫画：按话分组，组标题可折叠，显示该话完成度。
- 未配置图片 API 时，图片区显示"复制 Prompt 到你的绘图工具"，引导手动流程。

### 全局反馈
- 统一的 toast（成功/失败的简短提示）+ 原地错误；删除 `alert`/`confirm`/"知道了"弹窗（破坏性操作如"清空历史""新建项目（会丢弃当前未导出的内容）"用一个统一的确认对话框组件）。
- 运行中的任务：顶部/底栏统一进度条 + 当前阶段文字 + 停止按钮；运行中禁止切换步骤时，只把步骤条置灰并给出提示，不弹窗。
- 状态文案全部本地化（草稿 / 生成中 / 已完成 / 失败）。

### 设置弹窗
- 分为"文本模型""图片模型"两组；每组顶部显示状态徽标（已配置 ✓ / 未配置）。
- 修改后自动保存（或底部固定"保存"主按钮），不要放左上角。
- API Key 输入框带显示/隐藏切换；保留 localStorage 安全提示。
- （可选）"测试连接"按钮。

### 响应式与可访问性
- 移动端：顶栏一行（品牌 + 设置 + 更多菜单）；步骤条横向可滚动的紧凑版；底部行动栏 sticky。
- 全部交互元素可键盘操作，焦点样式保留；对话框焦点管理正确；`aria-live` 用于进度与解析结果。
- 保留浅色/深色/跟随系统主题，沿用现有的配色变量（橄榄绿色系），减少嵌套边框，用留白和分组标题替代卡片套卡片。

---

## 三、技术方案

### 1. 拆分 `app.js`（保留业务逻辑，丢弃 DOM 代码）
新建 `web/src/engine/`（纯函数/无 DOM，可单测）：
- `storage.js`：settings / project / history / characterSettings 的读写，**沿用现有 localStorage key 与 project JSON 结构**（`lovelive-engine-web-*`），保证老用户数据可直接加载；`hydrateProject` / `persistableProject` 原样迁移。
- `characters.js`：effectiveCharacters、角色设定导入导出、校验。
- `templates.js`：renderTemplate 等模板渲染。
- `prompts.js`：标准分镜、长漫画梗概、批量分镜、四格候选/分镜、图片 Prompt 的构建。
- `parsers.js`：parseJSONBlock、normalizeStandardStoryboard、normalizeLongOutline、normalizeLongBatchStoryboard、normalizeLongEpisode、四格字幕处理、costume 状态等。
- `providers/text.js`、`providers/image.js`：Gemini / OpenAI-compatible 文本（含 SSE 流式）与图片调用，接受 `AbortSignal`。
- `exporters.js`：图片 Prompt ZIP、项目 JSON、图片下载文件名。
迁移时**逐函数搬运并保持行为一致**，不要"顺手改"Prompt 内容和解析规则。

### 2. 状态管理
- 一个 `ProjectStore`（`useReducer` + Context，或很轻的 zustand 风格自写 store；**不要引入大型新依赖**），包含 project、settings、characterSettings、ui（当前步骤、每个生成块的模式与状态）、job（当前运行任务、进度、AbortController）。
- 自动保存：project 变化后去抖写入 localStorage；`beforeunload` 写一次。去掉"保存项目"按钮，改为顶栏"已自动保存"状态；历史记录在"新建项目"或手动"存为快照"时写入。
- 全自动流程改写为一个 `runPipeline({ from, to })` 异步编排器，按当前模式依次执行各环节，复用同一套 action，支持停止与从失败处续跑（替代"全自动"+"继续"两个按钮）。

### 3. i18n
- 改为 `t(key)` 字典式 i18n（`i18n/zh-CN.js`、`en-US.js` 已存在，扩展它们），组件内直接取文案；**删除 `i18n/dom.js` 的 MutationObserver 文本替换**和 `window.alert` 劫持。
- 切换语言不再 `location.reload()`。
- 角色名按语言显示（有英文名则用），画风名同理（数据里有就用）。

### 4. 组件结构（建议）
```
src/
  main.jsx  App.jsx
  engine/...                  # 见上
  store/                      # ProjectStore, selectors, pipeline
  components/
    AppHeader.jsx  Stepper.jsx  ActionBar.jsx  Toast.jsx  ConfirmDialog.jsx
    SettingsDialog.jsx  HistoryDialog.jsx  LogDialog.jsx  CharacterEditorDialog.jsx
    GenerationStep.jsx        # AI/手动 统一生成块
    ModePicker.jsx  StylePicker.jsx  CharacterPicker.jsx  SelectedTray.jsx
    OutlineView.jsx  FourPanelCandidates.jsx  StoryboardView.jsx  PanelCard.jsx  ImageGrid.jsx  Lightbox.jsx
  steps/
    SetupStep.jsx  OutlineStep.jsx  StoryboardStep.jsx  ArtworkStep.jsx
  styles/  tokens.css  app.css   # 替代 styles.css + studio.css
```
- 删除 `workspaceMarkup` 字符串、`dangerouslySetInnerHTML`、旧 `app.js`、`studio.css` 中的隐藏 hack。

### 5. 测试与验收
- 更新/新增 Playwright 用例（`web/tests/`），至少覆盖：
  1. 首次进入：选模式 → 选角色 → 写灵感 → 主按钮可用。
  2. 标准漫画手动流程：复制 Prompt（剪贴板可 mock）→ 粘贴一个合法的分镜 JSON → 自动解析出 N 格 → 进入成稿 → 显示 N 张格子卡片 → 导出图片 Prompt ZIP 可触发下载。
  3. 长漫画手动流程：粘贴梗概 → 粘贴批量分镜 → 按话分组展示。
  4. 四格：粘贴候选 → 点卡片选择 → 未选时主按钮 disabled。
  5. 老数据兼容：在 localStorage 预置旧格式 project，页面能恢复到正确步骤并显示内容。
  6. 英文界面无中文残留（抽查关键界面），深色主题可用。
  7. 移动端 390px 视口：无横向滚动，底部行动栏可见。
  8. API 流程：用 `page.route` mock Gemini/OpenAI 接口（含 SSE），验证 AI 生成 → 自动解析 → 出图 → 停止按钮。
- 解析器与 Prompt 构建：用已有的真实样例做快照式对比，确保与旧 `app.js` 输出一致（可在迁移前先用旧代码生成基准输出）。
- `npm run build` 成功；`./web/build_dist.sh` 成功；**不要运行 `deploy.sh`**。
- 用 Playwright 对 4 个步骤 × 桌面/移动 × 浅/深色截图，保存到 `web/test-results/ux/` 供人工验收。

---

## 四、约束
- 不读、不改、不创建任何名为 `.env` 的文件（见仓库 AGENTS.md）。
- 不修改 Go 代码、`internal/prompt/templates/`、生成的数据文件；如果确实需要新增数据字段，在交付说明中提出，不要自行修改。
- 不推送、不部署；不要提交（commit），改动留在工作区，由人工审阅。
- 依赖尽量不新增；如必须新增（例如图标），说明理由，并保持包体积小。
- README 中关于网页使用流程的部分同步更新。
