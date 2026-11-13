// 注册 id 必须等于包名：客户端模块加载器按包名匹配图谱条目。
if (!globalThis.__DSH_PRESET_FORCE_REGISTERED__) {
  globalThis.__DSH_PRESET_FORCE_REGISTERED__ = true;
  window.__ModuleLoader__.load({
  id: "@wasd258/dsh-preset-force",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;

    const inject = ["slots"];

    // ── API ────────────────────────────────────────────────────────────────
    const api = {
      status: (sessionId) =>
        fetch("/dsh-preset-force/status" + (sessionId ? "?sessionId=" + encodeURIComponent(sessionId) : "")).then((r) => r.json()),
      switch: (sessionId, preset) =>
        fetch("/dsh-preset-force/switch", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, preset }),
        }).then((r) => r.json()),
    };

    let React = null;
    try { React = require("react"); } catch { React = null; }

    // ── 通道一：插槽注入（浏览器等插槽可用的宿主）────────────────────────
    function PresetForceSelect(props) {
      const sessionId = props && props.sessionId ? props.sessionId : null;
      const [state, setState] = React.useState({ current: null, available: [], live: false, busy: false });
      const [picked, setPicked] = React.useState("");
      // busy 的同步镜像：refresh 的 5s 轮询与 onChange 都可能读到闭包里的旧 state.busy。
      const busyRef = React.useRef(false);

      const refresh = React.useCallback(() => {
        if (!sessionId) return;
        api.status(sessionId)
          .then((data) => {
            // busy 必须在所有返回路径上复位，否则控件会永久禁用。
            busyRef.current = false;
            if (!data || data.ok === false) {
              setState((s) => ({ ...s, busy: false }));
              return;
            }
            const available = data.available || [];
            // 服务端是唯一真值：无条件采纳 data.current。
            // 旧实现「p 合法就保留 p」会让切换成功后显示停在旧值，直到下一次点击。
            setState((s) => ({ ...s, current: data.current, available, live: !!data.live, busy: false }));
            setPicked(data.current || "");
          })
          .catch(() => {
            busyRef.current = false;
            setState((s) => ({ ...s, busy: false }));
          });
      }, [sessionId]);

      React.useEffect(() => {
        refresh();
        const timer = setInterval(() => {
          if (!busyRef.current) refresh();
        }, 5000);
        return () => clearInterval(timer);
      }, [refresh]);

      if (!sessionId) return null;

      const doSwitch = (id) => {
        if (busyRef.current) return;
        if (id === state.current) {
          setPicked(state.current || "");
          return;
        }
        busyRef.current = true;
        setState((s) => ({ ...s, busy: true }));
        api.switch(sessionId, id)
          .then((data) => {
            // 成功后交给 refresh：它复位 busy 并采纳新的 current，避免中间的半截状态。
            if (data && data.ok) {
              refresh();
              return;
            }
            busyRef.current = false;
            setState((s) => ({ ...s, busy: false }));
            setPicked(state.current || "");
            window.alert("切换失败：" + ((data && data.error) || "未知错误"));
          })
          .catch((e) => {
            busyRef.current = false;
            setState((s) => ({ ...s, busy: false }));
            setPicked(state.current || "");
            window.alert("切换失败：" + String((e && e.message) || e));
          });
      };

      const disabled = state.busy || !state.live || state.available.length === 0;

      if (state.available.length === 0) {
        return React.createElement(
          "select",
          { style: SLOT_SEL, disabled: true, "data-preset-force": "slot", title: "无可用模式（未装配 agent presets）" },
          React.createElement("option", { value: "" }, "模式"),
        );
      }

      return React.createElement(
        "select",
        {
          style: SLOT_SEL,
          value: picked,
          disabled: disabled,
          "data-preset-force": "slot",
          title: "强制切换当前会话的模式（agent preset）",
          onChange: (e) => doSwitch(e.target.value),
        },
        (state.available || []).map((a) =>
          React.createElement("option", { key: a.id, value: a.id }, a.name ? a.name + " (" + a.id + ")" : a.id),
        ),
      );
    }

    const SLOT_SEL = {
      background: "var(--dsw-alias-bg-layer-2, #1f1f23)",
      color: "var(--dsw-alias-label-primary, #e8e8ea)",
      border: "1px solid var(--dsw-alias-border-l1, #3a3a40)",
      borderRadius: 6,
      padding: "1px 4px",
      fontSize: 12,
      lineHeight: "18px",
      maxWidth: 160,
      cursor: "pointer",
      verticalAlign: "middle",
    };

    function applySlot(slots) {
      slots.inject("conversation.input.right", () =>
        slots.register(
          { name: "conversation.input.right", id: "preset-force", order: 10, label: "模式切换" },
          (props) => React.createElement(PresetForceSelect, props),
        ),
      );
    }

    // ── 通道二：DOM 兜底（桌面App等插槽不可用的宿主）─────────────────────
    // 纯 DOM 实现，不依赖插槽/React 渲染链路；固定悬浮在输入框右下方。
    const FB = {
      root: null,
      timer: null,
      state: { sessions: [], available: [], busy: false, error: null, sessionPick: "", presetPick: "" },
    };

    const fbEl = (tag, style, attrs) => {
      const el = document.createElement(tag);
      if (style) Object.assign(el.style, style);
      if (attrs) for (const k of Object.keys(attrs)) el.setAttribute(k, attrs[k]);
      return el;
    };

    // 相对定位：吸附到聊天输入框容器旁，只在对话页出现；离开时自动隐藏。
    const FB_BASE = {
      position: "relative",
      float: "right",
      clear: "both",
      zIndex: "99999",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      padding: "4px 8px",
      borderRadius: "8px",
      background: "var(--dsw-alias-bg-layer-2, rgba(32,32,36,0.92))",
      color: "var(--dsw-alias-label-primary, #e8e8ea)",
      border: "1px solid var(--dsw-alias-border-l1, #3a3a40)",
      boxShadow: "0 2px 10px rgba(0,0,0,0.25)",
      fontSize: "12px",
      lineHeight: "18px",
      fontFamily: "inherit",
      direction: "ltr",
      marginTop: "6px",
      marginRight: "8px",
    };

    const FB_SELECT = {
      background: "transparent",
      color: "inherit",
      border: "none",
      outline: "none",
      fontSize: "12px",
      lineHeight: "18px",
      cursor: "pointer",
      maxWidth: "150px",
    };

    function fbRender() {
      if (!FB.root) return;
      const s = FB.state;
      FB.root.replaceChildren();

      const label = fbEl("span", { opacity: "0.7", whiteSpace: "nowrap" }, { title: "会话模式强切（dsh-preset-force）" });
      label.textContent = "模式";
      FB.root.appendChild(label);

      // 多会话时先选会话
      if (s.sessions.length > 1) {
        const ss = fbEl("select", FB_SELECT, { title: "选择要切换模式的会话" });
        for (const sess of s.sessions) {
          const o = fbEl("option");
          o.value = sess.id;
          o.textContent = (sess.title ? String(sess.title).slice(0, 24) : String(sess.id).slice(0, 8)) + (sess.current ? " · " + sess.current : "");
          if (sess.id === s.sessionPick) o.selected = true;
          ss.appendChild(o);
        }
        ss.onchange = () => { FB.state.sessionPick = ss.value; fbSyncPresetPick(); fbRender(); };
        FB.root.appendChild(ss);
      }

      const ps = fbEl("select", FB_SELECT, { title: "强制切换当前会话的模式（agent preset）" });
      if (s.busy || s.available.length === 0) ps.setAttribute("disabled", "");
      for (const a of s.available) {
        const o = fbEl("option");
        o.value = a.id;
        o.textContent = a.name ? a.name + " (" + a.id + ")" : a.id;
        if (a.id === s.presetPick) o.selected = true;
        ps.appendChild(o);
      }
      ps.onchange = () => fbDoSwitch(ps.value);
      FB.root.appendChild(ps);

      if (s.error) {
        const err = fbEl("span", { color: "#f2777a", maxWidth: "180px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, { title: s.error });
        err.textContent = s.error;
        FB.root.appendChild(err);
      }
    }

    function fbCurrentSession() {
      const s = FB.state;
      if (s.sessions.length === 0) return null;
      return s.sessions.find((x) => x.id === s.sessionPick) || s.sessions[0];
    }

    function fbSyncPresetPick() {
      const sess = fbCurrentSession();
      FB.state.presetPick = (sess && sess.current) || (FB.state.available[0] && FB.state.available[0].id) || "";
    }

    function fbDoSwitch(id) {
      const s = FB.state;
      const sess = fbCurrentSession();
      if (s.busy || !sess || id === sess.current) { fbRender(); return; }
      s.busy = true;
      s.error = null;
      fbRender();
      api.switch(sess.id, id)
        .then((data) => {
          s.busy = false;
          if (data && data.ok) { s.error = null; fbRefresh(); }
          else { s.error = (data && data.error) || "未知错误"; fbSyncPresetPick(); fbRender(); }
        })
        .catch((e) => {
          s.busy = false;
          s.error = String((e && e.message) || e);
          fbSyncPresetPick();
          fbRender();
        });
    }

    function fbRefresh() {
      api.status(null)
        .then((data) => {
          if (!data || data.ok === false) return;
          const s = FB.state;
          s.available = data.available || [];
          s.sessions = (data.sessions || []).filter((x) => x && x.id);
          if (s.sessions.length === 0) { fbUnmount(); return; }
          if (!s.sessions.some((x) => x.id === s.sessionPick)) {
            const live = s.sessions.find((x) => x.live !== false) || s.sessions[0];
            s.sessionPick = live.id;
          }
          fbSyncPresetPick();
          fbRender();
        })
        .catch(() => {});
    }

    // 只在聊天页挂载：检测 URL 是否包含 conversation/chat 路径，否则卸载。
    const CHAT_PATH_RE = /conversation|chat|workspace/;
    function isInChatPage() {
      return CHAT_PATH_RE.test(window.location.hash || window.location.pathname || "");
    }

    function fbMount() {
      if (FB.root || !document.body) return;
      FB.root = fbEl("div", FB_BASE, { "data-preset-force": "fallback" });
      // 插入到聊天输入框容器之后，确保只在对话页出现
      const inputDock = document.querySelector("[data-conversation-scroll], .xpvNua_frame, [class*='input-dock']");
      if (inputDock && inputDock.parentElement) {
        inputDock.parentElement.appendChild(FB.root);
      } else {
        document.body.appendChild(FB.root);
      }
      fbRefresh();
    }

    function fbUnmount() {
      if (FB.root) { FB.root.remove(); FB.root = null; }
    }

    // 页面切换时重新评估挂载/卸载
    function fbEnsureInChat() {
      if (!FB.root) return;
      if (isInChatPage()) {
        fbMount();
      } else {
        fbUnmount();
      }
    }

    // 插槽渲染成功则一直用插槽；否则挂载 DOM 兜底控件。
    function fbCheck() {
      const slotAlive = document.querySelector('select[data-preset-force="slot"]') !== null;
      if (slotAlive) { fbUnmount(); return; }
      if (isInChatPage() && !FB.root) fbMount();
      else if (!isInChatPage()) fbUnmount();
      else if (FB.root) fbRefresh();
    }

    function startFallback() {
      if (window.__DSH_PRESET_FORCE_FB__) return;
      window.__DSH_PRESET_FORCE_FB__ = true;
      setTimeout(() => { fbCheck(); FB.timer = setInterval(fbCheck, 3000); }, 2500);
      // 监听路由变化
      window.addEventListener("hashchange", fbEnsureInChat);
    }

    // ── 注册 ────────────────────────────────────────────────────────────────
    function apply(ctx) {
      const slots = ctx && typeof ctx.get === "function" ? ctx.get("slots") : undefined;
      if (slots && React) {
        try { applySlot(slots); } catch { /* 插槽不可用：走 DOM 兜底 */ }
      }
      startFallback();
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
  });
}
