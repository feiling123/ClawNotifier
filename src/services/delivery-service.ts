import type {
  DeleteDeliveriesResult,
  DeliveryListQuery,
  DeliveryListResult,
  DeliveryLog,
  DeliveryStatus,
  IncomingMessagePayload,
  KeepaliveConfig,
  ReplayDeliveryResult,
  ReplayDeliveriesResult,
  ReplayFailedRetMinusTwoResult,
  ScheduledKeepaliveResult,
  SendDeliveryResult
} from "../contracts";
import { IlinkClient } from "../ilink/client";
import { AppError, isIlinkApiError, IlinkApiError, toErrorMessage } from "../lib/errors";
import { createTraceId } from "../lib/id";
import { BotStateRepository } from "../storage/bot-state-repository";
import { DeliveryLogRepository } from "../storage/delivery-log-repository";

const MS_PER_HOUR = 60 * 60 * 1000;
const REPLAYABLE_STATUS_MESSAGE = "仅支持重发 failed 状态的投递记录。";
const MAX_SEND_ATTEMPTS = 3;
const RETRY_DELAYS_MS = [2000, 4000];

interface DispatchResult {
  status: DeliveryStatus;
  error: string | null;
  responseCode: number | null;
}

const defaultSleep = async (ms: number): Promise<void> => {
  const schedulerGlobal = (globalThis as { scheduler?: { wait?: (ms: number) => Promise<void> } }).scheduler;
  if (schedulerGlobal?.wait) {
    await schedulerGlobal.wait(ms);
    return;
  }

  await new Promise((resolve) => setTimeout(resolve, ms));
};

export class DefaultDeliveryService {
  public constructor(
    private readonly deliveryLogRepository: DeliveryLogRepository,
    private readonly botRepository: BotStateRepository,
    private readonly ilinkClient: IlinkClient,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep
  ) {}

  public async sendDelivery(source: string, payload: IncomingMessagePayload): Promise<SendDeliveryResult> {
    const created = await this.deliveryLogRepository.createQueued({
      source,
      traceId: payload.traceId ?? createTraceId(),
      dedupeKey: payload.dedupeKey ?? null,
      text: payload.text,
      meta: payload.meta ?? null
    });

    if (created.duplicate) {
      return {
        deliveryId: created.delivery.deliveryId,
        duplicate: true,
        status: created.delivery.status,
        error: created.delivery.error,
        responseCode: created.delivery.responseCode
      };
    }

    const result = await this.dispatchDelivery(created.delivery);

    return {
      deliveryId: created.delivery.deliveryId,
      duplicate: false,
      status: result.status,
      error: result.error,
      responseCode: result.responseCode
    };
  }

  public async listDeliveries(query: DeliveryListQuery): Promise<DeliveryListResult> {
    const total = await this.deliveryLogRepository.count(query);
    const totalPages = Math.max(1, Math.ceil(total / query.limit));
    const page = Math.min(Math.max(query.page, 1), totalPages);
    const items = await this.deliveryLogRepository.list({ ...query, page });
    return {
      items,
      limit: query.limit,
      page,
      total,
      totalPages,
      status: query.status,
      source: query.source
    };
  }

  public async getDelivery(deliveryId: string): Promise<DeliveryLog | null> {
    return this.deliveryLogRepository.getById(deliveryId);
  }

  public async replayDelivery(deliveryId: string): Promise<ReplayDeliveryResult> {
    const delivery = await this.deliveryLogRepository.getById(deliveryId);
    if (!delivery) {
      throw new AppError(404, "delivery_not_found", "未找到对应的投递记录。");
    }

    return this.replayFailedDelivery(delivery);
  }

  public async replayDeliveries(deliveryIds: string[]): Promise<ReplayDeliveriesResult> {
    const items: ReplayDeliveryResult[] = [];

    for (const deliveryId of deliveryIds) {
      const delivery = await this.deliveryLogRepository.getById(deliveryId);
      if (!delivery) {
        items.push({
          deliveryId,
          status: "failed",
          replayed: false,
          error: "未找到对应的投递记录。"
        });
        continue;
      }

      if (delivery.status !== "failed") {
        items.push({
          deliveryId,
          status: delivery.status,
          replayed: false,
          error: REPLAYABLE_STATUS_MESSAGE
        });
        continue;
      }

      try {
        items.push(await this.replayFailedDelivery(delivery));
      } catch (error) {
        items.push({
          deliveryId,
          status: "failed",
          replayed: false,
          error: toErrorMessage(error)
        });
      }
    }

    return { items };
  }

  public async deleteCompletedDeliveries(deliveryIds: string[]): Promise<DeleteDeliveriesResult> {
    const deleted = await this.deliveryLogRepository.deleteCompletedByIds(deliveryIds);
    return {
      selected: deliveryIds.length,
      deleted,
      skipped: deliveryIds.length - deleted
    };
  }

  public async replayFailedRetMinusTwo(query: { limit: number; source?: string }): Promise<ReplayFailedRetMinusTwoResult> {
    const deliveries = await this.deliveryLogRepository.listFailedRetMinusTwo(query);
    const items: ReplayDeliveryResult[] = [];

    for (const delivery of deliveries) {
      try {
        items.push(await this.replayFailedDelivery(delivery));
      } catch (error) {
        const message = toErrorMessage(error);
        await this.deliveryLogRepository.markFailed(delivery.deliveryId, 0, message, null);
        items.push({
          deliveryId: delivery.deliveryId,
          status: "failed",
          replayed: false,
          error: message
        });
      }
    }

    return {
      items,
      limit: query.limit,
      source: query.source
    };
  }

