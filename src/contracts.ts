export type BotStatus = "not_logged_in" | "logged_in" | "needs_activation" | "ready" | "needs_login" | "error";
export type LoginSessionStatus = "wait" | "scanned" | "confirmed" | "expired";
export type DeliveryStatus = "queued" | "retrying" | "delivered" | "failed";

export interface BotState {
  botId: string;
  botToken: string;
  ilinkUserId: string;
  contextToken: string | null;
  getUpdatesBuf: string | null;
  status: Exclude<BotStatus, "not_logged_in">;
  lastError: string | null;
  updatedAt: string;
}

export interface BotStatusView {
  status: BotStatus;
  botId: string | null;
  updatedAt: string | null;
  lastError: string | null;
}

export interface LoginSession {
  sessionId: string;
  qrcodeToken: string;
  qrcodeImgContent: string;
  status: LoginSessionStatus;
  expiresAt: string;
  botId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DeliveryLog {
  deliveryId: string;
  source: string;
  traceId: string | null;
  dedupeKey: string | null;
  idempotencyKey: string | null;
  text: string;
  meta: Record<string, unknown> | null;
  status: DeliveryStatus;
  attempts: number;
  error: string | null;
  responseCode: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomingMessagePayload {
  text: string;
  traceId?: string;
  dedupeKey?: string;
  meta?: Record<string, unknown>;
}

export interface LoginQrcodeResponse {
  sessionId: string;
  qrcode: string;
  qrcodeImgContent: string;
  expiresAt: string;
}

export interface LoginStatusResponse {
  sessionId: string;
  status: LoginSessionStatus;
  botId: string | null;
  expiresAt: string;
}

export interface ActivateBotResponse {
  status: BotStatus;
  botId: string | null;
  updatedAt: string | null;
  message: string;
}

export interface SendDeliveryResult {
  deliveryId: string;
  duplicate: boolean;
  status: DeliveryStatus;
  error?: string | null;
  responseCode?: number | null;
}

export interface DeliveryListQuery {
  limit: number;
  page: number;
  status?: DeliveryStatus;
  source?: string;
}

export interface DeliveryListResult {
  items: DeliveryLog[];
  limit: number;
  page: number;
  total: number;
  totalPages: number;
  status?: DeliveryStatus;
  source?: string;
}

export interface ReplayDeliveryResult {
  deliveryId: string;
  status: DeliveryStatus;
  replayed: boolean;
  error?: string | null;
}

export interface ReplayDeliveriesResult {
  items: ReplayDeliveryResult[];
}

export interface DeleteDeliveriesResult {
  selected: number;
  deleted: number;
  skipped: number;
}

export interface ReplayFailedRetMinusTwoResult {
  items: ReplayDeliveryResult[];
  limit: number;
  source?: string;
}

export interface KeepaliveConfig {
  enabled: boolean;
  source: string;
  intervalHours: number;
  text: string;
}

export interface ScheduledKeepaliveResult {
  sent: boolean;
  reason: "disabled" | "not_due" | "sent" | "duplicate";
  deliveryId: string | null;
  lastDeliveryId: string | null;
  lastCreatedAt: string | null;
  nextDueAt: string | null;
}

export interface HealthResponse {
  service: string;
  timestamp: string;
  database: "ok" | "error";
  botStatus: BotStatus;
}

export interface AdminService {
  createLoginQrcode(): Promise<LoginQrcodeResponse>;
  getLoginStatus(sessionId: string): Promise<LoginStatusResponse>;
  activateBot(): Promise<ActivateBotResponse>;
  getBotStatus(): Promise<BotStatusView>;
}

export interface DeliveryService {
  sendDelivery(source: string, payload: IncomingMessagePayload): Promise<SendDeliveryResult>;
  listDeliveries(query: DeliveryListQuery): Promise<DeliveryListResult>;
  getDelivery(deliveryId: string): Promise<DeliveryLog | null>;
  replayDelivery(deliveryId: string): Promise<ReplayDeliveryResult>;
  replayDeliveries(deliveryIds: string[]): Promise<ReplayDeliveriesResult>;
  deleteCompletedDeliveries(deliveryIds: string[]): Promise<DeleteDeliveriesResult>;
  replayFailedRetMinusTwo(query: { limit: number; source?: string }): Promise<ReplayFailedRetMinusTwoResult>;
  sendKeepaliveIfDue(config: KeepaliveConfig, now?: Date): Promise<ScheduledKeepaliveResult>;
}

export interface HealthService {
  probe(): Promise<HealthResponse>;
}

export interface RuntimeConfig {
  adminPath: string;
  adminUsername: string;
  adminToken: string;
  webhookSharedToken: string;
  keepalive: KeepaliveConfig;
}

export interface AppServices {
  admin: AdminService;
  delivery: DeliveryService;
  health: HealthService;
}

export interface AppContext {
  config: RuntimeConfig;
  services: AppServices;
}
