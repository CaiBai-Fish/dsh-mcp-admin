# dsh-mcp-admin

DSH（DeepSeek Harness）插件：为内置的 `@deepseek-ai/dsh-mcp-manager` 提供可视化入口。官方管理器只提供宿主服务与 Settings 配置命名空间，没有客户端界面；本插件补上设置页与独立网页两种入口。

## 能力

- **设置页入口**：`设置 → MCP 服务器`（`settings.section`，order 90），列出服务器与实时连接状态，支持新增、编辑、删除与保存。
- **独立网页**：`http://127.0.0.1:<DSH 端口>/mcp-admin`，与设置页共用同一套 API，仅接受本机回环访问（局域网 IP 返回 403）。
- 读写对象是 profile 的 `cordis.patch.yml` 中 `mcp-manager.config.servers`，保存时只替换该条目，保留文件其余内容。
- 保存后需重启 DSH 生效；页面提供「保存并重启 DSH」按钮（调用 `~/.dsh/restart-desktop.ps1`）。

## 传输支持

| 传输 | 字段 |
|---|---|
| `streamable-http` | `url`、`headers`（支持 `${credential:REF}` 模板） |
| `stdio` | `command`、`args`、`env`、`cwd` |

## 安装

作为本地 link 插件，在 profile 的 `package.json` 中声明：

```jsonc
"dependencies": { "dsh-mcp-admin": "link:E:/sourse/plugins/dsh-mcp-admin" },
"dsh": { "profile": { "bundles": ["dsh-mcp-admin"] } }
```

插件自带 `cordis.patch.yml` 完成 `insert`，无需手写 profile patch。桌面端通过 `dsh.client` 加载设置页组件（`settings.section`）。

## 结构

| 文件 | 职责 |
|---|---|
| `index.js` | 宿主插件：`webServer` 路由、YAML 读写、`mcpManager.list()` 状态、重启 |
| `client.js` | 浏览器 bundle：`window.__ModuleLoader__` 包装，注册 `settings.section` |
| `cordis.patch.yml` | bundle 自注册条目 |

## 已知限制

- 手写 JavaScript，不参与 TypeScript 构建。
- 通过目录联接安装时，`createRequire` 无法从 profile 解析依赖，需要把 `js-yaml` 复制到本包 `node_modules`（见 `node_modules/.gitignore` 说明；本仓库不提交该目录）。
- 配置写入后靠重启生效，不触达 Loader 的 volatile 热更新。

## License

MIT
