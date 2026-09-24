import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import * as QRCode from "qrcode";
import type { AppContext, DeliveryListQuery, DeliveryStatus } from "./contracts";
import { renderDashboardPage } from "./lib/dashboard-page";
import { AppError, isAppError, isIlinkApiError, toErrorDetails, toErrorMessage } from "./lib/errors";
import { renderDeliveryLogPage } from "./lib/delivery-log-page";
import { getQrcodeRenderContent } from "./lib/ilink-qrcode";
import { renderQrcodeLoginPage } from "./lib/qrcode-page";
import { renderLoginPage } from "./lib/login-page";
import { renderSendTestPage } from "./lib/send-page";
import { parseJsonBody, validateIncomingMessage, validateSource } from "./lib/validation";
import { ADMIN_SESSION_COOKIE, ADMIN_SESSION_TTL_SECONDS, createAdminSessionToken, verifyAdminSessionToken } from "./lib/auth";

const extractBearerToken = (authorizationHeader: string | null): string | null => {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.slice("Bearer ".length).trim();
};

const ALLOWED_DELIVERY_STATUSES = new Set<DeliveryStatus>(["queued", "retrying", "delivered", "failed"]);
const MAX_BATCH_DELIVERY_IDS = 100;
const DELIVERY_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const extractAdminToken = (request: Request): string | null => {
  const bearerToken = extractBearerToken(request.headers.get("Authorization"));
  if (bearerToken) {
    return bearerToken;
  }

  const url = new URL(request.url);
  const queryToken = url.searchParams.get("token")?.trim();
  return queryToken || null;
};

const sanitizeNext = (value: string, fallback: string): string => {
  if (value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return fallback;
};

const HTML_HEADERS = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store"
};

const parseDeliveryListQuery = (request: Request): DeliveryListQuery => {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const rawPage = url.searchParams.get("page");
  const rawStatus = url.searchParams.get("status");
  const rawSource = url.searchParams.get("source")?.trim();

  let limit = 20;
  if (rawLimit) {
    limit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError(400, "invalid_limit", "limit 必须是 1-100 之间的整数。");
    }
  }

  let page = 1;
  if (rawPage) {
    page = Number.parseInt(rawPage, 10);
    if (!/^[1-9]\d*$/.test(rawPage) || !Number.isSafeInteger(page)) {
      throw new AppError(400, "invalid_page", "page 必须是大于等于 1 的整数。");
    }
  }

  if (rawStatus && !ALLOWED_DELIVERY_STATUSES.has(rawStatus as DeliveryStatus)) {
    throw new AppError(400, "invalid_status", "status 仅支持 queued、retrying、delivered、failed。");
  }

  if (rawSource) {
    validateSource(rawSource);
  }

  return {
    limit,
    page,
    status: rawStatus ? (rawStatus as DeliveryStatus) : undefined,
    source: rawSource || undefined
  };
};

const parseRefreshSeconds = (request: Request, fallback: number): number => {
  const url = new URL(request.url);
  const refreshRaw = url.searchParams.get("refresh");
  if (!refreshRaw) {
    return fallback;
  }

  const refreshSeconds = Number.parseInt(refreshRaw, 10);
  if (!Number.isInteger(refreshSeconds) || refreshSeconds < 0 || refreshSeconds > 300) {
    throw new AppError(400, "invalid_refresh", "refresh 必须是 0-300 之间的整数秒。");
  }

  return refreshSeconds;
};

const parseReplayQuery = (request: Request): { limit: number; source?: string } => {
  const url = new URL(request.url);
  const rawLimit = url.searchParams.get("limit");
  const rawSource = url.searchParams.get("source")?.trim();

  let limit = 20;
  if (rawLimit) {
    limit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      throw new AppError(400, "invalid_limit", "limit 必须是 1-100 之间的整数。");
    }
  }

  if (rawSource) {
    validateSource(rawSource);
  }

  return {
    limit,
    source: rawSource || undefined
  };
};

const parseBatchDeliveryIds = async (request: Request): Promise<string[]> => {
  const input = await parseJsonBody(request);
  if (typeof input !== "object" || input === null || Array.isArray(input)) {
    throw new AppError(400, "invalid_delivery_ids", "deliveryIds 必须是非空 UUID 数组。");
  }

  const deliveryIdsInput = (input as Record<string, unknown>).deliveryIds;
  if (
    !Array.isArray(deliveryIdsInput) ||
    deliveryIdsInput.length === 0 ||
    deliveryIdsInput.length > MAX_BATCH_DELIVERY_IDS ||
    deliveryIdsInput.some((deliveryId) => typeof deliveryId !== "string")
  ) {
    throw new AppError(400, "invalid_delivery_ids", "deliveryIds 必须是 1-100 条 UUID 组成的数组。");
  }

  const deliveryIds = Array.from(new Set(deliveryIdsInput.map((deliveryId) => (deliveryId as string).trim())));
  if (deliveryIds.some((deliveryId) => !DELIVERY_ID_PATTERN.test(deliveryId))) {
    throw new AppError(400, "invalid_delivery_ids", "deliveryIds 必须是 1-100 条 UUID 组成的数组。");
  }

  return deliveryIds;
};

