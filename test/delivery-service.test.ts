import { describe, expect, it, vi } from "vitest";
import type { BotState, DeliveryLog } from "../src/contracts";
import { IlinkClient } from "../src/ilink/client";
import { IlinkApiError } from "../src/lib/errors";
import { DefaultDeliveryService } from "../src/services/delivery-service";
import { BotStateRepository } from "../src/storage/bot-state-repository";
import { DeliveryLogRepository } from "../src/storage/delivery-log-repository";

const createBot = (overrides: Partial<BotState> = {}): BotState => ({
  botId: "bot-1",
  botToken: "token-1",
  ilinkUserId: "user-1",
  contextToken: "ctx-token",
  getUpdatesBuf: null,
  status: "ready",
  lastError: null,
  updatedAt: "2026-09-24T00:00:00.000Z",
  ...overrides
});

const createDelivery = (overrides: Partial<DeliveryLog> = {}): DeliveryLog => ({
  deliveryId: "delivery-1",
  source: "github",
  traceId: null,
  dedupeKey: null,
  idempotencyKey: null,
  text: "build completed",
  meta: null,
  status: "failed",
  attempts: 0,
  error: null,
  responseCode: null,
  createdAt: "2026-09-24T00:00:00.000Z",
  updatedAt: "2026-09-24T00:00:00.000Z",
  ...overrides
});

const createRepository = (overrides: Partial<DeliveryLogRepository> = {}) =>
  ({
    createQueued: vi.fn(),
    getById: vi.fn(),
    count: vi.fn(),
    list: vi.fn(),
    deleteCompletedByIds: vi.fn(),
    markRetrying: vi.fn().mockResolvedValue(undefined),
    markDelivered: vi.fn().mockResolvedValue(undefined),
    markFailed: vi.fn().mockResolvedValue(undefined),
    markQueuedForReplay: vi.fn().mockResolvedValue(undefined),
    ...overrides
  }) as unknown as DeliveryLogRepository;

const createBotRepository = (bot: BotState | null) =>
  ({
    getCurrent: vi.fn().mockResolvedValue(bot),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    setLastError: vi.fn().mockResolvedValue(undefined)
  }) as unknown as BotStateRepository;

const createClient = (sendMessage: ReturnType<typeof vi.fn>) =>
  ({ sendMessage }) as unknown as IlinkClient;

describe("delivery list pagination", () => {
  it("returns the requested page together with the matching total", async () => {
    const repository = createRepository({
      count: vi.fn().mockResolvedValue(41),
      list: vi.fn().mockResolvedValue([])
    });
    const service = new DefaultDeliveryService(repository, createBotRepository(null), createClient(vi.fn()));

    await expect(service.listDeliveries({ limit: 20, page: 3, status: "failed", source: "github" })).resolves.toMatchObject({
      page: 3,
      limit: 20,
      total: 41,
      totalPages: 3,
      status: "failed",
      source: "github"
    });
    expect(repository.count).toHaveBeenCalledWith({ limit: 20, page: 3, status: "failed", source: "github" });
    expect(repository.list).toHaveBeenCalledWith({ limit: 20, page: 3, status: "failed", source: "github" });
  });

  it("falls back to the last available page when the requested page is out of range", async () => {
    const repository = createRepository({
      count: vi.fn().mockResolvedValue(25),
      list: vi.fn().mockResolvedValue([])
    });
    const service = new DefaultDeliveryService(repository, createBotRepository(null), createClient(vi.fn()));

    await expect(service.listDeliveries({ limit: 20, page: 9 })).resolves.toMatchObject({
      page: 2,
      total: 25,
      totalPages: 2
    });
    expect(repository.list).toHaveBeenCalledWith({ limit: 20, page: 2 });
  });
});

describe("delivery deletion", () => {
  it("deletes only the completed records reported by the repository", async () => {
    const repository = createRepository({
      deleteCompletedByIds: vi.fn().mockResolvedValue(1)
    });
    const service = new DefaultDeliveryService(repository, createBotRepository(null), createClient(vi.fn()));

    await expect(service.deleteCompletedDeliveries(["delivery-1", "delivery-2"])).resolves.toEqual({
      selected: 2,
      deleted: 1,
      skipped: 1
    });
    expect(repository.deleteCompletedByIds).toHaveBeenCalledWith(["delivery-1", "delivery-2"]);
  });
});

