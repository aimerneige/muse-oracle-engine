# 圣谕自演机

> **重要提示**
>
> 1. 本项目大量代码由 AI 辅助完成，包含但不限于代码生成、架构设计、文档撰写等环节。
> 2. 项目已收缩为 CLI-only 工具，只维护 `cmd/generate` 命令行能力。
> 3. 项目还在开发过程中，可能出现未覆盖测试的行为。

一个多 IP 综合二次元漫画自动生成器，基于大语言模型与图像生成模型提供本地命令行创作工作流。

## 功能特性

- **多 IP 角色支持**：内置 LoveLive 全系列、孤独摇滚、轻音少女、间谍过家家、原神等角色库，支持通过 `CHARDB_DIR` 外部导入自定义角色。
- **故事与分镜生成**：根据角色和剧情提示生成标准对白、画面描述和分镜结构。
- **长篇漫画流程**：支持多集连续剧情输出，每集固定 4 格漫画结构。
- **对白语言可配置**：通过 `--language` 设置台词气泡语言，默认 `中文`；漫符与 SFX 固定使用日语片假名。
- **多画风扩展**：内置多种画风模板，并支持通过 `STYLES_DIR` 外部加载自定义 Go `text/template` 画风模板。
- **多模型服务商接入**：支持 Gemini、DeepSeek、OpenAI-compatible、gemini-bridge，以及 Gemini Image、OpenAI DALL-E、GPT Image、prompt-only、Mock 模式。
- **命令行检查点**：生成过程会保存项目状态，支持断点续跑和单张图片重试。

## 项目结构

```text
.
├── cmd/
│   └── generate/          # CLI 主程序入口
├── internal/
│   ├── chardb/            # 角色数据库
│   ├── config/            # 环境变量配置
│   ├── domain/            # 领域实体
│   ├── pipeline/          # CLI 生成流水线
│   ├── prompt/            # 提示词模板引擎
│   ├── provider/          # LLM 与图像生成适配层
│   ├── service/           # 业务服务层
│   └── storage/           # 文件持久化层
├── pkg/mdutil/            # Markdown 代码块提取工具
└── data/                  # 运行时生成的项目状态、图片与提示词
```

## 环境要求

- Go 1.26+
- 大语言模型 API Key：按所选 `LLM_PROVIDER` 配置 `GEMINI_API_KEY`、`DEEPSEEK_API_KEY` 或 `OPENAI_API_KEY`
- 图像生成 API Key：按所选 `IMAGE_PROVIDER` 配置 `GEMINI_API_KEY` 或 `OPENAI_API_KEY`

## 配置

通过项目根目录 `.env` 文件或环境变量配置：

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `gemini` | `gemini` / `deepseek` / `openai` / `gemini-bridge` / `mock` |
| `LLM_MODEL` | `gemini-3.1-pro-preview` | LLM 模型名称；`LLM_PROVIDER=openai` 时默认 `gpt-5.5` |
| `GEMINI_BASE_URL` | 空 | 自定义 Gemini API Base URL |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1/` | 自定义 OpenAI-compatible API Base URL |
| `IMAGE_PROVIDER` | `gemini` | `gemini` / `gemini-bridge` / `openai` / `prompt` / `mock` / `gpt-image` |
| `IMAGE_MODEL` | `gemini-3.1-flash-image-preview` | 图像模型名称 |
| `GEMINI_IMAGE_SIZE` | `1K` | Gemini 图片分辨率：`1K` / `2K` / `4K` |
| `GPT_IMAGE_ENDPOINT` | 空 | 自定义 GPT Image API 地址 |
| `GEMINI_BRIDGE_ENDPOINT` | `http://127.0.0.1:8765` | gemini_bridge 本地服务地址 |
| `GEMINI_BRIDGE_MODEL` | `pro` | gemini_bridge 模型档位：`fast` / `thinking` / `pro` |
| `GEMINI_BRIDGE_TIMEOUT_SECONDS` | `600` | 等待单个 gemini_bridge 任务完成的最长秒数 |
| `DATA_DIR` | `data/projects` | 项目数据持久化目录 |
| `CHARDB_DIR` | 空 | 自定义角色 YAML 目录 |
| `STYLES_DIR` | 空 | 自定义画风模板目录 |
| `MOCK_MODE` | 空 | 设为任意非空值启用 Mock 模式 |

## 快速开始

创建 `.env`：

```env
GEMINI_API_KEY="your_gemini_api_key"
LLM_PROVIDER=gemini
IMAGE_PROVIDER=gemini
```

运行 CLI：

```bash
go run cmd/generate/main.go \
    --characters 'lovelive/honoka,lovelive/umi' \
    --plot '穗乃果和海未在社团室里的温馨日常，发糖向' \
    --style chibi_figure \
    --language 中文
```

常用命令：

```bash
go run cmd/generate/main.go --list-characters
go run cmd/generate/main.go --list-styles
go run cmd/generate/main.go --list-models
go run cmd/generate/main.go --resume <project-id>
go run cmd/generate/main.go --resume <project-id> --retry-image 3
go run cmd/generate/main.go --prompt-only --characters 'lovelive/honoka' --plot '练习后的点心时间' --style chibi_figure
```

长篇漫画流程：

```bash
go run cmd/generate/main.go \
    --characters 'lovelive/honoka,lovelive/umi' \
    --plot '二人围绕校园祭准备展开的连续剧情' \
    --style chibi_figure \
    --long-manga
```

## 开发

项目使用 [Just](https://github.com/casey/just) 管理常用任务：

| 命令 | 说明 |
|------|------|
| `just build` | 构建 CLI 二进制 |
| `just build_prod` | 生产构建 CLI（静态链接、Linux、strip） |
| `just run_generate <args>` | 构建并运行 CLI |
| `just test` / `just test_verbose` | 运行 Go 测试 |
| `just fmt` / `just lint` | 代码格式化与静态检查 |
| `just ci` | 完整 CI 流程：fmt + lint + test + build |

更多运行和自定义说明见 [RUNNING_GUIDE.md](./RUNNING_GUIDE.md)。

## License

This project uses different licenses for source code and built-in prompt templates:

- Source code and documentation are licensed under the MIT License. See [LICENSE](./LICENSE).
- Prompt templates under `internal/prompt/templates` are licensed under the Creative Commons Attribution-NonCommercial 4.0 International License (CC BY-NC 4.0). See [internal/prompt/templates/LICENSE](./internal/prompt/templates/LICENSE).
