export const escapeHtml = (input: string): string =>
  input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export type AdminSection = "dashboard" | "send" | "qrcode" | "deliveries";

interface AdminShellInput {
  adminPath: string;
  title: string;
  active: AdminSection;
  content: string;
}

const NAV_ITEMS: Array<{ key: AdminSection; label: string; glyph: string }> = [
  { key: "dashboard", label: "总览", glyph: "◫" },
  { key: "send", label: "发送测试", glyph: "↗" },
  { key: "qrcode", label: "扫码登录", glyph: "⌘" },
  { key: "deliveries", label: "投递记录", glyph: "≡" }
];

export const THEME_BOOTSTRAP_SCRIPT = `(function () {
  var KEY = "ilink-theme";
  function systemDark() { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function apply(mode) {
    var dark = mode === "dark" || (mode === "auto" && systemDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  apply(stored || "auto");
  try {
    var mq = window.matchMedia("(prefers-color-scheme: dark)");
    var onChange = function () {
      try { if ((localStorage.getItem(KEY) || "auto") === "auto") apply("auto"); } catch (e) {}
    };
    if (mq.addEventListener) { mq.addEventListener("change", onChange); } else if (mq.addListener) { mq.addListener(onChange); }
  } catch (e) {}
})();`;

export const THEME_TOGGLE_SCRIPT = `(function () {
  var KEY = "ilink-theme";
  function systemDark() { return window.matchMedia("(prefers-color-scheme: dark)").matches; }
  function apply(mode) {
    var dark = mode === "dark" || (mode === "auto" && systemDark());
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
  }
  window.__setTheme = function (mode) {
    try { localStorage.setItem(KEY, mode); } catch (e) {}
    apply(mode);
    document.querySelectorAll("[data-theme-value]").forEach(function (button) {
      var active = button.getAttribute("data-theme-value") === mode;
      button.classList.toggle("active", active);
      button.setAttribute("aria-pressed", active ? "true" : "false");
    });
  };
  document.querySelectorAll("[data-theme-value]").forEach(function (button) {
    button.addEventListener("click", function () {
      window.__setTheme(button.getAttribute("data-theme-value"));
    });
  });
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}
  var initial = stored || "auto";
  window.__setTheme(initial);
})();`;

