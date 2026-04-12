# 圣谕自演机

LoveLive 漫画自动生成器 —— 基于 Gemini API 的 AI 漫画创作工具。

## 简介

圣谕自演机是一个自动生成 LoveLive 主题漫画的工具。通过 Gemini 大语言模型生成故事脚本与分镜，再利用 Gemini 图像生成能力创作漫画图片。

## 功能特性

- **智能故事生成**：根据提示词自动生成连贯的长篇漫画剧情
- **专业分镜脚本**：AI 分镜导演输出标准的视觉分镜描述
- **多种画风支持**：
  - Chibi Figure（Q版风格）
  - Figma Figure（手办风格）
  - WaterColor（水彩风格）
- **自动化工作流**：从提示词到成品图片一键完成

## 技术架构

```
.
├── cmd/generate/          # 主程序入口
├── pkg/
│   ├── llm/               # LLM 提供者接口 (Gemini)
│   ├── img/               # 图像生成接口 (Nanobanana)
│   └── worker/            # 核心工作流
│       ├── generate_storybook.go      # 故事脚本生成
│       ├── generate_comic_image.go    # 漫画图片生成
│       └── prompts/                   # Prompt 模板
└── imgs/                  # 输出目录
```

## 环境要求

- Go 1.26+
- Gemini API Key

## 快速开始

### 1. 配置环境变量

创建 `.env` 文件：

```env
GEMINI_API_KEY=your_gemini_api_key
```

### 2. 运行程序

```bash
go run cmd/generate/main.go
```

### 3. 查看输出

生成的漫画图片保存在 `imgs/YYYYMMDD/<uuid>/` 目录下。

## 工作流程

1. **步骤一：故事脚本生成**
   - 根据提示词生成角色设定与剧情大纲
   - 输出全局固有生理特征设定

2. **步骤二：漫画分镜生成**
   - 生成详细的视觉分镜脚本
   - 每一格包含构图、场景、角色姿势、对白等

3. **步骤三：漫画图片生成**
   - 根据分镜脚本逐幅生成漫画图片
   - 支持多种画风切换

## 自定义提示词

在 `cmd/generate/main.go` 中修改 `hint` 变量：

```go
hint := `LoveLive 中的穗乃果和海未为主角。二人在学校里的温馨日常。发糖向，轻百合向。角色台词和行为要符合官方设定，绝对禁止OOC。长度控制在 24 格，剧情要连贯，不要拆分成多个小剧场。`
```

## 支持的模型

### LLM 模型 (Gemini)

| 模型 | 说明 |
|------|------|
| Gemini3Pro | Gemini 3.1 Pro Preview |
| Gemini3Flash | Gemini 3 Flash Preview |
| Gemini3FlashLite | Gemini 3.1 Flash Lite Preview |
| Gemini2Pro | Gemini 2.5 Pro |
| Gemini2Flash | Gemini 2.5 Flash |
| Gemini2FlashLite | Gemini 2.5 Flash Lite |

### 图像生成模型

| 模型 | 说明 |
|------|------|
| NanoBanana2 | Gemini 3.1 Flash Image Preview |
| NanoBananaPro | Gemini 3 Pro Image Preview |
| NanoBanana | Gemini 2.5 Flash Image |

## 依赖

- [google.golang.org/genai](https://pkg.go.dev/google.golang.org/genai) - Google Generative AI Go SDK
- [github.com/joho/godotenv](https://github.com/joho/godotenv) - 环境变量管理
- [github.com/google/uuid](https://github.com/google/uuid) - UUID 生成

## License

MIT License
