window.__ModuleLoader__.load({
  id: "dsh-mcp-admin",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;

    var S = {
      wrap: { padding: "4px 2px", display: "flex", flexDirection: "column", gap: "12px" },
      card: { border: "1px solid var(--dsh-border, rgba(127,127,127,.35))", borderRadius: "10px", padding: "12px 14px", background: "var(--dsh-surface, rgba(127,127,127,.06))" },
      row: { display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" },
      name: { fontWeight: 600, fontSize: "14px" },
      tag: { fontSize: "11px", padding: "1px 8px", borderRadius: "999px", border: "1px solid currentColor", opacity: 0.8 },
      muted: { fontSize: "12px", opacity: 0.6 },
      btn: { padding: "4px 10px", borderRadius: "7px", border: "1px solid var(--dsh-border, rgba(127,127,127,.4))", background: "transparent", color: "inherit", cursor: "pointer", fontSize: "13px" },
      primary: { padding: "5px 12px", borderRadius: "7px", border: "1px solid #3b6fe0", background: "#3b6fe0", color: "#fff", cursor: "pointer", fontSize: "13px" },
      danger: { padding: "4px 10px", borderRadius: "7px", border: "1px solid #c0392b", background: "transparent", color: "#c0392b", cursor: "pointer", fontSize: "13px" },
      input: { width: "100%", boxSizing: "border-box", padding: "5px 8px", borderRadius: "7px", border: "1px solid var(--dsh-border, rgba(127,127,127,.4))", background: "transparent", color: "inherit", fontSize: "13px" },
      label: { display: "block", fontSize: "11px", opacity: 0.65, margin: "8px 0 3px" },
      err: { fontSize: "12px", color: "#c0392b" },
      ok: { fontSize: "12px", color: "#16874a" }
    };

    function readState() {
      return fetch("/mcp-admin/api/state", { cache: "no-store" }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      });
    }

    function saveServers(servers) {
      return fetch("/mcp-admin/api/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ servers: servers })
      }).then(function (r) { return r.json().then(function (b) { if (!r.ok) throw new Error(b.error || ("HTTP " + r.status)); return b; }); });
    }

    function restart() {
      return fetch("/mcp-admin/api/restart", { method: "POST" });
    }

    function statusText(item) {
      if (!item) return "未加载";
      var st = item.status;
      if (st === undefined || st === null) return item.configured ? "已配置" : "已注册";
      if (typeof st === "string") return st;
      try { return JSON.stringify(st).slice(0, 120); } catch (e) { return String(st); }
    }

    function isGood(text) {
      return /connected|running|ready|ok/i.test(text);
    }

    function parseLines(text, sep) {
      var out = {};
      String(text || "").split(/\r?\n/).forEach(function (line) {
        var t = line.trim();
        if (!t) return;
        var i = t.indexOf(sep);
        if (i < 0) return;
        out[t.slice(0, i).trim()] = t.slice(i + 1).trim();
      });
      return out;
    }

    function emptyDraft() {
      return { name: "", transport: "streamable-http", enabled: true, url: "", headersText: "", command: "", argsText: "", envText: "", cwd: "" };
    }

    function toDraft(name, s) {
      s = s || {};
      var headers = s.headers || {};
      var env = s.env || {};
      return {
        name: name,
        transport: s.transport || "streamable-http",
        enabled: s.enabled !== false,
        url: s.url || "",
        headersText: Object.keys(headers).map(function (k) { return k + ": " + headers[k]; }).join("\n"),
        command: s.command || "",
        argsText: (s.args || []).join(" "),
        envText: Object.keys(env).map(function (k) { return k + "=" + env[k]; }).join("\n"),
        cwd: s.cwd || ""
      };
    }

    function fromDraft(d) {
      var s = { transport: d.transport, enabled: !!d.enabled };
      if (d.transport === "streamable-http") {
        s.url = (d.url || "").trim();
        s.headers = parseLines(d.headersText, ":");
      } else {
        s.command = (d.command || "").trim();
        s.args = (d.argsText || "").trim() ? (d.argsText || "").trim().split(/\s+/) : [];
        s.env = parseLines(d.envText, "=");
        if ((d.cwd || "").trim()) s.cwd = d.cwd.trim();
      }
      return s;
    }

    function Field(props) {
      return h("div", null,
        h("label", { style: S.label }, props.label),
        h("input", { style: S.input, value: props.value, placeholder: props.placeholder || "", onChange: function (e) { props.onChange(e.target.value); } })
      );
    }

    function AreaField(props) {
      return h("div", null,
        h("label", { style: S.label }, props.label),
        h("textarea", { style: Object.assign({}, S.input, { minHeight: "64px", fontFamily: "ui-monospace, Consolas, monospace", fontSize: "12px" }), value: props.value, placeholder: props.placeholder || "", onChange: function (e) { props.onChange(e.target.value); } })
      );
    }

    function Editor(props) {
      var d = props.draft;
      var set = props.set;
      var http = d.transport === "streamable-http";
      return h("div", { style: Object.assign({}, S.card, { borderColor: "#3b6fe0" }) },
        h("div", { style: S.row }, h("strong", { style: S.name }, props.title)),
        h(Field, { label: "名称（字母数字 _ - ，1–32 位）", value: d.name, onChange: function (v) { set("name", v); } }),
        h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" } },
          h("div", null,
            h("label", { style: S.label }, "传输"),
            h("select", { style: S.input, value: d.transport, onChange: function (e) { set("transport", e.target.value); } },
              h("option", { value: "streamable-http" }, "streamable-http"),
              h("option", { value: "stdio" }, "stdio")
            )
          ),
          h("div", null,
            h("label", { style: S.label }, "启用"),
            h("select", { style: S.input, value: d.enabled ? "true" : "false", onChange: function (e) { set("enabled", e.target.value === "true"); } },
              h("option", { value: "true" }, "是"),
              h("option", { value: "false" }, "否")
            )
          )
        ),
        http
          ? h("div", null,
              h(Field, { label: "URL", value: d.url, placeholder: "https://example.com/mcp", onChange: function (v) { set("url", v); } }),
              h(AreaField, { label: "Headers（每行 Key: Value）", value: d.headersText, placeholder: "Authorization: Bearer xxx", onChange: function (v) { set("headersText", v); } })
            )
          : h("div", null,
              h(Field, { label: "命令", value: d.command, placeholder: "npx", onChange: function (v) { set("command", v); } }),
              h(Field, { label: "参数（空格分隔）", value: d.argsText, placeholder: "-y @modelcontextprotocol/server-github", onChange: function (v) { set("argsText", v); } }),
              h(AreaField, { label: "环境变量（每行 KEY=VALUE）", value: d.envText, onChange: function (v) { set("envText", v); } }),
              h(Field, { label: "工作目录（可选）", value: d.cwd, onChange: function (v) { set("cwd", v); } })
            ),
        h("div", { style: Object.assign({}, S.row, { marginTop: "10px", justifyContent: "flex-end" }) },
          h("button", { style: S.btn, onClick: props.onCancel }, "取消"),
          h("button", { style: S.primary, onClick: props.onConfirm }, "确定")
        )
      );
    }

    function McpSection() {
      var state = useState({ loading: true, data: null, error: null });
      var s = state[0];
      var setState = state[1];
      var editing = useState(null);
      var draftState = useState(null);
      var draft = draftState[0];
      var setDraft = draftState[1];
      var notice = useState("");
      var setNotice = notice[0];
      var setNoticeText = notice[1];
      var serversState = useState({});
      var servers = serversState[0];
      var setServers = serversState[1];

      function refresh() {
        readState().then(function (data) {
          setServers(data.servers || {});
          setState({ loading: false, data: data, error: data.error || null });
        }).catch(function (e) {
          setState({ loading: false, data: null, error: String(e && e.message || e) });
        });
      }

      useEffect(function () { refresh(); }, []);

      function startAdd() {
        editing[1]("__new__");
        setDraft(emptyDraft());
      }

      function startEdit(name) {
        editing[1](name);
        setDraft(toDraft(name, servers[name]));
      }

      function cancel() {
        editing[1](null);
        setDraft(null);
      }

      function confirm() {
        if (!draft) return;
        if (!/^[A-Za-z0-9_-]{1,32}$/.test(draft.name || "")) { setNoticeText("名称不合法"); return; }
        var next = {};
        Object.keys(servers).forEach(function (k) { next[k] = servers[k]; });
        if (editing[0] && editing[0] !== "__new__" && editing[0] !== draft.name) delete next[editing[0]];
        next[draft.name] = fromDraft(draft);
        setServers(next);
        editing[1](null);
        setDraft(null);
        setNoticeText("已修改，点保存写入配置");
      }

      function remove(name) {
        var next = {};
        Object.keys(servers).forEach(function (k) { if (k !== name) next[k] = servers[k]; });
        setServers(next);
        setNoticeText("已删除，点保存写入配置");
      }

      function save() {
        setNoticeText("保存中…");
        saveServers(servers).then(function () {
          setNoticeText("已保存，重启 DSH 后生效");
          refresh();
        }).catch(function (e) { setNoticeText("保存失败：" + String(e && e.message || e)); });
      }

      function restartNow() {
        if (!confirm("保存并重启 DeepSeek Harness？当前会话会中断，约 20 秒后自动重开。")) return;
        saveServers(servers).then(function () { return restart(); }).then(function () {
          setNoticeText("重启已安排");
        }).catch(function (e) { setNoticeText("重启失败：" + String(e && e.message || e)); });
      }

      if (s.loading) return h("div", { style: S.muted }, "加载中…");

      var runtime = {};
      ((s.data && s.data.runtime) || []).forEach(function (item) { if (item && item.name) runtime[item.name] = item; });

      var names = Object.keys(servers);

      return h("div", { style: S.wrap },
        h("div", null,
          h("div", { style: { fontSize: "15px", fontWeight: 600 } }, "MCP 服务器"),
          h("div", { style: S.muted }, "管理 @deepseek-ai/dsh-mcp-manager 的 config.servers。保存后重启 DSH 生效。")
        ),
        s.error ? h("div", { style: S.err }, s.error) : null,
        notice ? h("div", { style: S.ok }, notice) : null,
        s.data ? h("div", { style: S.muted }, "配置文件：" + s.data.file) : null,
        names.length === 0 ? h("div", { style: Object.assign({}, S.card, S.muted) }, "还没有配置 MCP 服务器。") : null,
        names.map(function (name) {
          var item = servers[name] || {};
          var rt = runtime[name];
          var label = statusText(rt);
          var target = item.transport === "stdio"
            ? ((item.command || "") + " " + ((item.args || []).join(" "))).trim()
            : (item.url || "");
          return h("div", { key: name, style: S.card },
            h("div", { style: S.row },
              h("span", { style: S.name }, name),
              h("span", { style: Object.assign({}, S.tag, { color: isGood(label) ? "#16874a" : "#c0392b" }) }, label),
              h("span", { style: S.tag }, item.transport || "streamable-http"),
              h("span", { style: S.tag }, item.enabled === false ? "已停用" : "启用"),
              h("span", { style: Object.assign({}, S.muted, { flex: 1, minWidth: "120px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }) }, target)
            ),
            h("div", { style: Object.assign({}, S.row, { marginTop: "8px", justifyContent: "flex-end" }) },
              h("button", { style: S.btn, onClick: function () { startEdit(name); } }, "编辑"),
              h("button", { style: S.danger, onClick: function () { remove(name); } }, "删除")
            )
          );
        }),
        draft ? h(Editor, {
          title: editing[0] === "__new__" ? "新增服务器" : ("编辑：" + editing[0]),
          draft: draft,
          set: function (key, value) { var next = Object.assign({}, draft); next[key] = value; setDraft(next); },
          onCancel: cancel,
          onConfirm: confirm
        }) : null,
        h("div", { style: S.row },
          h("button", { style: S.primary, onClick: startAdd }, "新增服务器"),
          h("button", { style: S.btn, onClick: save }, "保存"),
          h("button", { style: S.btn, onClick: restartNow }, "保存并重启 DSH"),
          h("button", { style: S.btn, onClick: refresh }, "重新载入")
        )
      );
    }

    var inject = ["slots"];

    function apply(ctx) {
      ctx.slots.inject("settings.section", function () {
        return ctx.slots.register({
          name: "settings.section",
          id: "mcp-admin",
          order: 90,
          label: function () { return "MCP 服务器"; }
        }, McpSection);
      });
    }

    module.exports = { inject: inject, apply: apply };
    Object.defineProperty(module.exports, Symbol.toStringTag, { value: "Module" });
    return module.exports;
  }
});
