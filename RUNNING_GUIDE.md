# 圣谕自演机 - 运行指南

本文档将指导您如何配置、启动和高度自定义“圣谕自演机”。由于项目重构，目前支持 **CLI（命令行脚本）** 与 **Server（API服务）** 两套独立的工作模式。

---

## 1. 环境变量配置 (`.env`)

在项目根目录复制 `.env.example` 为 `.env` 并进行编辑。主要的配置部分如下：

### API 秘钥与模型配置
你可以自由选择生成故事文案 (`LLM_PROVIDER`) 以及生成绘图 (`IMAGE_PROVIDER`) 所用的服务供应商。

```env
# 填入你拥有的对应平台的 API Key
GEMINI_API_KEY="your-gemini-key"
# 可选：Gemini 兼容代理地址，同时用于 Gemini 文本和图片生成
GEMINI_BASE_URL=
DEEPSEEK_API_KEY="your-deepseek-key"


# 指定当前使用的 LLM 供应商 (gemini, deepseek)
LLM_PROVIDER=gemini
# 对应的模型名字 (例如 gemini-3.1-pro-preview, deepseek-chat)
LLM_MODEL=gemini-3.1-pro-preview

# 指定当前使用的生图供应商 (目前默认 gemini, 可选 openai, gpt-image)
IMAGE_PROVIDER=gemini
IMAGE_MODEL=gemini-3.1-flash-image-preview
```

### 存储与自定义目录配置
通过配置目录路径可以实现项目存档以及外挂资源读取：

```env
# 生成过程中产生的存档和图片将存储于此 (默认 data/projects)
DATA_DIR=data/projects

# 如果你想自己添加外部角色数据库，可指定该目录 (留空即使用内置角色)
CHARDB_DIR=

# 如果你想自己拓展生图提示词画风，可指定该目录 (留空即使用内置画风)
STYLES_DIR=
```

---

## 2. CLI 命令行模式

命令行模式适用于在本地快速一键生成，且中途会有命令行交互让您确认“分镜生成情况”。

### 基础调用

包含必填参数 `--characters` 和 `--plot`：
```bash
go run cmd/generate/main.go \
    --characters "lovelive/honoka,lovelive/umi" \
    --plot "穗乃果和海未的温馨下课后日常，想要吃面包的穗乃果。轻松发糖向" \
    --style chibi_figure \
    --language 中文
```

一旦开始执行：
1. 程序会自动生成大纲。
2. 自动生成详细分镜脚本。
3. **等待并提示您进行 Review (审阅)**：你可以在终端查看分镜，如果觉得可以按回车继续，否则输入理由让它重新修改分镜。
4. 按分镜生成多张图片存储于 `data/projects/<UUID>` 中。

### CLI 全部可用参数
- `--characters`: 逗号分隔的角色 ID（格式: `剧集代号/角色名`，可以跨区关公战秦琼！）。
- `--plot`: 漫画大纲与走向的指引词。
- `--style`: 期望使用的画风ID（默认为 `chibi_figure`）。
- `--language`: 台词气泡中的对白语言，默认为 `中文`。该参数只影响对白气泡里的台词文字，不影响分镜标题、画面描述、角色动作等内容；漫符与 SFX 始终固定使用日语片假名。
- `--no-review`: 自动化模式专用。如果加上该参数，程序将不会停下来等待你审阅分镜，直接往下生成图片。
- `--resume <uuid>`: 当你不小心关掉终端或想从中断的特定项目恢复进度，使用该参数即可。
- `--list-characters`: 查看当前已装载的所有角色名录 (自带库+你外挂的库)。
- `--list-styles`: 查看支持的画风名录。
- `--list-models`: 查看程序已知匹配的所有底层模型。

---

## 3. Server API 模式

Server API 模式适用于前后端分离应用。你可以启动它作为生成器核心微服务。

### 启动 Server

因为我们内置了一套精美的静态前端网页（在 `ui/` 目录下），在第一次启动 Server 之前或每次修改了前端代码后，你需要进行前端构建：

```bash
cd ui
npm install
npm run build
cd ..
```

完成构建后，启动 Go 后端：

```bash
go run cmd/server/main.go
# 默认监听于 ":8080" (可通过 `.env` 修改 SERVER_ADDR 设置)
```

### 核心工作流 API 详解

**1. 创建项目**
```bash
curl -X POST http://localhost:8080/api/v1/projects \
    -H 'Content-Type: application/json' \
    -d '{
        "characters": ["bocchi/hitori", "kon/yui"],
        "plot_hint": "跨番剧音乐女孩碰头，波奇酱的社恐爆发",
        "style": "watercolor",
        "language": "中文"
    }'
```
*响应返回带有 `id` 字段的 Project 对象。*

`language` 字段可省略，省略时默认为 `中文`。它只控制台词气泡中的对白语言；漫符与 SFX 固定为日语片假名，不会随 `language` 改变。

**2. 生成剧本大纲 (Story)**
```bash
curl -X POST http://localhost:8080/api/v1/projects/<id>/generate/story
```

**3. 生成分镜脚本 (Storyboard)**
```bash
curl -X POST http://localhost:8080/api/v1/projects/<id>/generate/storyboard
```

**4. 审阅分镜与人工修正 (Review)**
```bash
# 满意分镜时
curl -X POST http://localhost:8080/api/v1/projects/<id>/review \
    -H 'Content-Type: application/json' \
    -d '{"approved": true}'

# 不满意分镜时，驳回并提供修改意见 (调用后续需重新生成分镜阶段)
curl -X POST http://localhost:8080/api/v1/projects/<id>/review \
    -H 'Content-Type: application/json' \
    -d '{"approved": false, "feedback": "波奇酱不够紧张，加一点内心慌乱的旁白"}'
```

**5. 生成漫画画面 (Images)**
```bash
curl -X POST http://localhost:8080/api/v1/projects/<id>/generate/images
```

*(高级)* 针对于单张生成失败或丑陋的图片进行重绘补救：
```bash
curl -X POST http://localhost:8080/api/v1/projects/<id>/images/0/retry
```

---

## 4. 高级自定义扩展

### 自定义外部角色库
若要添加系统没有的角色，请在 `.env` 设置 `CHARDB_DIR=./my-characters`。然后在目录下新建文件夹：

```text
my-characters/
└── my-series/
    ├── _series.yaml          # 番剧总信息 (id, name, name_en)
    └── john.yaml             # 单一角色的 yaml 设定档
```
通过编写 YAML 文件传入该角色的官方外貌、发色、特定服装、性格特征从而将自己喜爱的角色加入图库。

### 自定义外部画风模板
如同设置角色，在 `.env` 指定 `STYLES_DIR=./my-styles`。并在其下创建：

```text
my-styles/
└── dark_fantasy/
    ├── style.yaml         # 画风声明包含名称描述
    └── draw.md.tmpl       # 提供给生图 AI 的 Prompt 魔法模版
```
你可以在模版中随意注入大师的画风咒语，来让圣谕自演机支持你最爱的上色和渲染技法！
