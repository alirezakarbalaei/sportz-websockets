import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { arcjetFactory, shieldMock, detectBotMock, slidingWindowMock } = vi.hoisted(() => {
  return {
    arcjetFactory: vi.fn(),
    shieldMock: vi.fn((opts) => ({ rule: "shield", ...opts })),
    detectBotMock: vi.fn((opts) => ({ rule: "detectBot", ...opts })),
    slidingWindowMock: vi.fn((opts) => ({ rule: "slidingWindow", ...opts })),
  };
});

vi.mock("@arcjet/node", () => ({
  default: (...args) => arcjetFactory(...args),
  shield: (...args) => shieldMock(...args),
  detectBot: (...args) => detectBotMock(...args),
  slidingWindow: (...args) => slidingWindowMock(...args),
}));

const ORIGINAL_ENV = { ...process.env };

async function loadArcjetModule() {
  vi.resetModules();
  return import("../src/arcjet.js");
}

describe("src/arcjet.js", () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    arcjetFactory.mockReset();
    shieldMock.mockClear();
    detectBotMock.mockClear();
    slidingWindowMock.mockClear();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
  });

  describe("module initialization", () => {
    it("throws when ARCJET_KEY is not set", async () => {
      delete process.env.ARCJET_KEY;

      await expect(loadArcjetModule()).rejects.toThrow(
        "ARCJET KEY environment variable is missing."
      );
    });

    it("throws when ARCJET_KEY is an empty string", async () => {
      process.env.ARCJET_KEY = "";

      await expect(loadArcjetModule()).rejects.toThrow(
        "ARCJET KEY environment variable is missing."
      );
    });

    it("creates httpArcjet and wsArcjet instances when ARCJET_KEY is present", async () => {
      process.env.ARCJET_KEY = "test-key";
      const fakeInstance = { protect: vi.fn() };
      arcjetFactory.mockReturnValue(fakeInstance);

      const mod = await loadArcjetModule();

      expect(mod.httpArcjet).toBe(fakeInstance);
      expect(mod.wsArcjet).toBe(fakeInstance);
      expect(arcjetFactory).toHaveBeenCalledTimes(2);
      expect(arcjetFactory).toHaveBeenCalledWith(
        expect.objectContaining({ key: "test-key" })
      );
    });

    it("defaults arcjetMode to LIVE when ARCJET_MODE is not DRY_RUN", async () => {
      process.env.ARCJET_KEY = "test-key";
      process.env.ARCJET_MODE = "something-else";
      arcjetFactory.mockReturnValue({ protect: vi.fn() });

      await loadArcjetModule();

      expect(shieldMock).toHaveBeenCalledWith({ mode: "LIVE" });
      expect(detectBotMock).toHaveBeenCalledWith({
        mode: "LIVE",
        allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
      });
    });

    it("uses DRY_RUN mode when ARCJET_MODE is DRY_RUN", async () => {
      process.env.ARCJET_KEY = "test-key";
      process.env.ARCJET_MODE = "DRY_RUN";
      arcjetFactory.mockReturnValue({ protect: vi.fn() });

      await loadArcjetModule();

      expect(shieldMock).toHaveBeenCalledWith({ mode: "DRY_RUN" });
      expect(detectBotMock).toHaveBeenCalledWith({
        mode: "DRY_RUN",
        allow: ["CATEGORY:SEARCH_ENGINE", "CATEGORY:PREVIEW"],
      });
    });

    it("configures httpArcjet's sliding window with a 10s interval and max of 50", async () => {
      process.env.ARCJET_KEY = "test-key";
      arcjetFactory.mockReturnValue({ protect: vi.fn() });

      await loadArcjetModule();

      expect(slidingWindowMock).toHaveBeenCalledWith(
        expect.objectContaining({ interval: "10s", max: 50 })
      );
    });

    it("configures wsArcjet's sliding window with a 2s interval and max of 5", async () => {
      process.env.ARCJET_KEY = "test-key";
      arcjetFactory.mockReturnValue({ protect: vi.fn() });

      await loadArcjetModule();

      expect(slidingWindowMock).toHaveBeenCalledWith(
        expect.objectContaining({ interval: "2s", max: 5 })
      );
    });
  });

  describe("securityMiddleware", () => {
    async function loadWithProtect(protectImpl) {
      process.env.ARCJET_KEY = "test-key";
      arcjetFactory.mockReturnValue({ protect: protectImpl });
      return loadArcjetModule();
    }

    function createRes() {
      const res = {
        status: vi.fn(() => res),
        json: vi.fn(() => res),
      };
      return res;
    }

    it("calls next() and does not touch the response when the decision is not denied", async () => {
      const decision = { isDenied: () => false };
      const protectFn = vi.fn().mockResolvedValue(decision);
      const mod = await loadWithProtect(protectFn);
      const middleware = mod.securityMiddleware();
      const req = { some: "request" };
      const res = createRes();
      const next = vi.fn();

      await middleware(req, res, next);

      expect(protectFn).toHaveBeenCalledWith(req);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it("responds with 429 when denied due to a rate limit", async () => {
      const decision = {
        isDenied: () => true,
        reason: { isRateLimit: () => true },
      };
      const protectFn = vi.fn().mockResolvedValue(decision);
      const mod = await loadWithProtect(protectFn);
      const middleware = mod.securityMiddleware();
      const res = createRes();
      const next = vi.fn();

      await middleware({}, res, next);

      expect(res.status).toHaveBeenCalledWith(429);
      expect(res.json).toHaveBeenCalledWith({ error: "Too many requests." });
      expect(next).not.toHaveBeenCalled();
    });

    it("responds with 403 when denied for a non-rate-limit reason", async () => {
      const decision = {
        isDenied: () => true,
        reason: { isRateLimit: () => false },
      };
      const protectFn = vi.fn().mockResolvedValue(decision);
      const mod = await loadWithProtect(protectFn);
      const middleware = mod.securityMiddleware();
      const res = createRes();
      const next = vi.fn();

      await middleware({}, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Forbidden." });
      expect(next).not.toHaveBeenCalled();
    });

    it("responds with 503 and does not throw when protect() rejects", async () => {
      const protectFn = vi.fn().mockRejectedValue(new Error("network down"));
      const mod = await loadWithProtect(protectFn);
      const middleware = mod.securityMiddleware();
      const res = createRes();
      const next = vi.fn();
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      await middleware({}, res, next);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({ error: "Service Unavailable" });
      expect(next).not.toHaveBeenCalled();
      expect(logSpy).toHaveBeenCalled();

      logSpy.mockRestore();
    });

    it("returns a fresh middleware function on each call", async () => {
      const protectFn = vi.fn().mockResolvedValue({ isDenied: () => false });
      const mod = await loadWithProtect(protectFn);

      const middlewareA = mod.securityMiddleware();
      const middlewareB = mod.securityMiddleware();

      expect(typeof middlewareA).toBe("function");
      expect(typeof middlewareB).toBe("function");
      expect(middlewareA).not.toBe(middlewareB);
    });
  });
});