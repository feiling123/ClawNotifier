import type { CloudflareBindings } from "./bindings";
import { createApp } from "./app";
import { createAppContext } from "./container";
import type { AppContext } from "./contracts";
import { isAppError, isIlinkApiError, toErrorDetails, toErrorMessage } from "./lib/errors";

export const handleScheduled = async (controller: ScheduledController, context: AppContext): Promise<void> => {
  // 通知投递在请求内同步实时发送，失败自动重试，不再依赖队列或定时任务；
  // 定时任务仅用于按需发送一条“保活提醒”。
  const keepalive = await context.services.delivery.sendKeepaliveIfDue(
    context.config.keepalive,
    new Date(controller.scheduledTime)
  );

  console.log("[scheduled] keepalive", {
    component: "scheduled-keepalive",
    event: "keepalive",
    cron: controller.cron,
    scheduledTime: new Date(controller.scheduledTime).toISOString(),
    enabled: context.config.keepalive.enabled,
    intervalHours: context.config.keepalive.intervalHours,
    source: context.config.keepalive.source,
    sent: keepalive.sent,
    reason: keepalive.reason,
    deliveryId: keepalive.deliveryId,
    lastDeliveryId: keepalive.lastDeliveryId,
    lastCreatedAt: keepalive.lastCreatedAt,
    nextDueAt: keepalive.nextDueAt
  });
};

const toFailureResponse = (error: unknown): Response => {
  const status = isAppError(error) ? error.status : isIlinkApiError(error) ? 502 : 500;
  const code = isAppError(error) ? error.code : isIlinkApiError(error) ? "upstream_error" : "internal_error";
  const message = toErrorMessage(error);

  return Response.json(
    {
      code: status,
      error: code,
      message,
      details: toErrorDetails(error)
    },
    {
      status
    }
  );
};

export default {
  async fetch(request, env, executionContext): Promise<Response> {
    try {
      const context = createAppContext(env as CloudflareBindings);
      const app = createApp(context);
      return app.fetch(request, env, executionContext);
    } catch (error) {
      return toFailureResponse(error);
    }
  },

  async scheduled(controller, env): Promise<void> {
    const context = createAppContext(env as CloudflareBindings);
    await handleScheduled(controller, context);
  }
} satisfies ExportedHandler<CloudflareBindings>;
