# 圣谕自演机

> **⚠️ 重要提示**
>
> 1. **本项目大量代码由 AI 辅助完成**，包含但不限于代码生成、架构设计、文档撰写等环节。
> 2. **项目前端 `cmd/server` 功能不完善，不建议使用**，推荐通过 CLI 模式（`cmd/generate`）进行交互。

一个多 IP 综合二次元漫画自动生成器 —— 基于各大 AI 大语言模型与图像生成模型的创作工作流工具。

## 简介

圣谕自演机是一款自动生成动漫主题漫画的工具。最初专为 LoveLive 打造，现已通过架构重构，支持任意 IP 系列。系统通过大语言模型生成故事剧本与分镜描述，再利用图像生成模型创作各类画风的精美漫画。

## 功能特性

- **多 IP 角色支持**：内置主流二次元企划/动漫角色库（LoveLive 全系列、孤独摇滚、轻音少女、间谍过家家等），并允许用户通过外部配置动态导入自定义角色。
- **智能故事与分镜生成**：根据用户一句简单的提示词，经过 AI 自动发掘设定，输出分镜视觉描述和符合角色 OOC 限制的标准对白。
- **多画风扩展**：
  - 内置支持 Chibi Figure（Q版风格）、Figma Figure（手办风格）、WaterColor（水彩风格）
  - 支持外部加载自定义画风模板
- **多模型服务商接入**：告别单一模型限制，LLM 支持对接 Google Gemini、DeepSeek、OpenRouter 以及 302.ai。
- **双模运行机制**：
  - **CLI 模式**：通过 `cmd/generate` 提供一键式流式命令行生成。
  - **Server 模式**：通过 `cmd/server` 提供标准 RESTful API，用于前端对接、分步预览审阅与并发生成。

## 技术架构

```text
.
├── cmd/
│   ├── generate/          # CLI 主程序入口 (交互式命令行)
│   └── server/            # HTTP API 服务入口
├── internal/
│   ├── chardb/            # 角色数据库解析与加载逻辑
│   ├── config/            # 环境与系统配置加载
│   ├── domain/            # 领域实体模型聚合层
│   ├── pipeline/          # 生成工作流与任务调度
│   ├── prompt/            # 提示词编译引擎 (支持自定义画风)
│   ├── provider/          # 供应商适配层（包含 image 与 llm 接驳）
│   ├── service/           # 梳理工作流的业务服务核心
│   └── storage/           # 本地持久化与 JSON 文件存储
└── data/                  # (运行时生成) 存放项目状态与图片
```

## 环境要求

- Go 1.26+ 
- 大语言模型支持 API Key (Gemini, DeepSeek, OpenRouter, 302.ai 中任选其一均可)
- 图像生成支持 API Key (目前由 Gemini 提供原生支持)

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
   - 查看所有角色：`go run cmd/generate/main.go --list-characters`
   - 查看所有画风：`go run cmd/generate/main.go --list-styles`
   - 查看可用模型：`go run cmd/generate/main.go --list-models`

4. 重新生成单张图片（不覆盖旧图片，新图片会以 `{序号}_{次数}.png` 保存，如 `001_2.png`）：
   ```bash
   go run cmd/generate/main.go --resume <project-id> --retry-image 3
   ```

## 支持的模型列表

**文本大模型 (LLM):**
| 提供商 | 模型列表举例 |
| --- | --- |
| Gemini | `gemini-3.1-pro-preview`, `gemini-3-flash-preview`, `gemini-2.5-pro` 等 |
| DeepSeek | `deepseek-chat`, `deepseek-reasoner` |
| OpenRouter | (自定义任意模型名称均可支持) |
| 302.ai | (自定义任意模型名称均可支持) |

**图像生成模型:**
| 提供商 | 模型列表举例 |
| --- | --- |
| Gemini | `gemini-3.1-flash-image-preview` 等 |

## License

MIT License
