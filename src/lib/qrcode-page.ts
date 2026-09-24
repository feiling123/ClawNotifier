import { escapeHtml, renderAdminShell } from "./admin-shell";

export const renderQrcodeLoginPage = (input: {
  sessionId: string;
  expiresAt: string;
  svgMarkup: string;
  adminPath: string;
}): string => {
  const content = `
        <div class="content-head">
          <h1>扫码登录</h1>
        </div>

        <section class="card" style="overflow:hidden;">
          <div class="qr-shell">
            <div class="qr-panel">${input.svgMarkup}</div>
            <div class="qr-info">
              <div class="qr-meta">
                <div><strong>Session ID</strong><code class="break">${escapeHtml(input.sessionId)}</code></div>
                <div><strong>过期时间</strong><code class="break">${escapeHtml(input.expiresAt)}</code></div>
              </div>
              <div class="status" id="status-box" aria-live="polite">当前状态：等待扫码</div>
              <div class="section-actions" style="margin-top:16px;">
                <button id="activate-btn" disabled>确认后激活</button>
                <a class="button secondary" href="/${escapeHtml(input.adminPath)}/dashboard">返回总览</a>
              </div>
              <p class="hint" id="hint-box">无法激活时，请先给 ClawBot 发一条消息。</p>
            </div>
          </div>
        </section>

    <style>
      .qr-shell {
        display: grid;
        grid-template-columns: minmax(280px, 380px) minmax(0, 1fr);
      }
      .qr-panel {
        display: grid;
        place-items: center;
        padding: clamp(24px, 4vw, 36px);
        background: #ffffff;
        border-right: 1px solid var(--border);
      }
      .qr-panel svg {
        display: block;
        width: min(300px, 100%);
        height: auto;
      }
      .qr-info {
        padding: clamp(22px, 4vw, 32px);
        min-width: 0;
      }
      .qr-meta {
        display: grid;
        gap: 10px;
        margin-bottom: 20px;
      }
      .qr-meta > div {
        padding: 13px 15px;
        border-radius: var(--radius-md);
        background: var(--bg-elevated);
        border: 1px solid var(--border);
        font-size: 14px;
        min-width: 0;
        overflow-wrap: anywhere;
      }
      .qr-meta strong {
        display: block;
        margin-bottom: 6px;
        font-size: 12px;
        color: var(--text-secondary);
        font-weight: 600;
      }
      code.break {
        display: block;
        overflow-wrap: anywhere;
        white-space: normal;
        padding: 0;
        background: transparent;
      }
      .status {
        padding: 15px 17px;
        border-radius: var(--radius-md);
        background: var(--accent-soft);
        color: var(--accent);
        font-weight: 600;
        overflow-wrap: anywhere;
        font-size: 14px;
      }
      .hint {
        margin-top: 18px;
        font-size: 13px;
        color: var(--text-secondary);
        line-height: 1.65;
      }
      @media (max-width: 860px) {
        .qr-shell { grid-template-columns: 1fr; }
        .qr-panel { border-right: 0; border-bottom: 1px solid var(--border); }
      }
    </style>

    <script>
      const adminPath = ${JSON.stringify(input.adminPath)};
      const sessionId = ${JSON.stringify(input.sessionId)};
      const statusBox = document.getElementById("status-box");
      const hintBox = document.getElementById("hint-box");
      const activateBtn = document.getElementById("activate-btn");
      let polling = true;
      let loggedIn = false;

      const setStatus = (text, tone) => {
        statusBox.textContent = text;
        statusBox.style.background = tone === "error" ? "var(--danger-soft)" : tone === "success" ? "var(--success-soft)" : "var(--accent-soft)";
        statusBox.style.color = tone === "error" ? "var(--danger)" : tone === "success" ? "var(--success)" : "var(--accent)";
      };

      const fetchStatus = async () => {
        if (!polling) return;
        try {
          const response = await fetch("/" + adminPath + "/bot/login/status/" + encodeURIComponent(sessionId));
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "未知错误");

          const status = payload.data.status;
          if (status === "wait") setStatus("当前状态：等待扫码", "info");
          if (status === "scanned") setStatus("当前状态：已扫码，请在手机上确认", "info");
          if (status === "expired") {
            setStatus("当前状态：二维码已过期，请刷新页面重新获取。", "error");
            polling = false;
          }
          if (status === "confirmed") {
            loggedIn = true;
            activateBtn.disabled = false;
            setStatus("当前状态：登录已确认，可以继续激活。", "success");
            hintBox.textContent = "下一步：先给“微信ClawBot”发一条消息，然后点击“确认后激活”。";
            polling = false;
          }
        } catch (error) {
          setStatus("状态查询失败：" + (error instanceof Error ? error.message : "网络请求失败"), "error");
        } finally {
          if (polling) window.setTimeout(fetchStatus, 2000);
        }
      };

      activateBtn.addEventListener("click", async () => {
        activateBtn.disabled = true;
        activateBtn.textContent = "激活中...";
        setStatus("正在尝试激活...", "info");
        try {
          const response = await fetch("/" + adminPath + "/bot/activate", { method: "POST" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "未知错误");
          const result = payload.data;
          if (result.status === "ready") {
            setStatus("激活成功：bot 已就绪，可以开始发信。", "success");
            hintBox.textContent = "现在可以调用 /webhook/:source 或 /api/send 进行发送测试。";
            activateBtn.textContent = "已激活";
            return;
          }
          setStatus("激活未完成：" + result.message, "error");
          hintBox.textContent = result.message;
        } catch (error) {
          setStatus("激活失败：" + (error instanceof Error ? error.message : "网络请求失败"), "error");
        } finally {
          if (activateBtn.textContent !== "已激活") {
            activateBtn.disabled = !loggedIn;
            activateBtn.textContent = "确认后激活";
          }
        }
      });

      fetchStatus();
    </script>`;

  return renderAdminShell({
    adminPath: input.adminPath,
    title: "扫码登录 · ClawNotifier",
    active: "qrcode",
    content
  });
};
