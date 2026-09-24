import { afterEach, describe, expect, it, vi } from "vitest";
import { handleScheduled } from "../src/index";
import type { AppContext } from "../src/contracts";

const createContext = (): AppContext => ({
  config: {
    adminPath: "admin",
    adminUsername: "whoami",
    adminToken: "admin-token",
    webhookSharedToken: "webhook-token",
    keepalive: {
      enabled: true,
      source: "keepalive",
      intervalHours: 24,
      text: "请进行交互保活"
    }
  },
  services: {
    admin: {
      createLoginQrcode: vi.fn(),
      getLoginStatus: vi.fn(),
      activateBot: vi.fn(),
      getBotStatus: vi.fn()
    },
    delivery: {
      sendDelivery: vi.fn(),
      listDeliveries: vi.fn(),
      getDelivery: vi.fn(),
      replayDelivery: vi.fn(),
      replayDeliveries: vi.fn(),
      deleteCompletedDeliveries: vi.fn(),
      replayFailedRetMinusTwo: vi.fn(),
      sendKeepaliveIfDue: vi.fn().mockResolvedValue({
        sent: true,
        reason: "sent",
        deliveryId: "delivery-keepalive",
        lastDeliveryId: null,
        lastCreatedAt: null,
        nextDueAt: "2026-05-15T00:00:00.000Z"
      })
    },
    health: {
      probe: vi.fn()
    }
  }
});

describe("scheduled handler", () => {
  const originalConsoleLog = console.log;

  afterEach(() => {
    console.log = originalConsoleLog;
    vi.restoreAllMocks();
  });

  it("should send keepalive only (delivery is realtime and synchronous)", async () => {
    console.log = vi.fn();
    const context = createContext();
    const controller = {
      cron: "0 * * * *",
      scheduledTime: Date.parse("2026-05-14T00:00:00.000Z")
    } as ScheduledController;

    await handleScheduled(controller, context);

    expect(context.services.delivery.sendKeepaliveIfDue).toHaveBeenCalledWith(
      context.config.keepalive,
      new Date("2026-05-14T00:00:00.000Z")
    );
    expect(console.log).toHaveBeenCalledWith(
      "[scheduled] keepalive",
      expect.objectContaining({
        event: "keepalive",
        sent: true,
        reason: "sent",
        deliveryId: "delivery-keepalive"
      })
    );
  });
});
