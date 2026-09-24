import { THEME_BOOTSTRAP_SCRIPT, THEME_TOGGLE_SCRIPT } from "./admin-shell";

const escapeHtml = (input: string): string =>
  input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");

export const renderLoginPage = (input: {
  adminPath: string;
  error: string | null;
  next: string;
}): string => {
  const escapedAdminPath = escapeHtml(input.adminPath);
  const escapedNext = escapeHtml(input.next);
  const escapedError = input.error ? escapeHtml(input.error) : null;

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script>${THEME_BOOTSTRAP_SCRIPT}</script>
    <title>ClawNotifier 登录</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f5f5f7;
        --card: rgba(255, 255, 255, 0.94);
        --line: rgba(0, 0, 0, 0.10);
        --text: #1d1d1f;
        --muted: #6e6e73;
        --accent: #0a84ff;
        --accent-soft: rgba(10, 132, 255, 0.12);
        --danger-soft: rgba(255, 59, 48, 0.14);
        --danger: #ff3b30;
        --glow1: #eafaf6;
        --glow2: #ecf1ff;
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.12);
      }
      :root[data-theme="dark"] {
        color-scheme: dark;
        --bg: #000000;
        --card: rgba(28, 28, 30, 0.94);
        --line: rgba(255, 255, 255, 0.12);
        --text: #f5f5f7;
        --muted: #98989d;
        --accent: #0a84ff;
        --accent-soft: rgba(10, 132, 255, 0.22);
        --danger-soft: rgba(255, 69, 58, 0.18);
        --danger: #ff453a;
        --glow1: #0d2a3a;
        --glow2: #1a1a3a;
        --shadow: 0 24px 80px rgba(0, 0, 0, 0.55);
      }
      * { box-sizing: border-box; }
      html { overflow-x: hidden; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 16px;
        font-family: "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, var(--glow1) 0%, transparent 34%),
          radial-gradient(circle at top right, var(--glow2) 0%, transparent 30%),
          var(--bg);
      }
      .card {
        width: min(420px, 100%);
        background: var(--card);
        border: 1px solid rgba(214, 223, 235, 0.9);
        border-radius: 24px;
        box-shadow: var(--shadow);
        padding: clamp(24px, 5vw, 36px);
      }
      h1 {
        margin: 0 0 8px;
        font-size: 26px;
        line-height: 1.2;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.7;
        overflow-wrap: anywhere;
      }
      form {
        margin-top: 22px;
        display: grid;
        gap: 14px;
      }
      label {
        display: grid;
        gap: 8px;
        font-size: 13px;
        color: var(--muted);
        font-weight: 700;
      }
      input {
        width: 100%;
        border: 1px solid var(--line);
        border-radius: 16px;
        padding: 12px 14px;
        background: var(--card);
        color: var(--text);
        font: inherit;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 13px 18px;
        min-height: 48px;
        background: var(--text);
        color: #fff;
        cursor: pointer;
        font-weight: 700;
        font-size: 15px;
        transition: transform 160ms ease, box-shadow 160ms ease;
      }
      button:hover:not(:disabled) {
        box-shadow: 0 10px 22px rgba(22, 32, 47, 0.14);
        transform: translateY(-1px);
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.58;
      }
      .error {
        margin-top: 16px;
        padding: 12px 14px;
        border-radius: 14px;
        background: var(--danger-soft);
        color: var(--danger);
        border: 1px solid var(--line);
        font-size: 14px;
        overflow-wrap: anywhere;
      }
      .theme-switch {
        position: fixed;
        top: 16px;
        right: 16px;
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 2px;
        padding: 3px;
        border-radius: 10px;
        background: var(--card);
        border: 1px solid var(--line);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
      }
      .theme-switch button {
        border: 0;
        background: transparent;
        color: var(--muted);
        font: inherit;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 8px;
        border-radius: 8px;
        cursor: pointer;
      }
      .theme-switch button.active { background: var(--text); color: var(--bg); }
      input:focus-visible,
      button:focus-visible {
        outline: 3px solid rgba(15, 118, 110, 0.28);
        outline-offset: 2px;
      }
      @media (prefers-reduced-motion: reduce) {
        button:hover:not(:disabled) {
          transform: none;
        }
      }
    </style>
  </head>
  <body>
    <div class="theme-switch" role="group" aria-label="主题切换">
      <button type="button" data-theme-value="light">浅色</button>
      <button type="button" data-theme-value="dark">深色</button>
      <button type="button" data-theme-value="auto">自动</button>
    </div>
    <main class="card">
      <h1>ClawNotifier</h1>

      <form id="login-form" autocomplete="on">
        <label>
          用户名
          <input id="username" name="username" type="text" value="whoami" autocomplete="username" required />
        </label>
        <label>
          密码
          <input id="password" name="password" type="password" autocomplete="current-password" required />
        </label>
        <button id="submit-btn" type="submit">登录</button>
      </form>
      ${escapedError ? `<div class="error" role="alert">${escapedError}</div>` : ""}
    </main>

    <script>
      const adminPath = ${JSON.stringify(input.adminPath)};
      const next = ${JSON.stringify(input.next)};
      const form = document.getElementById("login-form");
      const submitBtn = document.getElementById("submit-btn");
      const usernameInput = document.getElementById("username");
      const passwordInput = document.getElementById("password");

      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        submitBtn.disabled = true;
        submitBtn.textContent = "登录中...";

        try {
          const response = await fetch("/" + adminPath + "/login", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              username: usernameInput.value.trim(),
              password: passwordInput.value,
              next
            })
          });

          const payload = await response.json().catch(() => ({}));
          if (!response.ok) {
            const box = document.querySelector(".error");
            const message = payload.message || "用户名或密码错误。";
            if (box) {
              box.textContent = message;
            } else {
              const errorBox = document.createElement("div");
              errorBox.className = "error";
              errorBox.setAttribute("role", "alert");
              errorBox.textContent = message;
              form.after(errorBox);
            }
            passwordInput.value = "";
            passwordInput.focus();
            return;
          }

          window.location.href = payload.next || ("/" + adminPath + "/dashboard");
        } catch (error) {
          const box = document.querySelector(".error");
          const message = error instanceof Error ? error.message : "网络请求失败";
          if (box) {
            box.textContent = message;
          } else {
            const errorBox = document.createElement("div");
            errorBox.className = "error";
            errorBox.setAttribute("role", "alert");
            errorBox.textContent = message;
            form.after(errorBox);
          }
        } finally {
          submitBtn.disabled = false;
          submitBtn.textContent = "登录";
        }
      });
    </script>
    <script>${THEME_TOGGLE_SCRIPT}</script>
  </body>
</html>`;
};
