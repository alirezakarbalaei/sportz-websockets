import { describe, it, expect, vi, afterEach } from "vitest";

const { instances } = vi.hoisted(() => ({ instances: [] }));

vi.mock("ws", () => {
  class FakeWebSocketServer {
    constructor(options) {
      this.options = options;
      this._handlers = {};
      this.clients = new Set();
      instances.push(this);
    }
    on(event, handler) {
      this._handlers[event] = handler;
      return this;
    }
  }

  return {
    WebSocketServer: FakeWebSocketServer,
    WebSocket: { OPEN: 1 },
  };
});

function createMockSocket() {
  return {
    readyState: 1, // WebSocket.OPEN
    isAlive: undefined,
    send: vi.fn(),
    close: vi.fn(),
    on: vi.fn(),
  };
}

async function loadServer(wsArcjetValue) {
  vi.resetModules();
  instances.length = 0;
  vi.doMock("../src/arcjet.js", () => ({ wsArcjet: wsArcjetValue }));
  const mod = await import("../src/ws/server.js");
  return mod.attachWebSocketServer;
}

describe("attachWebSocketServer arcjet integration", () => {
  const fakeHttpServer = { on: vi.fn() };

  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("../src/arcjet.js");
  });

  it("sends a welcome message and never calls arcjet when wsArcjet is not configured", async () => {
    const attachWebSocketServer = await loadServer(null);
    attachWebSocketServer(fakeHttpServer);
    const wss = instances[0];
    const socket = createMockSocket();
    const req = { url: "/ws", headers: {} };

    await wss._handlers.connection(socket, req);

    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "welcome" }));
    expect(socket.isAlive).toBe(true);
    expect(socket.on).toHaveBeenCalledWith("pong", expect.any(Function));
    expect(socket.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("calls arcjet.protect with the upgrade request and allows the connection when the decision is not denied", async () => {
    const protectFn = vi.fn().mockResolvedValue({ isDenied: () => false });
    const attachWebSocketServer = await loadServer({ protect: protectFn });
    attachWebSocketServer(fakeHttpServer);
    const wss = instances[0];
    const socket = createMockSocket();
    const req = { url: "/ws", headers: {} };

    await wss._handlers.connection(socket, req);

    expect(protectFn).toHaveBeenCalledWith(req);
    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).toHaveBeenCalledWith(JSON.stringify({ type: "welcome" }));
  });

  it("closes the connection with code 1013 when arcjet denies the connection due to a rate limit", async () => {
    const protectFn = vi.fn().mockResolvedValue({
      isDenied: () => true,
      reason: { isRateLimit: () => true },
    });
    const attachWebSocketServer = await loadServer({ protect: protectFn });
    attachWebSocketServer(fakeHttpServer);
    const wss = instances[0];
    const socket = createMockSocket();

    await wss._handlers.connection(socket, { url: "/ws", headers: {} });

    expect(socket.close).toHaveBeenCalledWith(1013, "Rate Limit Exceeded");
    expect(socket.send).not.toHaveBeenCalled();
  });

  it("closes the connection with code 1008 when arcjet denies the connection for a non-rate-limit reason", async () => {
    const protectFn = vi.fn().mockResolvedValue({
      isDenied: () => true,
      reason: { isRateLimit: () => false },
    });
    const attachWebSocketServer = await loadServer({ protect: protectFn });
    attachWebSocketServer(fakeHttpServer);
    const wss = instances[0];
    const socket = createMockSocket();

    await wss._handlers.connection(socket, { url: "/ws", headers: {} });

    expect(socket.close).toHaveBeenCalledWith(1008, "Access Denied.");
    expect(socket.send).not.toHaveBeenCalled();
  });

  // Regression test: the catch block in src/ws/server.js references an
  // undefined variable (`e` instead of the bound `error` parameter). This
  // causes a ReferenceError to be thrown from inside the catch block itself,
  // so `socket.close(1011, ...)` is never reached when `protect()` rejects.
  it("never closes the socket when arcjet.protect() rejects, because the catch block throws a ReferenceError", async () => {
    const protectFn = vi.fn().mockRejectedValue(new Error("network error"));
    const attachWebSocketServer = await loadServer({ protect: protectFn });
    attachWebSocketServer(fakeHttpServer);
    const wss = instances[0];
    const socket = createMockSocket();

    await expect(
      wss._handlers.connection(socket, { url: "/ws", headers: {} })
    ).rejects.toThrow(ReferenceError);

    expect(socket.close).not.toHaveBeenCalled();
    expect(socket.send).not.toHaveBeenCalled();
  });
});