describe("sendDelivery", () => {
  it("delivers immediately when the bot is ready", async () => {
    const delivery = createDelivery({ status: "queued" });
    const repository = createRepository({
      createQueued: vi.fn().mockResolvedValue({ delivery, duplicate: false })
    });
    const botRepository = createBotRepository(createBot());
    const client = createClient(vi.fn().mockResolvedValue(undefined));
    const service = new DefaultDeliveryService(repository, botRepository, client);

    await expect(service.sendDelivery("github", { text: "build completed" })).resolves.toEqual({
      deliveryId: "delivery-1",
      duplicate: false,
      status: "delivered"
    });
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
    expect(repository.markDelivered).toHaveBeenCalledWith("delivery-1", 1, 200);
  });

  it("fails when no bot is logged in", async () => {
    const delivery = createDelivery({ status: "queued" });
    const repository = createRepository({
      createQueued: vi.fn().mockResolvedValue({ delivery, duplicate: false })
    });
    const botRepository = createBotRepository(null);
    const service = new DefaultDeliveryService(repository, botRepository, createClient(vi.fn()));

    await expect(service.sendDelivery("github", { text: "build completed" })).resolves.toMatchObject({
      status: "failed"
    });
    expect(repository.markFailed).toHaveBeenCalledWith("delivery-1", 0, expect.any(String), null);
  });

  it("retries on retryable errors and succeeds eventually", async () => {
    const delivery = createDelivery({ status: "queued" });
    const repository = createRepository({
      createQueued: vi.fn().mockResolvedValue({ delivery, duplicate: false })
    });
    const botRepository = createBotRepository(createBot());
    const sendMessage = vi
      .fn()
      .mockRejectedValueOnce(new IlinkApiError("upstream timeout", { category: "retryable", httpStatus: 502 }))
      .mockRejectedValueOnce(new IlinkApiError("upstream timeout", { category: "retryable", httpStatus: 502 }))
      .mockResolvedValueOnce(undefined);
    const service = new DefaultDeliveryService(repository, botRepository, createClient(sendMessage), vi.fn().mockResolvedValue(undefined));

    await expect(service.sendDelivery("github", { text: "build completed" })).resolves.toMatchObject({
      status: "delivered"
    });
    expect(sendMessage).toHaveBeenCalledTimes(3);
    expect(repository.markRetrying).toHaveBeenCalledTimes(2);
    expect(repository.markDelivered).toHaveBeenCalledWith("delivery-1", 3, 200);
  });

  it("does not retry non-retryable errors", async () => {
    const delivery = createDelivery({ status: "queued" });
    const repository = createRepository({
      createQueued: vi.fn().mockResolvedValue({ delivery, duplicate: false })
    });
    const botRepository = createBotRepository(createBot());
    const sendMessage = vi.fn().mockRejectedValue(new IlinkApiError("token expired", { category: "unauthorized", httpStatus: 401 }));
    const service = new DefaultDeliveryService(repository, botRepository, createClient(sendMessage), vi.fn().mockResolvedValue(undefined));

    await expect(service.sendDelivery("github", { text: "build completed" })).resolves.toMatchObject({
      status: "failed"
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(botRepository.updateStatus).toHaveBeenCalledWith("needs_login", expect.any(String));
  });
});

describe("delivery replay", () => {
  it("replays a failed delivery by sending it directly", async () => {
    const delivery = createDelivery({ status: "failed" });
    const repository = createRepository({
      getById: vi.fn().mockResolvedValue(delivery)
    });
    const botRepository = createBotRepository(createBot());
    const client = createClient(vi.fn().mockResolvedValue(undefined));
    const service = new DefaultDeliveryService(repository, botRepository, client);

    await expect(service.replayDelivery("delivery-1")).resolves.toEqual({
      deliveryId: "delivery-1",
      status: "delivered",
      replayed: true,
      error: null
    });
    expect(repository.markQueuedForReplay).toHaveBeenCalledWith("delivery-1");
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });

  it("replays only failed deliveries in a selected batch", async () => {
    const failedDelivery = createDelivery({ status: "failed" });
    const deliveredDelivery = createDelivery({ deliveryId: "delivered-delivery", status: "delivered", error: null });
    const repository = createRepository({
      getById: vi.fn().mockResolvedValueOnce(failedDelivery).mockResolvedValueOnce(deliveredDelivery)
    });
    const botRepository = createBotRepository(createBot());
    const client = createClient(vi.fn().mockResolvedValue(undefined));
    const service = new DefaultDeliveryService(repository, botRepository, client);

    await expect(service.replayDeliveries(["delivery-1", "delivered-delivery"])).resolves.toMatchObject({
      items: [
        { deliveryId: "delivery-1", replayed: true, status: "delivered" },
        { deliveryId: "delivered-delivery", replayed: false, status: "delivered" }
      ]
    });
    expect(client.sendMessage).toHaveBeenCalledTimes(1);
  });
});
