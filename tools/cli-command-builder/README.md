# CLI 指令生成器

用于可视化配置 LoveLive Engine CLI 的全部参数，并生成可复制的 Bash/Zsh 指令。页面完全静态，不连接后端，也不会执行生成的命令。

## 本地使用

直接打开 `index.html`，或启动独立的静态文件服务：

```bash
npm start
```

浏览器访问 <http://localhost:8081>。

## 构建与测试

```bash
npm run build
npm test
```

单文件构建产物位于 `dist/cli-command-builder.html`。项目没有第三方依赖，无需执行 `npm install`。

## 同步角色数据

角色目录是从仓库现有网页数据中提取的精简静态副本，只包含作品和角色的名称及 ID。更新角色数据库并同步 `web/src/data.js` 后，运行：

```bash
npm run sync:data
```
