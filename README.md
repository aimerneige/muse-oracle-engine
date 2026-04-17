# 圣谕自演机

> **⚠️ 重要提示**
>
> 1. **本项目大量代码由 AI 辅助完成**，包含但不限于代码生成、架构设计、文档撰写等环节。
> 2. **项目前端 `cmd/server` 功能不完善，不建议使用**，推荐通过 CLI 模式（`cmd/generate`）进行交互。
> 3. **项目还在开发过程中**，会出现各种奇奇怪怪的 bug / 没有测试的函数。

一个多 IP 综合二次元漫画自动生成器 —— 基于各大 AI 大语言模型与图像生成模型的创作工作流工具。

## 简介

圣谕自演机是一款自动生成动漫主题漫画的工具。最初专为 LoveLive 打造，现已通过架构重构，支持任意 IP 系列。系统通过大语言模型生成故事剧本与分镜描述，再利用图像生成模型创作各类画风的精美漫画。

## 功能特性

- **多 IP 角色支持**：内置 **8 大系列、143+ 角色**（LoveLive 全系列、孤独摇滚、轻音少女、间谍过家家、原神等），支持通过 `CHARDB_DIR` 外部配置动态导入自定义角色。
- **智能故事与分镜生成**：根据用户一句简单的提示词，经 AI 自动发掘角色设定，输出分镜视觉描述和符合角色 OOC（Out Of Character）限制的标准对白。支持多集连续剧情输出，每集固定 4 格漫画结构。
- **多画风扩展**：
  - 内置 Chibi Figure（Q版粘土人风格）、Figma Figure（手办风格）、WaterColor（水彩风格）
  - 支持通过 `STYLES_DIR` 外部加载自定义画风模板（Go `text/template` 格式）
- **多模型服务商接入**：
  - **LLM**：Google Gemini、DeepSeek、OpenRouter、302.ai，均支持自定义模型名称
  - **图像生成**：Google Gemini（原生图像生成）、OpenAI DALL-E 3 / DALL-E 2
  - 支持 `--prompt-only` 模式仅输出提示词不调用 API，以及 Mock 模式用于无 Key 测试
- **三步流水线引擎**：剧本生成 → 分镜审阅 → 图像批量生成，每步自动保存检查点（Checkpoint），支持从任意步骤恢复。
- **CLI 命令行模式**：通过 `cmd/generate` 提供交互式命令行体验，包含角色/画风/模型列表查看、断点续跑、单张重试等功能。

## 技术架构

```text
.
├── cmd/
│   ├── generate/          # CLI 主程序入口 (交互式命令行，推荐使用)
│   └── server/            # HTTP API 服务入口 (含内嵌前端 UI，功能不完善)
├── internal/
│   ├── chardb/            # 角色数据库 (YAML 解析 + 内嵌/外部双源加载)
│   ├── config/            # 环境变量驱动配置系统
│   ├── domain/            # 领域实体 (Character, Project, Storyboard, Style 等)
│   ├── pipeline/          # 三步流水线引擎 + 审阅门控 + 状态机管理
│   ├── prompt/            # 提示词模板编译引擎 (Go text/template + goldmark 解析)
│   │   ├── templates/storyboard/    # 剧本生成系统提示词模板
│   │   └── templates/comic_draw/    # 各画风图像生成提示词模板
│   ├── provider/
│   │   ├── llm/           # LLM 文本适配层 (Gemini / DeepSeek / OpenRouter / 302.ai / Mock)
│   │   └── image/         # 图像生成适配层 (Gemini Image / DALL-E / DryRun / Mock)
│   ├── service/           # 业务服务层 (StoryService + ComicService)
│   └── storage/           # 文件持久化层 (JSON 检查点 + 图片/提示词存储)
├── pkg/mdutil/            # Markdown 代码块提取工具 (goldmark 解析器)
├── ui/                    # 前端 SPA (TypeScript + Vite, 编译后 embed 进 Go 二进制)
└── data/                  # (运行时生成) 项目状态、图片与提示词存储
```

## 环境要求

- Go 1.26+
- 大语言模型 API Key（至少配置一个）：`GEMINI_API_KEY` / `DEEPSEEK_API_KEY` / `OPENROUTER_API_KEY` / `THREEOTWO_API_KEY`
- 图像生成 API Key：`GEMINI_API_KEY`（原生支持）或 `OPENAI_API_KEY`（DALL-E）
- （可选）前端构建依赖：Node.js + npm（如需修改 UI）

### 配置说明

通过项目根目录 `.env` 文件或环境变量进行配置，核心变量如下：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `gemini` | LLM 提供商：`gemini` / `deepseek` / `openrouter` / `302ai` / `mock` |
| `LLM_MODEL` | `gemini-3.1-pro-preview` | LLM 模型名称 |
| `IMAGE_PROVIDER` | `gemini` | 图像提供商：`gemini` / `openai` / `prompt` / `mock` |
| `IMAGE_MODEL` | `gemini-3.1-flash-image-preview` | 图像模型名称 |
| `DATA_DIR` | `data/projects` | 项目数据持久化目录 |
| `CHARDB_DIR` | (空) | 自定义角色 YAML 目录 |
| `STYLES_DIR` | (空) | 自定义画风模板目录 |
| `MOCK_MODE` | (空) | 设为任意非空值启用 Mock 模式（无需 API Key） |

