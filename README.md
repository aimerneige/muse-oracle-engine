# 圣谕自演机

> **项目状态**
>
> 1. 本项目大量代码由 AI 辅助完成，包括代码生成、架构设计和文档撰写。
> 2. 网页的 Prompt 生成、结果粘贴解析、项目本地保存和导出功能可用；浏览器内直接调用模型 API 与全自动生成功能仍在开发中。

圣谕自演机是一个面向多 IP 角色的二次元漫画创作工具。项目将角色资料、故事模板和画风模板打包进静态网页，让用户可以在浏览器中组织角色与剧情、生成 Prompt，并通过手动粘贴模型结果完成标准漫画或长篇漫画的创作流程。

仓库同时保留 Go 命令行生成器，供需要直接调用模型 API、断点续跑和图片重试的用户使用。

## 功能特性

### 静态网页

- **无需后端服务**：页面由 HTML、CSS 和原生 JavaScript 构成，不依赖项目后端 API。
- **多 IP 角色库**：内置 LoveLive 系列、孤独摇滚、轻音少女、间谍过家家、原神等角色资料，并支持筛选和搜索。
- **标准漫画流程**：生成分镜 Prompt、解析 LLM 返回结果，再按分镜生成图片 Prompt。
- **长篇漫画流程**：依次规划故事梗概、逐话分镜和图片 Prompt。
- **多画风模板**：内置水彩、蜡笔、像素画、纸艺剪贴、布偶摄影等画风。
- **本地项目管理**：设置、当前项目和最近历史保存在浏览器 `localStorage` 中，项目可导出为 JSON。
- **单文件构建**：可将样式、脚本和筛选后的角色数据打包进一个 HTML 文件。

### Go CLI

- 支持 Gemini、DeepSeek、OpenAI-compatible、gemini-bridge 等 LLM Provider。
- 支持 Gemini Image、OpenAI Image、GPT Image、prompt-only 和 Mock 图片 Provider。
- 支持人工审阅、项目检查点、断点续跑、单张图片重试和长篇漫画流程。
- 支持通过 `CHARDB_DIR` 和 `STYLES_DIR` 加载外部角色与画风模板。

## 网页快速开始

网页不需要安装依赖即可使用。克隆仓库后，用浏览器打开 [`web/index.html`](./web/index.html)。也可以启动任意静态文件服务器，例如：

```bash
python3 -m http.server 8080
```

然后访问 <http://localhost:8080/web/>。

基本使用流程：

1. 选择角色、画风和标准漫画或长篇漫画模式。
2. 填写剧情要求并生成 Prompt。
3. 将 Prompt 交给支持的 LLM，把返回结果粘贴回页面并解析。
4. 生成图片 Prompt，交给图像模型完成出图。
5. 保存浏览器中的当前项目，或导出 JSON 文件。

> **安全提示**：网页设置会保存在当前浏览器的 `localStorage` 中。不要在公共或不受信任的设备上保存 API Key。当前推荐使用复制 Prompt、手动调用模型并粘贴结果的流程。

## 构建单文件网页

构建工具需要 Node.js 和 npm。首次构建先安装依赖：

```bash
cd web
npm install
npm run build:single
```

默认产物为 `web/dist/lovelive-engine.single.html`，包含全部内置作品数据。

只打包指定作品：

```bash
cd web
npm run build:single -- \
    --series lovelive,lovelive-sunshine,bocchi-the-rock \
    --out web/dist/lovelive-engine.single.html
```

仓库也提供了使用上述作品筛选参数的快捷脚本：

```bash
./web/build_single_html.sh
```

## 同步网页静态数据

角色、画风或 Prompt 模板发生变化后，在仓库根目录运行：

```bash
go run web/tools/export_static_data.go
```

该命令会从 Go 内置角色数据库和模板生成 `web/src/data.js`。请勿手动维护其中的生成数据。

## CLI 快速开始

CLI 需要 Go 1.26.1 或更高版本，以及所选模型服务对应的 API Key。在仓库根目录创建 `.env`：

```env
GEMINI_API_KEY="your_gemini_api_key"
LLM_PROVIDER=gemini
IMAGE_PROVIDER=gemini
```

运行标准漫画流程：

```bash
go run cmd/generate/main.go \
    --characters 'lovelive/honoka,lovelive/umi' \
    --plot '穗乃果和海未在社团室里的温馨日常，发糖向' \
    --style watercolor \
    --language 中文
```

常用命令：

```bash
go run cmd/generate/main.go --list-characters
go run cmd/generate/main.go --list-styles
go run cmd/generate/main.go --list-models
go run cmd/generate/main.go --resume <project-id>
go run cmd/generate/main.go --resume <project-id> --retry-image 3
go run cmd/generate/main.go --prompt-only --characters 'lovelive/honoka' --plot '练习后的点心时间' --style watercolor
```

CLI 的环境变量、长篇漫画、自定义角色和自定义画风说明见 [RUNNING_GUIDE.md](./RUNNING_GUIDE.md)。该文档专门描述命令行工作流。

不熟悉 CLI 参数时，可以打开 [`tools/cli-command-builder/index.html`](./tools/cli-command-builder/index.html)，通过可视化选项生成完整指令。该工具是零依赖的独立静态项目，不连接后端，也不会执行命令。

## 项目结构

```text
.
├── cmd/generate/          # Go CLI 入口
├── internal/
│   ├── chardb/            # 内置角色数据库
│   ├── config/            # CLI 环境变量配置
│   ├── domain/            # 领域实体
│   ├── pipeline/          # CLI 生成流水线
│   ├── prompt/            # 故事与画风 Prompt 模板
│   ├── provider/          # LLM 与图像模型适配层
│   ├── service/           # 故事和漫画生成服务
│   └── storage/           # CLI 文件持久化
├── pkg/mdutil/            # Markdown 代码块提取工具
├── tools/
│   └── cli-command-builder/ # 独立的 CLI 指令生成网页
├── web/
│   ├── index.html         # 静态网页入口
│   ├── src/               # 页面样式、逻辑和生成数据
│   └── tools/             # 静态数据导出与单文件构建工具
├── justfile               # Go 开发任务
└── RUNNING_GUIDE.md       # CLI 详细运行指南
```

## 开发命令

项目使用 [Just](https://github.com/casey/just) 管理 Go 开发任务：

| 命令 | 说明 |
|------|------|
| `just build` | 构建 CLI 二进制 |
| `just build_prod` | 构建 Linux 静态 CLI 二进制 |
| `just run_generate <args>` | 构建并运行 CLI |
| `just test` / `just test_verbose` | 运行 Go 测试 |
| `just fmt` / `just lint` | 格式化代码 / 运行 `go vet` |
| `just ci` | 依次运行格式化、静态检查、测试和构建 |

## License

本项目的源代码与内置 Prompt 模板使用不同许可证：

- 源代码和文档使用 MIT License，见 [LICENSE](./LICENSE)。
- `internal/prompt/templates` 下的 Prompt 模板使用 Creative Commons Attribution-NonCommercial 4.0 International License（CC BY-NC 4.0），见 [internal/prompt/templates/LICENSE](./internal/prompt/templates/LICENSE)。
