import { renderAdminShell } from "./admin-shell";

export const renderSendTestPage = (input: { adminPath: string }): string => {
  const content = `
        <div class="content-head">
          <h1>发送测试</h1>
        </div>

        <section class="card section">
          <div class="form-grid">
            <label>
              文本内容
              <textarea id="send-text" placeholder="输入一条测试消息，例如：Cloudflare deploy succeeded."></textarea>
            </label>
            <label>
              幂等键（可选）
              <input id="send-dedupe" placeholder="例如 deploy-20260924-1" />
            </label>
            <div class="section-actions">
              <button id="send-btn">发送测试消息</button>
            </div>
            <div class="form-note">bot 未激活时请先在总览激活。</div>
            <div class="message-box" id="send-message" aria-live="polite">等待发送操作。</div>
          </div>
        </section>

    <script>
      const sendText = document.getElementById("send-text");
      const sendDedupe = document.getElementById("send-dedupe");
      const sendMessage = document.getElementById("send-message");
      const sendBtn = document.getElementById("send-btn");

      sendBtn.addEventListener("click", async () => {
        const text = sendText.value.trim();
        if (!text) {
          sendMessage.className = "message-box error";
          sendMessage.textContent = "请先输入要发送的文本内容。";
          return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = "提交中...";
        sendMessage.className = "message-box";
        sendMessage.textContent = "正在发送...";

        try {
          const response = await fetch("/api/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, dedupeKey: sendDedupe.value.trim() || undefined })
          });
          const payload = await response.json();
          if (!response.ok) throw new Error(payload.message || "未知错误");
          sendMessage.className = "message-box " + (payload.data.status === "failed" ? "error" : "success");
          sendMessage.textContent = "deliveryId=" + payload.data.deliveryId + "，状态=" + payload.data.status
            + (payload.data.error ? "，原因=" + payload.data.error : "");
          sendText.value = "";
        } catch (error) {
          sendMessage.className = "message-box error";
          sendMessage.textContent = "发送失败：" + (error instanceof Error ? error.message : "网络请求失败");
        } finally {
          sendBtn.disabled = false;
          sendBtn.textContent = "发送测试消息";
        }
      });
    </script>`;

  return renderAdminShell({
    adminPath: input.adminPath,
    title: "发送测试 · ClawNotifier",
    active: "send",
    content
  });
};