完整 `.env.example` 参见项目根目录。

## 快速指南

更多部署、执行与高级自定义指引，请详阅 **[👉 运行指南 (RUNNING_GUIDE.md)](./RUNNING_GUIDE.md)**。

### 极速体验 (CLI 模式)

1. 克隆代码并在根目录创建 `.env` 文件，填入所需 Key：
   ```env
   GEMINI_API_KEY="your_gemini_api_key"
   LLM_PROVIDER=gemini
   IMAGE_PROVIDER=gemini
   ```

2. 运行命令行快速生成漫画：
   ```bash
   go run cmd/generate/main.go \
       --characters 'lovelive/honoka,lovelive/umi' \
       --plot '穗乃果和海未在社团室里的温馨日常，发糖向' \
       --style chibi_figure
   ```

3. 可用的其他查看命令：
   - 查看所有角色（按系列分组）：`go run cmd/generate/main.go --list-characters`
   - 查看所有画风：`go run cmd/generate/main.go --list-styles`
   - 查看可用模型：`go run cmd/generate/main.go --list-models`

4. 断点续跑与单张重试：
   - 从已有项目恢复并重新生成全部图片：`go run cmd/generate/main.go --resume <project-id>`
   - 仅重试某一张图片（不覆盖旧图，新图以 `001_2.png` 格式保存）：
     ```bash
     go run cmd/generate/main.go --resume <project-id> --retry-image 3
     ```
   - 仅输出提示词不调用图像 API（用于调试）：`go run cmd/generate/main.go --prompt-only ...`

## 内置角色库

| 系列 | 角色数 | 角色示例 |
|------|--------|----------|
| LoveLive! μ's | 9 | 穗乃果、海未、鸟希、真姬、妮可、花阳、凛、绘里、希 |
| LoveLive!! Sunshine!! Aqours | 9 | 千歌、曜、梨子、善子、丸、鞠亚、果南、露比、未央 |
| LoveLive! Nijigasaki | 12 | 步梦、咲恋、香音、爱、霞、静留、爱玛、彼方、莉那、魅亚、钟岚、栞 |
| LoveLive! Superstar!! Liella! | 8 | 岚、可可、叶月、莲、千寿、木维芽、惠、志季 |
| 孤独摇滚！ | 4 | 后藤一里 (波奇)、伊地知虹、山田凉、喜多郁代 |
| 轻音少女！ | 6 | 平沢忧、秋山澪、田井中律、琴吹紬、中野梓 |
| 间谍过家家 | 5 | 洛德·福杰、约尔·福杰、阿尼亚·福杰、彭德·福杰、菲奥娜·弗罗斯特 |
| 原神 | 80+ | 蒙德(14) / 璃月(17) / 稻妻(14) / 须弥(11) / 枫丹(13) / 至冬(2) |

> 自定义角色：创建 YAML 文件放置于指定目录，通过 `CHARDB_DIR` 环境变量加载。格式参考 `internal/chardb/data/` 下的现有角色文件。

## 支持的模型列表

**文本大模型 (LLM):**

| 提供商 | 模型列表举例 |
|--------|-------------|
| Gemini | `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-3.1-flash-lite-preview`, `gemini-2.5-pro`, `gemini-2.5-flash` 等 |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` |
| OpenRouter | 自定义任意模型名称 |
| 302.ai | 自定义任意模型名称 |

**图像生成模型:**

| 提供商 | 模型列表举例 |
|--------|-------------|
| Gemini Image | `gemini-3.1-flash-image-preview`, `gemini-3-pro-image-preview`, `gemini-2.5-flash-image` |
| OpenAI DALL-E | `dall-e-3` (默认), `dall-e-2` |

## 开发与构建

项目使用 [Just](https://github.com/casey/just) 命令运行器管理常用操作：

| 命令 | 说明 |
|------|------|
| `just build` | 构建 server + generate 二进制 |
| `just build_prod` | 生产构建（静态链接、Linux、strip） |
| `just run_generate <args>` | 构建并运行 CLI 模式 |
| `just test` / `just test_verbose` | 运行 Go 测试（含详细输出） |
| `just fmt` / `just lint` | 代码格式化与静态检查 |
| `just ci` | 完整 CI 流程：fmt + lint + test + build |
| `just docker_build` / `just docker_up` / `just docker_down` | Docker 构建与容器管理 |

### Docker 部署

```bash
# 使用 docker-compose 一键部署
docker compose up -d

# 服务将监听 :8080，数据持久化到 ./data/projects
```

## License

MIT License
