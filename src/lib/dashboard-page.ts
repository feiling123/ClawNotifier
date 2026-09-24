import { escapeHtml, renderAdminShell } from "./admin-shell";

export const renderDashboardPage = (input: {
  adminPath: string;
  refreshSeconds: number;
  logsLimit: number;
}): string => {
  const content = `
        <div class="content-head">
          <h1>总览</h1>
        </div>

        <div class="stack">
          <section class="card section">
            <div class="section-head">
              <div>
                <h2>Bot 状态</h2>
              </div>
              <div class="section-actions">
                <button class="secondary" id="refresh-status-btn">刷新</button>
                <button id="activate-btn">激活</button>
              </div>
            </div>

            <div class="metrics">
              <div class="metric">
                <strong>状态</strong>
                <span id="bot-status-value">-</span>
              </div>
              <div class="metric">
                <strong>Bot ID</strong>
                <span id="bot-id-value">-</span>
              </div>
              <div class="metric">
                <strong>更新时间</strong>
                <span id="bot-updated-value">-</span>
              </div>
              <div class="metric">
                <strong>自动刷新</strong>
                <span>${input.refreshSeconds} 秒</span>
              </div>
            </div>

            <div style="height:14px"></div>
            <div class="status-banner" id="bot-banner" aria-live="polite">
              <strong id="bot-banner-title">状态</strong>
              <div id="bot-banner-text">读取中...</div>
            </div>
          </section>

          <section class="card section">
            <div class="section-head">
              <div>
                <h2>最近投递</h2>
              </div>
              <div class="section-actions">
                <button class="secondary" id="refresh-logs-btn">刷新</button>
                <a class="button secondary" href="/${escapeHtml(input.adminPath)}/deliveries/page">查看全部</a>
              </div>
            </div>

            <div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>状态</th>
                    <th>Source</th>
                    <th>内容</th>
                    <th>尝试</th>
                    <th>响应</th>
                  </tr>
                </thead>
                <tbody id="recent-log-body" aria-live="polite">
                  <tr><td colspan="6" class="tiny">读取中...</td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

    <script>
      const adminPath = ${JSON.stringify(input.adminPath)};
      const refreshSeconds = ${JSON.stringify(input.refreshSeconds)};
      const logsLimit = ${JSON.stringify(input.logsLimit)};

      const botStatusValue = document.getElementById("bot-status-value");
      const botIdValue = document.getElementById("bot-id-value");
      const botUpdatedValue = document.getElementById("bot-updated-value");
      const botBanner = document.getElementById("bot-banner");
      const botBannerTitle = document.getElementById("bot-banner-title");
      const botBannerText = document.getElementById("bot-banner-text");
      const recentLogBody = document.getElementById("recent-log-body");
      const activateBtn = document.getElementById("activate-btn");

      const escapeHtml = (value) =>
        value
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#39;");

      const setBanner = (title, text, tone) => {
        botBanner.className = "status-banner " + (tone || "");
        botBannerTitle.textContent = title;
        botBannerText.textContent = text;
      };

      const statusHint = (status, lastError) => {
        if (status === "ready") {
          return { tone: "success", title: "已就绪", text: "可以发送消息。" };
        }
        if (status === "not_logged_in") {
          return { tone: "warning", title: "未登录", text: "请先扫码登录。" };
        }
        if (status === "logged_in" || status === "needs_activation") {
          return { tone: "warning", title: "待激活", text: lastError || "请先给 ClawBot 发一条消息，再点击激活。" };
        }
        if (status === "needs_login") {
          return { tone: "error", title: "需重新登录", text: lastError || "登录态已失效。" };
        }
        return { tone: "error", title: "异常", text: lastError || "请检查最近投递记录。" };
      };

      const badgeClass = (status) => {
        if (status === "queued" || status === "retrying" || status === "delivered" || status === "failed") {
          return status;
        }
        return "queued";
      };

      const loadBotStatus = async () => {
        try {
          const response = await fetch("/" + adminPath + "/bot/status");
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "读取失败");
          const data = payload.data;
          botStatusValue.textContent = data.status || "-";
          botIdValue.textContent = data.botId || "-";
          botUpdatedValue.textContent = data.updatedAt || "-";
          const hint = statusHint(data.status, data.lastError);
          setBanner(hint.title, hint.text, hint.tone);
        } catch (error) {
          setBanner("读取失败", error instanceof Error ? error.message : "网络请求失败", "error");
        }
      };

      const loadRecentLogs = async () => {
        try {
          const response = await fetch("/" + adminPath + "/deliveries?limit=" + encodeURIComponent(String(logsLimit)));
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "未知错误");
          const items = payload.data.items || [];
          if (!items.length) {
            recentLogBody.innerHTML = '<tr><td colspan="6" class="tiny">暂无记录。</td></tr>';
            return;
          }
          recentLogBody.innerHTML = items
            .map((item) => {
              const preview = item.text.length > 90 ? item.text.slice(0, 90) + "..." : item.text;
              return '<tr>'
                + '<td><div>' + escapeHtml(item.createdAt) + '</div><div class="tiny"><code>' + escapeHtml(item.deliveryId) + '</code></div></td>'
                + '<td><span class="badge ' + badgeClass(item.status) + '">' + escapeHtml(item.status) + '</span></td>'
                + '<td>' + escapeHtml(item.source) + '</td>'
                + '<td>' + escapeHtml(preview) + '</td>'
                + '<td>' + escapeHtml(String(item.attempts)) + '</td>'
                + '<td>' + escapeHtml(String(item.responseCode ?? "-")) + '</td>'
                + '</tr>';
            })
            .join("");
        } catch (error) {
          recentLogBody.innerHTML = '<tr><td colspan="6" class="tiny">读取失败：'
            + escapeHtml(error instanceof Error ? error.message : "网络请求失败") + '</td></tr>';
        }
      };

      const activateBot = async () => {
        activateBtn.disabled = true;
        activateBtn.textContent = "激活中...";
        try {
          const response = await fetch("/" + adminPath + "/bot/activate", { method: "POST" });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "未知错误");
          setBanner("激活结果", payload.data.message, payload.data.status === "ready" ? "success" : "warning");
          await loadBotStatus();
        } catch (error) {
          const message = error instanceof Error ? error.message : "网络请求失败";
          setBanner("激活失败", message, "error");
        } finally {
          activateBtn.disabled = false;
          activateBtn.textContent = "激活";
        }
      };

      document.getElementById("refresh-status-btn").addEventListener("click", loadBotStatus);
      document.getElementById("refresh-logs-btn").addEventListener("click", loadRecentLogs);
      activateBtn.addEventListener("click", activateBot);

      const scheduleRefresh = () => window.setTimeout(async () => {
        await Promise.all([loadBotStatus(), loadRecentLogs()]);
        scheduleRefresh();
      }, refreshSeconds * 1000);

      loadBotStatus();
      loadRecentLogs();
      if (refreshSeconds > 0) scheduleRefresh();
    </script>`;

  return renderAdminShell({
    adminPath: input.adminPath,
    title: "总览 · ClawNotifier",
    active: "dashboard",
    content
  });
};
