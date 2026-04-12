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
- [x] 录入 LoveLive 角色数据（穗乃果、海未、小鸟、真姬、日香）
- [x] 支持按系列 / ID 查询角色
- [x] 实现角色设定自动注入到 prompt 的逻辑
- [ ] 补充 LoveLive 剩余角色（花阳、凛、果梨、希）

## Phase 3: Prompt 模板系统 ✅

- [x] 将 prompt 从硬编码改为 Go template 参数化模板
- [x] 去除所有 prompt 中的 LoveLive 限定，改为通用动漫二创
- [x] 故事生成 prompt：支持传入角色设定、剧情走向
- [x] 漫画绘制 prompt：去除 `LoveLive_` 前缀，支持传入画风参数
- [ ] 支持用户自定义画风模板

## Phase 4: 多模型 Provider 接入 ✅

- [x] 重构 LLM Provider 接口（保持 `GenerateText` + `GenerateTextWithHistory`，新增 `Name()`）
- [x] 迁移 Gemini 适配器到新结构
- [x] 迁移 DeepSeek 适配器到新结构
- [x] 实现 `OpenAICompatAdapter` 通用适配器（OpenAI 兼容 API 格式）
- [x] 基于通用适配器实现 OpenRouter 接入
- [x] 基于通用适配器实现 302.ai 接入
- [x] 重构 Image Provider 接口
- [x] 迁移 Gemini 图像生成适配器到新结构

## Phase 5: 持久化与 Checkpoint ✅

- [x] 定义 `Storage` 接口（Save / Load / Delete / ListProjects）
- [x] 实现文件系统存储（`internal/storage/filestore.go`）
- [x] 每个 pipeline 步骤完成后自动保存 checkpoint
- [x] 保存 LLM 原始响应到中间结果文件
- [x] 支持从 project ID 恢复已有项目
- [ ] 支持重置某个步骤的状态进行重试

## Phase 6: Pipeline 工作流引擎 ✅

- [x] 定义 `Step` 接口和 `Pipeline` 引擎
- [x] 实现步骤 1：故事生成（注入角色设定）
- [x] 实现步骤 2：分镜脚本生成
- [x] 实现 Review Gate：分镜审核暂停点
- [x] 实现步骤 3：漫画图片批量生成
- [x] 支持从 checkpoint 断点续跑
- [ ] 支持单张图片重试

## Phase 7: CLI 交互改进 ✅

- [x] 入口参数化：支持命令行选择角色 / 剧情走向 / 画风
- [x] 列出可用角色（按系列分组）
- [x] 列出可用画风
- [ ] 列出可用模型
- [x] 分镜 review：终端打印分镜 + 交互式确认（通过 / 重新生成）
- [ ] 显示项目进度和中间结果
- [x] 支持恢复已有项目继续执行

## Phase 8: HTTP API 后端 ✅

- [x] 搭建 HTTP 服务器（`net/http`）
- [x] 实现角色查询 API（`GET /api/v1/characters`）
- [x] 实现画风查询 API（`GET /api/v1/styles`）
- [x] 实现项目创建 API（`POST /api/v1/projects`）
- [x] 实现项目状态查询 API（`GET /api/v1/projects/{id}`）
- [x] 实现生成触发 API（story / storyboard / images）
- [x] 实现审核提交 API（`POST /api/v1/projects/{id}/review`）
- [x] 实现图片获取 API
- [ ] 实现单步 / 单图重试 API
- [ ] 实现项目列表 API

## Phase 9: 扩展角色数据库

- [ ] 录入更多动漫系列角色数据
  - [ ] 孤独摇滚 (Bocchi the Rock!)
  - [ ] 轻音少女 (K-ON!)
  - [ ] 间谍过家家 (SPY×FAMILY)
  - [ ] 更多系列...
- [ ] 支持用户自定义角色（通过 YAML 文件或 API 提交）

## Future / Nice to Have

- [ ] WebSocket 支持实时进度推送
- [ ] 前端 Web UI
- [ ] 图片拼接（多幅合成长图）
- [ ] 生成结果评分 / 筛选
- [ ] 多语言 prompt 支持
- [ ] Docker 容器化部署
- [ ] Rate Limiting 和 API Key 认证