const SHELL_CSS = `
      :root {
        color-scheme: light;
        --bg: #f5f5f7;
        --bg-elevated: #ffffff;
        --card: rgba(255, 255, 255, 0.72);
        --sidebar: rgba(250, 250, 252, 0.72);
        --text: #1d1d1f;
        --text-secondary: #6e6e73;
        --text-tertiary: #86868b;
        --border: rgba(0, 0, 0, 0.08);
        --border-strong: rgba(0, 0, 0, 0.14);
        --accent: #0a84ff;
        --accent-soft: rgba(10, 132, 255, 0.12);
        --success: #34c759;
        --success-soft: rgba(52, 199, 89, 0.14);
        --warning: #ff9f0a;
        --warning-soft: rgba(255, 159, 10, 0.16);
        --danger: #ff3b30;
        --danger-soft: rgba(255, 59, 48, 0.14);
        --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.06), 0 2px 8px rgba(0, 0, 0, 0.05);
        --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.08), 0 24px 80px rgba(0, 0, 0, 0.10);
        --radius-lg: 26px;
        --radius-md: 18px;
        --radius-sm: 12px;
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --bg: #000000;
        --bg-elevated: #1c1c1e;
        --card: rgba(28, 28, 30, 0.72);
        --sidebar: rgba(22, 22, 23, 0.72);
        --text: #f5f5f7;
        --text-secondary: #98989d;
        --text-tertiary: #6e6e73;
        --border: rgba(255, 255, 255, 0.10);
        --border-strong: rgba(255, 255, 255, 0.18);
        --accent: #0a84ff;
        --accent-soft: rgba(10, 132, 255, 0.22);
        --success: #30d158;
        --success-soft: rgba(48, 209, 88, 0.18);
        --warning: #ffd60a;
        --warning-soft: rgba(255, 214, 10, 0.16);
        --danger: #ff453a;
        --danger-soft: rgba(255, 69, 58, 0.18);
        --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4), 0 2px 8px rgba(0, 0, 0, 0.35);
        --shadow-md: 0 8px 24px rgba(0, 0, 0, 0.45), 0 24px 80px rgba(0, 0, 0, 0.55);
      }
      * { box-sizing: border-box; }
      html { overflow-x: hidden; }
      body {
        margin: 0;
        font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Segoe UI", "PingFang SC", "Microsoft YaHei", system-ui, sans-serif;
        color: var(--text);
        background: var(--bg);
        -webkit-font-smoothing: antialiased;
        transition: background 240ms ease, color 240ms ease;
        overflow-x: hidden;
      }
      .shell {
        display: grid;
        grid-template-columns: 260px minmax(0, 1fr);
        min-height: 100vh;
      }
      .sidebar {
        position: sticky;
        top: 0;
        height: 100vh;
        padding: 22px 16px;
        display: flex;
        flex-direction: column;
        gap: 8px;
        background: var(--sidebar);
        backdrop-filter: blur(24px) saturate(180%);
        -webkit-backdrop-filter: blur(24px) saturate(180%);
        border-right: 1px solid var(--border);
        transition: background 240ms ease, border-color 240ms ease;
      }
      .brand {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 6px 10px 18px;
      }
      .brand-mark {
        width: 38px;
        height: 38px;
        border-radius: 11px;
        display: grid;
        place-items: center;
        color: #fff;
        font-weight: 800;
        font-size: 17px;
        background: linear-gradient(145deg, #0a84ff 0%, #5ac8fa 100%);
        box-shadow: 0 4px 12px rgba(10, 132, 255, 0.35);
      }
      .brand-title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: -0.01em;
        line-height: 1.25;
      }
      .brand-sub {
        font-size: 12px;
        color: var(--text-tertiary);
        margin-top: 2px;
      }
      .nav {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .nav-label {
        padding: 10px 12px 6px;
        font-size: 11px;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--text-tertiary);
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 11px 12px;
        border-radius: var(--radius-sm);
        color: var(--text);
        text-decoration: none;
        font-size: 14px;
        font-weight: 500;
        transition: background 160ms ease, color 160ms ease;
        position: relative;
      }
      .nav-item .glyph {
        width: 22px;
        text-align: center;
        color: var(--text-tertiary);
        font-size: 15px;
        transition: color 160ms ease;
      }
      .nav-item:hover { background: var(--accent-soft); }
      .nav-item.active {
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
      }
      .nav-item.active .glyph { color: var(--accent); }
      .sidebar-footer {
        margin-top: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .theme-switch {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2px;
        padding: 3px;
        border-radius: 10px;
        background: var(--bg-elevated);
        border: 1px solid var(--border);
      }
      .theme-switch button {
        border: 0;
        background: transparent;
        color: var(--text-secondary);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 7px 4px;
        border-radius: 8px;
        cursor: pointer;
        transition: background 160ms ease, color 160ms ease;
      }
      .theme-switch button.active {
        background: var(--text);
        color: var(--bg);
      }
      .sidebar-logout {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border-radius: var(--radius-sm);
        color: var(--text-secondary);
        text-decoration: none;
        font-size: 13px;
        transition: background 160ms ease, color 160ms ease;
      }
      .sidebar-logout:hover { background: var(--danger-soft); color: var(--danger); }
      .content {
        padding: clamp(20px, 3vw, 36px);
        min-width: 0;
      }
      .content-head {
        margin-bottom: 22px;
      }
      .content-head h1 {
        margin: 0 0 6px;
        font-size: clamp(26px, 4vw, 34px);
        line-height: 1.1;
        letter-spacing: -0.025em;
        font-weight: 800;
      }
      .content-head p {
        margin: 0;
        color: var(--text-secondary);
        line-height: 1.65;
        overflow-wrap: anywhere;
      }
      .card {
        background: var(--card);
        backdrop-filter: blur(20px) saturate(180%);
        -webkit-backdrop-filter: blur(20px) saturate(180%);
        border: 1px solid var(--border);
        border-radius: var(--radius-lg);
        box-shadow: var(--shadow-md);
        min-width: 0;
      }
      .section {
        padding: clamp(18px, 2.4vw, 26px);
      }
      .grid {
        display: grid;
        grid-template-columns: minmax(0, 1.05fr) minmax(0, 1.15fr);
        gap: 20px;
      }
      .stack {
        display: grid;
        gap: 20px;
      }
      .section-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        flex-wrap: wrap;
        margin-bottom: 18px;
      }
      .section-head h2 {
        margin: 0 0 4px;
        font-size: 20px;
        letter-spacing: -0.015em;
      }
      .section-head p {
        margin: 0;
        color: var(--text-secondary);
        font-size: 14px;
        line-height: 1.6;
      }
      .section-actions {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
      }
      button,
      a.button {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 0;
        border-radius: 999px;
        padding: 10px 18px;
        min-height: 40px;
        background: var(--text);
        color: var(--bg);
        text-decoration: none;
        cursor: pointer;
        font: inherit;
        font-weight: 600;
        font-size: 14px;
        line-height: 1.2;
        text-align: center;
        white-space: nowrap;
        max-width: 100%;
        touch-action: manipulation;
        transition: transform 140ms ease, opacity 140ms ease, background 160ms ease, box-shadow 160ms ease;
      }
      button:active,
      a.button:active { transform: scale(0.97); }
      button.secondary,
      a.secondary {
        background: var(--bg-elevated);
        color: var(--text);
        border: 1px solid var(--border-strong);
      }
      button.danger { background: var(--danger); color: #fff; }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.5;
        transform: none;
      }
      button:focus-visible,
      a.button:focus-visible,
      .nav-item:focus-visible,
      input:focus-visible,
      textarea:focus-visible,
      select:focus-visible {
        outline: 3px solid var(--accent-soft);
        outline-offset: 2px;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .metric {
        padding: 15px 16px;
        border-radius: var(--radius-md);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        min-width: 0;
        transition: background 240ms ease, border-color 240ms ease;
      }
      .metric strong {
        display: block;
        margin-bottom: 7px;
        font-size: 12px;
        font-weight: 600;
        color: var(--text-secondary);
      }
      .metric span {
        font-size: 17px;
        font-weight: 700;
        word-break: break-word;
        letter-spacing: -0.01em;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        border-radius: 999px;
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 700;
        font-size: 13px;
      }
      .status-banner {
        padding: 15px 16px;
        border-radius: var(--radius-md);
        border: 1px solid var(--border);
        background: var(--bg-elevated);
        overflow-wrap: anywhere;
        font-size: 14px;
        line-height: 1.6;
      }
      .status-banner strong { display: block; margin-bottom: 6px; }
      .status-banner.success { background: var(--success-soft); color: var(--success); border-color: transparent; }
      .status-banner.warning { background: var(--warning-soft); color: var(--warning); border-color: transparent; }
      .status-banner.error { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
      .form-grid { display: grid; gap: 14px; }
      label { display: grid; gap: 8px; font-size: 13px; color: var(--text-secondary); font-weight: 600; }
      input,
      textarea,
      select {
        width: 100%;
        border: 1px solid var(--border-strong);
        border-radius: var(--radius-sm);
        padding: 11px 14px;
        background: var(--bg-elevated);
        color: var(--text);
        font: inherit;
        min-width: 0;
        transition: background 240ms ease, border-color 240ms ease, color 240ms ease;
      }
      textarea { min-height: 120px; resize: vertical; }
      .form-note { font-size: 13px; color: var(--text-secondary); line-height: 1.6; }
      .message-box {
        padding: 13px 15px;
        border-radius: var(--radius-md);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        color: var(--text-secondary);
        overflow-wrap: anywhere;
        font-size: 14px;
        line-height: 1.6;
      }
      .message-box.success { background: var(--success-soft); color: var(--success); border-color: transparent; }
      .message-box.error { background: var(--danger-soft); color: var(--danger); border-color: transparent; }
      .table-wrap { width: 100%; overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { width: 100%; min-width: 720px; border-collapse: collapse; }
      th, td {
        padding: 13px 12px;
        text-align: left;
        border-bottom: 1px solid var(--border);
        vertical-align: top;
        font-size: 14px;
      }
      th { color: var(--text-secondary); font-weight: 600; white-space: nowrap; font-size: 12px; letter-spacing: 0.03em; }
      td { overflow-wrap: anywhere; }
      tbody tr { transition: background 160ms ease; }
      tbody tr:hover { background: var(--bg-elevated); }
      .badge {
        display: inline-flex;
        padding: 5px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
      }
      .badge.queued { background: var(--accent-soft); color: var(--accent); }
      .badge.retrying { background: var(--warning-soft); color: var(--warning); }
      .badge.delivered { background: var(--success-soft); color: var(--success); }
      .badge.failed { background: var(--danger-soft); color: var(--danger); }
      .tiny { font-size: 13px; color: var(--text-secondary); }
      code {
        font-family: ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace;
        background: var(--bg-elevated);
        border-radius: 7px;
        padding: 2px 6px;
        font-size: 0.92em;
      }
      @media (max-width: 1100px) {
        .grid { grid-template-columns: 1fr; }
      }
      @media (max-width: 860px) {
        .shell { grid-template-columns: 1fr; }
        .sidebar {
          position: static;
          height: auto;
          flex-direction: row;
          align-items: center;
          overflow-x: auto;
          border-right: 0;
          border-bottom: 1px solid var(--border);
        }
        .brand { padding: 0 8px 0 0; }
        .brand-sub { display: none; }
        .nav { flex-direction: row; }
        .nav-label { display: none; }
        .nav-item { white-space: nowrap; }
        .sidebar-footer { margin-top: 0; flex-direction: row; align-items: center; }
        .theme-switch { flex: 0 0 auto; }
      }
      @media (max-width: 640px) {
        .content { padding: 16px; }
        .grid { gap: 14px; }
        .metrics { grid-template-columns: 1fr; }
      }
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { transition: none !important; }
        button:active, a.button:active { transform: none; }
      }
      @media (prefers-reduced-transparency: reduce) {
        .sidebar, .card { backdrop-filter: none; -webkit-backdrop-filter: none; }
      }`;