  public async sendKeepaliveIfDue(config: KeepaliveConfig, now = new Date()): Promise<ScheduledKeepaliveResult> {
    if (!config.enabled) {
      return {
        sent: false,
        reason: "disabled",
        deliveryId: null,
        lastDeliveryId: null,
        lastCreatedAt: null,
        nextDueAt: null
      };
    }

    const latest = (await this.listDeliveries({ limit: 1, page: 1, source: config.source })).items[0] ?? null;
    const intervalMs = config.intervalHours * MS_PER_HOUR;
    const nextDueAt = latest ? new Date(new Date(latest.createdAt).getTime() + intervalMs) : null;

    if (nextDueAt && nextDueAt.getTime() > now.getTime()) {
      return {
        sent: false,
        reason: "not_due",
        deliveryId: null,
        lastDeliveryId: latest.deliveryId,
        lastCreatedAt: latest.createdAt,
        nextDueAt: nextDueAt.toISOString()
      };
    }

    const intervalBucket = Math.floor(now.getTime() / intervalMs);
    const result = await this.sendDelivery(config.source, {
      text: config.text,
      traceId: `keepalive-${intervalBucket}`,
      dedupeKey: `interval-${intervalBucket}`,
      meta: {
        kind: "keepalive",
        intervalHours: config.intervalHours,
        scheduledAt: now.toISOString()
      }
    });

    return {
      sent: !result.duplicate,
      reason: result.duplicate ? "duplicate" : "sent",
      deliveryId: result.deliveryId,
      lastDeliveryId: latest?.deliveryId ?? null,
      lastCreatedAt: latest?.createdAt ?? null,
      nextDueAt: new Date(now.getTime() + intervalMs).toISOString()
    };
  }

  private async replayFailedDelivery(delivery: DeliveryLog): Promise<ReplayDeliveryResult> {
    if (delivery.status !== "failed") {
      throw new AppError(409, "delivery_not_replayable", REPLAYABLE_STATUS_MESSAGE, {
        status: delivery.status,
        error: delivery.error
      });
    }

    await this.deliveryLogRepository.markQueuedForReplay(delivery.deliveryId);
    const result = await this.dispatchDelivery(delivery);

    return {
      deliveryId: delivery.deliveryId,
      status: result.status,
      replayed: result.status !== "failed",
      error: result.error
    };
  }

  private async handleBotErrorState(error: IlinkApiError, message: string): Promise<void> {
    if (error.category === "unauthorized") {
      await this.botRepository.updateStatus("needs_login", message);
    } else if (error.category === "context") {
      await this.botRepository.updateStatus("needs_activation", message);
    } else {
      await this.botRepository.setLastError(message);
    }
  }

  private async dispatchDelivery(delivery: DeliveryLog): Promise<DispatchResult> {
    const bot = await this.botRepository.getCurrent();
    if (!bot) {
      const message = "未找到已登录 bot，请重新登录。";
      await this.deliveryLogRepository.markFailed(delivery.deliveryId, 0, message, null);
      return {
        status: "failed",
        error: message,
        responseCode: null
      };
    }

    if (!bot.contextToken || bot.status === "logged_in" || bot.status === "needs_activation") {
      const message = "bot 尚未激活，请先在后台完成激活。";
      await this.botRepository.updateStatus("needs_activation", message);
      await this.deliveryLogRepository.markFailed(delivery.deliveryId, 0, message, null);
      return {
        status: "failed",
        error: message,
        responseCode: null
      };
    }

    let lastError: string | null = null;
    let lastResponseCode: number | null = null;

    // ClawBot 会把文本中的换行折叠成空格，因此将多行文本拆分为多条消息发送，
    // 这样微信里就能分行显示。空行会被忽略。
    const lines = delivery.text
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const messages = lines.length > 0 ? lines : [delivery.text];

    for (let attempt = 1; attempt <= MAX_SEND_ATTEMPTS; attempt += 1) {
      try {
        for (const message of messages) {
          await this.ilinkClient.sendMessage(bot, message);
        }

        await this.botRepository.setLastError(null);
        await this.deliveryLogRepository.markDelivered(delivery.deliveryId, attempt, 200);
        return {
          status: "delivered",
          error: null,
          responseCode: 200
        };
      } catch (error) {
        lastError = toErrorMessage(error);
        lastResponseCode = isIlinkApiError(error) ? (error.httpStatus ?? null) : null;
        const retryable = !isIlinkApiError(error) || error.category === "retryable";

        if (retryable && attempt < MAX_SEND_ATTEMPTS) {
          await this.deliveryLogRepository.markRetrying(delivery.deliveryId, attempt, lastError, lastResponseCode);
          await this.sleep(RETRY_DELAYS_MS[attempt - 1] ?? 1000);
          continue;
        }

        if (isIlinkApiError(error)) {
          await this.handleBotErrorState(error, lastError);
        } else {
          await this.botRepository.setLastError(lastError);
        }

        await this.deliveryLogRepository.markFailed(delivery.deliveryId, attempt, lastError, lastResponseCode);
        return {
          status: "failed",
          error: lastError,
          responseCode: lastResponseCode
        };
      }
    }

    return {
      status: "failed",
      error: lastError,
      responseCode: lastResponseCode
    };
  }
}
