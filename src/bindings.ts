export interface CloudflareBindings {
  DB: D1Database;
  ADMIN_PATH?: string;
  ADMIN_USERNAME?: string;
  ADMIN_TOKEN?: string;
  WEBHOOK_SHARED_TOKEN?: string;
  BOT_STATE_ENC_KEY?: string;
  ILINK_BASE_URL?: string;
  KEEPALIVE_ENABLED?: string;
  KEEPALIVE_INTERVAL_HOURS?: string;
  KEEPALIVE_TEXT?: string;
}