export const createApp = (context: AppContext): Hono => {
  const app = new Hono();
  const base = `/${context.config.adminPath}`;

  const cookieOptions = (requestUrl: string) => ({
    path: "/",
    httpOnly: true,
    secure: requestUrl.startsWith("https"),
    sameSite: "Lax" as const,
    maxAge: ADMIN_SESSION_TTL_SECONDS
  });

  app.onError((error, c) => {
    if (isAppError(error)) {
      return new Response(
        JSON.stringify({
          code: error.status,
          error: error.code,
          message: error.message,
          details: error.details ?? null
        }),
        {
          status: error.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    if (isIlinkApiError(error)) {
      const status = error.category === "retryable" ? 502 : 500;
      return new Response(
        JSON.stringify({
          code: status,
          error: "upstream_error",
          message: error.message,
          details: toErrorDetails(error)
        }),
        {
          status,
          headers: {
            "Content-Type": "application/json; charset=utf-8"
          }
        }
      );
    }

    return new Response(
      JSON.stringify({
        code: 500,
        error: "internal_error",
        message: toErrorMessage(error),
        details: toErrorDetails(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    );
  });

  app.notFound(() =>
    new Response(
      JSON.stringify({
        code: 404,
        error: "not_found",
        message: "Route not found."
      }),
      {
        status: 404,
        headers: {
          "Content-Type": "application/json; charset=utf-8"
        }
      }
    )
  );

  // 登录 / 登出（无需鉴权，必须注册在鉴权中间件之前）。
  app.get(`${base}/login`, (c) => {
    const fallback = `${base}/dashboard`;
    const next = sanitizeNext(c.req.query("next") ?? fallback, fallback);
    return new Response(renderLoginPage({ adminPath: context.config.adminPath, error: null, next }), {
      headers: HTML_HEADERS
    });
  });

  app.post(`${base}/login`, async (c) => {
    const body = (await parseJsonBody(c.req.raw)) as Record<string, unknown>;
    const username = typeof body.username === "string" ? body.username.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const next = `${base}/dashboard`;

    if (username !== context.config.adminUsername || password !== context.config.adminToken) {
      return new Response(
        renderLoginPage({ adminPath: context.config.adminPath, error: "用户名或密码错误。", next }),
        { status: 401, headers: HTML_HEADERS }
      );
    }

    const sessionToken = await createAdminSessionToken(context.config.adminToken);
    setCookie(c, ADMIN_SESSION_COOKIE, sessionToken, cookieOptions(c.req.url));
    return c.json({ ok: true, next }, 200);
  });

  app.get(`${base}/logout`, (c) => {
    deleteCookie(c, ADMIN_SESSION_COOKIE, { path: "/" });
    return c.redirect(`${base}/login`, 302);
  });

  // 后台统一鉴权：优先 cookie，其次兼容 ?token= 与 Bearer。
  app.use(`${base}/*`, async (c, next) => {
    const cookieToken = getCookie(c, ADMIN_SESSION_COOKIE);
    const cookieValid = cookieToken
      ? await verifyAdminSessionToken(context.config.adminToken, cookieToken)
      : false;
    const token = extractAdminToken(c.req.raw);

    if (cookieValid || token === context.config.adminToken) {
      await next();
      return;
    }

    const url = new URL(c.req.url);
    const acceptsHtml = (c.req.header("Accept") ?? "").includes("text/html");
    if (acceptsHtml && c.req.method === "GET") {
      return c.redirect(`${base}/login?next=${encodeURIComponent(url.pathname + url.search)}`, 302);
    }

    throw new AppError(401, "unauthorized", "缺少有效的 ADMIN_TOKEN 或登录会话。");
  });

  app.use("/api/*", async (c, next) => {
    const cookieToken = getCookie(c, ADMIN_SESSION_COOKIE);
    const cookieValid = cookieToken
      ? await verifyAdminSessionToken(context.config.adminToken, cookieToken)
      : false;
    const bearerToken = extractBearerToken(c.req.header("Authorization") ?? null);

    if (!cookieValid && bearerToken !== context.config.adminToken) {
      throw new AppError(401, "unauthorized", "缺少有效的 ADMIN_TOKEN。");
    }

    await next();
  });

  app.use("/webhook/*", async (c, next) => {
    const token = c.req.header("X-Webhook-Token") ?? "";
    if (token !== context.config.webhookSharedToken) {
      throw new AppError(401, "unauthorized", "缺少有效的 X-Webhook-Token。");
    }

    await next();
  });

  app.get("/healthz", async (c) => {
    const data = await context.services.health.probe();
    return c.json({
      code: 200,
      data
    });
  });

  app.get(`${base}/dashboard`, async (c) => {
    const url = new URL(c.req.url);
    const logsLimitRaw = url.searchParams.get("logsLimit");
    let logsLimit = 8;
    if (logsLimitRaw) {
      logsLimit = Number.parseInt(logsLimitRaw, 10);
      if (!Number.isInteger(logsLimit) || logsLimit < 1 || logsLimit > 50) {
        throw new AppError(400, "invalid_logs_limit", "logsLimit 必须是 1-50 之间的整数。");
      }
    }

    return new Response(
      renderDashboardPage({
        adminPath: context.config.adminPath,
        refreshSeconds: parseRefreshSeconds(c.req.raw, 5),
        logsLimit
      }),
      {
        headers: HTML_HEADERS
      }
    );
  });

  app.get(`${base}/send`, async (c) => {
    return new Response(renderSendTestPage({ adminPath: context.config.adminPath }), {
      headers: HTML_HEADERS
    });
  });

  app.post(`${base}/bot/login/qrcode`, async (c) => {
    const data = await context.services.admin.createLoginQrcode();
    return c.json(
      {
        code: 201,
        data
      },
      201
    );
  });

  app.get(`${base}/bot/login/qrcode/page`, async (c) => {
    const data = await context.services.admin.createLoginQrcode();
    const svgMarkup = await QRCode.toString(getQrcodeRenderContent(data), {
      type: "svg",
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      color: {
        dark: "#17202d",
        light: "#ffffff"
      }
    });

    return new Response(
      renderQrcodeLoginPage({
        sessionId: data.sessionId,
        expiresAt: data.expiresAt,
        svgMarkup,
        adminPath: context.config.adminPath
      }),
      {
        headers: HTML_HEADERS
      }
    );
  });

  app.get(`${base}/bot/login/status/:sessionId`, async (c) => {
    const data = await context.services.admin.getLoginStatus(c.req.param("sessionId"));
    return c.json({
      code: 200,
      data
    });
  });

  app.post(`${base}/bot/activate`, async (c) => {
    const data = await context.services.admin.activateBot();
    return c.json({
      code: 200,
      data
    });
  });

  app.get(`${base}/bot/status`, async (c) => {
    const data = await context.services.admin.getBotStatus();
    return c.json({
      code: 200,
      data
    });
  });

  app.get(`${base}/deliveries`, async (c) => {
    const data = await context.services.delivery.listDeliveries(parseDeliveryListQuery(c.req.raw));
    return c.json({
      code: 200,
      data
    });
  });

  app.get(`${base}/deliveries/page`, async (c) => {
    const filters = parseDeliveryListQuery(c.req.raw);
    return new Response(
      renderDeliveryLogPage({
        adminPath: context.config.adminPath,
        initialStatus: filters.status,
        initialSource: filters.source,
        initialLimit: filters.limit,
        initialPage: filters.page,
        initialRefreshSeconds: parseRefreshSeconds(c.req.raw, 5)
      }),
      {
        headers: HTML_HEADERS
      }
    );
  });

  app.post(`${base}/deliveries/replay-ret2`, async (c) => {
    const data = await context.services.delivery.replayFailedRetMinusTwo(parseReplayQuery(c.req.raw));
    return c.json({
      code: 202,
      data
    }, 202);
  });

  app.post(`${base}/deliveries/batch/replay`, async (c) => {
    const data = await context.services.delivery.replayDeliveries(await parseBatchDeliveryIds(c.req.raw));
    return c.json({
      code: 202,
      data
    }, 202);
  });

  app.post(`${base}/deliveries/batch/delete`, async (c) => {
    const data = await context.services.delivery.deleteCompletedDeliveries(await parseBatchDeliveryIds(c.req.raw));
    return c.json({
      code: 200,
      data
    });
  });

  app.post(`${base}/deliveries/:deliveryId/replay`, async (c) => {
    const data = await context.services.delivery.replayDelivery(c.req.param("deliveryId"));
    return c.json({
      code: 202,
      data
    }, 202);
  });

  app.get(`${base}/deliveries/:deliveryId`, async (c) => {
    const data = await context.services.delivery.getDelivery(c.req.param("deliveryId"));
    if (!data) {
      throw new AppError(404, "delivery_not_found", "未找到对应的投递记录。");
    }

    return c.json({
      code: 200,
      data
    });
  });

  app.post("/api/send", async (c) => {
    const input = validateIncomingMessage(await parseJsonBody(c.req.raw));
    const data = await context.services.delivery.sendDelivery("admin", input);
    return c.json(
      {
        code: 202,
        data
      },
      202
    );
  });

  app.post("/webhook/:source", async (c) => {
    const source = validateSource(c.req.param("source"));
    const input = validateIncomingMessage(await parseJsonBody(c.req.raw));
    const data = await context.services.delivery.sendDelivery(source, input);
    return c.json(
      {
        code: 202,
        data
      },
      202
    );
  });

  return app;
};
