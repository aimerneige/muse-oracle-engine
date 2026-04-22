# TODO

漫画生成器重构与功能扩展计划

## Phase 1: 项目基础重构 ✅

- [x] 搭建新目录结构（`internal/domain`, `internal/provider`, `internal/pipeline` 等）
- [x] 定义 domain 领域模型（`Character`, `Project`, `Storyboard`, `ComicStyle`）
- [x] 迁移 `pkg/worker/utils` 到 `pkg/mdutil`
- [x] 统一配置管理（`internal/config`），支持多 provider 配置
- [x] 移除旧 `pkg/` 目录中的 `worker`, `llm`, `img` 包

## Phase 2: 角色数据库系统 ✅

- [x] 设计角色 YAML 数据格式规范
- [x] 实现角色注册表（`internal/chardb/registry.go`）
- [x] 录入 LoveLive μ's 全部 9 名角色数据
- [x] 支持按系列 / ID 查询角色
- [x] 实现角色设定自动注入到 prompt 的逻辑

## Phase 3: Prompt 模板系统 ✅

- [x] 将 prompt 从硬编码改为 Go template 参数化模板
- [x] 去除所有 prompt 中的 LoveLive 限定，改为通用动漫二创
- [x] 故事生成 prompt：支持传入角色设定、剧情走向
- [x] 漫画绘制 prompt：去除 `LoveLive_` 前缀，支持传入画风参数
- [x] 支持用户自定义画风模板

## Phase 4: 多模型 Provider 接入 ✅

- [x] 重构 LLM Provider 接口（保持 `GenerateText` + `GenerateTextWithHistory`，新增 `Name()`）
- [x] 迁移 Gemini 适配器到新结构
- [x] 迁移 DeepSeek 适配器到新结构
- [x] 实现 `OpenAICompatAdapter` 通用适配器（OpenAI 兼容 API 格式）

- [x] 重构 Image Provider 接口
- [x] 迁移 Gemini 图像生成适配器到新结构

## Phase 5: 持久化与 Checkpoint ✅

- [x] 定义 `Storage` 接口（Save / Load / Delete / ListProjects）
- [x] 实现文件系统存储（`internal/storage/filestore.go`）
- [x] 每个 pipeline 步骤完成后自动保存 checkpoint
- [x] 保存 LLM 原始响应到中间结果文件
- [x] 支持从 project ID 恢复已有项目
- [x] 支持重置某个步骤的状态进行重试（`ResetToStep` + `ResetSingleImage`）

## Phase 6: Pipeline 工作流引擎 ✅

- [x] 定义 `Step` 接口和 `Pipeline` 引擎
- [x] 实现步骤 1：故事生成（注入角色设定）
- [x] 实现步骤 2：分镜脚本生成
- [x] 实现 Review Gate：分镜审核暂停点
- [x] 实现步骤 3：漫画图片批量生成
- [x] 支持从 checkpoint 断点续跑
- [x] 支持单张图片重试

## Phase 7: CLI 交互改进 ✅

- [x] 入口参数化：支持命令行选择角色 / 剧情走向 / 画风
- [x] 列出可用角色（按系列分组 `--list-characters`）
- [x] 列出可用画风（`--list-styles`）
- [x] 列出可用模型（`--list-models`）
- [x] 分镜 review：终端打印分镜 + 交互式确认（通过 / 重新生成）
- [x] 支持恢复已有项目继续执行（`--resume`）

## Phase 8: HTTP API 后端 ✅

- [x] 搭建 HTTP 服务器（`net/http`）
- [x] 实现角色查询 API（`GET /api/v1/characters`）
- [x] 实现画风查询 API（`GET /api/v1/styles`）
- [x] 实现项目创建 API（`POST /api/v1/projects`）
- [x] 实现项目列表 API（`GET /api/v1/projects`）
- [x] 实现项目状态查询 API（`GET /api/v1/projects/{id}`）
- [x] 实现生成触发 API（story / storyboard / images）
- [x] 实现审核提交 API（`POST /api/v1/projects/{id}/review`）
- [x] 实现图片获取 API
- [x] 实现单步重试 API（`POST /api/v1/projects/{id}/retry/{step}`）
- [x] 实现单图重试 API（`POST /api/v1/projects/{id}/images/{index}/retry`）
- [x] 实现项目删除 API

## Phase 9: 扩展角色数据库 ✅

- [x] LoveLive! μ's — 9 名角色（穗乃果、海未、小鸟、真姬、妮可、花阳、凛、绘里、希）
- [x] LoveLive! Sunshine!! Aqours — 9 名角色（千歌、梨子、曜、善子、花丸、露比、黛雅、果南、鞠莉）
- [x] LoveLive! 虹咲学园 — 6 名角色（步梦、霞、雫、雪菜、爱、果林）
- [x] LoveLive! Superstar!! Liella! — 5 名角色（香音、可可、千砂都、堇、恋）
- [x] 孤独摇滚！结束乐队 — 4 名角色（独、虹夏、凉、郁代）
- [x] 轻音少女 放课后茶话会 — 5 名角色（唯、澪、律、紬、梓）
- [x] 间谍过家家 福杰家 — 4 名角色（罗伊德、约尔、阿尼亚、邦德）
- [x] 支持用户自定义角色（通过 CHARDB_DIR 环境变量指定外部 YAML 目录）

**共计 7 个系列，42 个角色**

## Future / Nice to Have

- [ ] WebSocket 支持实时进度推送
- [ ] 前端 Web UI
- [ ] 图片拼接（多幅合成长图）
- [ ] 生成结果评分 / 筛选
- [ ] 多语言 prompt 支持
- [x] Docker 容器化部署
- [ ] Rate Limiting 和 API Key 认证

## Phase 10: 画风模板引擎 ✅
- [x] 支持用户自定义画风模板（通过 STYLES_DIR 环境变量指定外部 YAML 目录）

## 补充完成 ✅
- [x] 补充更多虹咲角色（艾玛、璃奈、彼方、栞子、兰珠、米娅）