export const renderAdminShell = (input: AdminShellInput): string => {
  const escapedAdminPath = escapeHtml(input.adminPath);
  const escapedTitle = escapeHtml(input.title);

  const sectionHrefs: Record<AdminSection, string> = {
    dashboard: `/${escapedAdminPath}/dashboard`,
    send: `/${escapedAdminPath}/send`,
    qrcode: `/${escapedAdminPath}/bot/login/qrcode/page`,
    deliveries: `/${escapedAdminPath}/deliveries/page`
  };

  const navItems = NAV_ITEMS.map((item) => {
    const activeClass = item.key === input.active ? " active" : "";
    return `<a class="nav-item${activeClass}" href="${sectionHrefs[item.key]}"><span class="glyph">${item.glyph}</span>${item.label}</a>`;
  }).join("");

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedTitle}</title>
    <script>${THEME_BOOTSTRAP_SCRIPT}</script>
    <style>${SHELL_CSS}</style>
  </head>
  <body>
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-mark">C</div>
          <div>
            <div class="brand-title">ClawNotifier</div>
            <div class="brand-sub">WeChat Notifier</div>
          </div>
        </div>
        <nav class="nav" aria-label="后台导航">
          <div class="nav-label">菜单</div>
          ${navItems}
        </nav>
        <div class="sidebar-footer">
          <div class="theme-switch" role="group" aria-label="主题切换">
            <button type="button" data-theme-value="light">浅色</button>
            <button type="button" data-theme-value="dark">深色</button>
            <button type="button" data-theme-value="auto">自动</button>
          </div>
          <a class="sidebar-logout" href="/${escapedAdminPath}/logout">⎋ 退出登录</a>
        </div>
      </aside>
      <main class="content">
        ${input.content}
      </main>
    </div>
    <script>${THEME_TOGGLE_SCRIPT}</script>
  </body>
</html>`;
};
