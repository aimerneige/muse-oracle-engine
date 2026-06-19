# 圣谕自演机 - 运行指南

本文档专门说明如何配置和运行“圣谕自演机”的 Go CLI。项目同时提供无需后端服务的静态网页，网页使用方式见 [README.md](./README.md)；旧后端 API、旧版 Web UI 和 Docker 部署方式已移除。

## 1. 环境变量配置

在项目根目录创建 `.env` 文件，或直接通过环境变量传入配置。

### API Key 与模型

```env
GEMINI_API_KEY="your-gemini-key"
GEMINI_BASE_URL=

DEEPSEEK_API_KEY="your-deepseek-key"

OPENAI_API_KEY="your-openai-or-302-key"
OPENAI_BASE_URL=

LLM_PROVIDER=gemini
LLM_MODEL=gemini-3.1-pro-preview

IMAGE_PROVIDER=gemini
IMAGE_MODEL=gemini-3.1-flash-image-preview
GEMINI_IMAGE_SIZE=1K
```

可选提供商：

| 配置 | 可选值 |
|------|--------|
| `LLM_PROVIDER` | `gemini` / `deepseek` / `openai` / `gemini-bridge` / `mock` |
| `IMAGE_PROVIDER` | `gemini` / `gemini-bridge` / `openai` / `gpt-image` / `prompt` / `mock` |

### 存储与自定义资源

```env
DATA_DIR=data/projects
CHARDB_DIR=
STYLES_DIR=
MOCK_MODE=
```

- `DATA_DIR`：生成过程中的项目状态、图片和提示词输出目录。
- `CHARDB_DIR`：外部角色 YAML 根目录，留空时只使用内置角色库。
- `STYLES_DIR`：外部画风模板根目录，留空时只使用内置画风。
- `MOCK_MODE`：设为任意非空值后，LLM 和图像提供商都会切换为 Mock。

## 2. 基础运行

```bash
go run cmd/generate/main.go \
    --characters "lovelive/honoka,lovelive/umi" \
    --plot "穗乃果和海未的温馨下课后日常，想要吃面包的穗乃果。轻松发糖向" \
    --style chibi_figure \
    --language 中文
```

执行流程：

1. 读取角色、画风和模型配置。
2. 生成故事与详细分镜。
3. 在终端等待人工审阅；按回车接受，或输入修改意见重新生成。
4. 根据分镜生成图片，输出到 `DATA_DIR/<project-id>`。

## 3. CLI 参数

| 参数 | 说明 |
|------|------|
| `--characters` | 逗号分隔的角色 ID，例如 `lovelive/honoka,lovelive/umi` |
| `--plot` | 漫画剧情方向或提示 |
| `--style` | 画风 ID，例如 `chibi_figure` |
| `--language` | 台词气泡对白语言，默认 `中文` |
| `--resume <project-id>` | 从已有项目恢复 |
| `--retry-image <n>` | 重试第 n 张图片，必须配合 `--resume` |
| `--list-characters` | 查看当前装载的角色 |
| `--list-styles` | 查看支持的画风 |
| `--list-models` | 查看程序已知模型 |
| `--prompt-only` | 只输出图像提示词，不调用图像生成 API |
| `--long-manga` | 启用多集长篇漫画流程 |

## 4. 断点续跑和重试

从已有项目继续：

```bash
go run cmd/generate/main.go --resume <project-id>
```

重试单张图片：

```bash
go run cmd/generate/main.go --resume <project-id> --retry-image 3
```

只生成提示词：

```bash
go run cmd/generate/main.go \
    --prompt-only \
    --characters "lovelive/honoka,lovelive/umi" \
    --plot "社团室里的点心争夺战" \
    --style chibi_figure
```

## 5. 长篇漫画流程

```bash
go run cmd/generate/main.go \
    --characters "lovelive/honoka,lovelive/umi" \
    --plot "二人围绕校园祭准备展开的连续剧情" \
    --style chibi_figure \
    --long-manga
```

长篇流程会先生成 outline，并把状态保存到项目目录。确认 outline 后，程序会生成所有 episode 的分镜并继续进入图片生成。

## 6. 自定义角色

设置 `CHARDB_DIR=./my-characters`，目录结构示例：

```text
my-characters/
└── my-series/
    ├── _series.yaml
    └── john.yaml
```

角色 YAML 格式可参考 `internal/chardb/data/` 下的内置数据。

## 7. 自定义画风

设置 `STYLES_DIR=./my-styles`，目录结构示例：

```text
my-styles/
└── dark_fantasy/
    ├── style.yaml
    └── draw.md.tmpl
```

画风模板使用 Go `text/template`，可参考 `internal/prompt/templates/comic_draw/` 下的内置模板。
