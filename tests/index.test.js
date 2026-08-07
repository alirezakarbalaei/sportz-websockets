import { describe, it, expect, vi, afterEach } from "vitest";
import http from "http";
import express from "express";

const { securityMiddlewareMock, matchRouterStub, attachWebSocketServerMock } = vi.hoisted(() => {
  const securityMiddlewareMock = vi.fn();

  const matchRouterStub = express.Router();
  matchRouterStub.get("/", (req, res) => res.status(200).json({ data: [] }));

  const attachWebSocketServerMock = vi.fn(() => ({ broadcastMatchCreated: vi.fn() }));

  return { securityMiddlewareMock, matchRouterStub, attachWebSocketServerMock };
});

vi.mock("../src/arcjet.js", () => ({
  securityMiddleware: securityMiddlewareMock,
}));

vi.mock("../src/routes/matches.js", () => ({
  matchRouter: matchRouterStub,
}));

vi.mock("../src/ws/server.js", () => ({
  attachWebSocketServer: attachWebSocketServerMock,
}));

const ORIGINAL_ENV = { ...process.env };

describe("src/index.js - securityMiddleware wiring", () => {
  let server;

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
    server = undefined;
    vi.restoreAllMocks();
    process.env = { ...ORIGINAL_ENV };
  });

  async function bootServer(innerHandler) {
    const inner = vi.fn(innerHandler);
    securityMiddlewareMock.mockReset();
    securityMiddlewareMock.mockImplementation(() => inner);
    attachWebSocketServerMock.mockClear();

    const createServerSpy = vi.spyOn(http, "createServer");
    process.env.PORT = "0";
    process.env.HOST = "127.0.0.1";

    vi.resetModules();
    await import("../src/index.js");

    server = createServerSpy.mock.results[0].value;
    await new Promise((resolve) => {
      if (server.listening) return resolve();
      server.once("listening", resolve);
    });
    const port = server.address().port;

    return { inner, port };
  }

  it("does not invoke securityMiddleware for the root route, since it is registered before the middleware", async () => {
    const { inner, port } = await bootServer((req, res, next) => next());

    const res = await fetch(`http://127.0.0.1:${port}/`);

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("Welcome to Sportz!");
    expect(inner).not.toHaveBeenCalled();
  });

  it("invokes securityMiddleware for requests to /matches and forwards them to the router when allowed", async () => {
    const { inner, port } = await bootServer((req, res, next) => next());

    const res = await fetch(`http://127.0.0.1:${port}/matches`);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ data: [] });
  });

  it("blocks requests to /matches before they reach the router when securityMiddleware denies them", async () => {
    const { inner, port } = await bootServer((req, res) =>
      res.status(403).json({ error: "Forbidden." })
    );

    const res = await fetch(`http://127.0.0.1:${port}/matches`);

    expect(inner).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Forbidden." });
  });

  it("blocks requests to /matches with 429 when securityMiddleware reports a rate limit", async () => {
    const { port } = await bootServer((req, res) =>
      res.status(429).json({ error: "Too many requests." })
    );

    const res = await fetch(`http://127.0.0.1:${port}/matches`);

    expect(res.status).toBe(429);
    expect(await res.json()).toEqual({ error: "Too many requests." });
  });

  it("calls securityMiddleware() exactly once during setup, producing a single middleware instance reused across requests", async () => {
    const { port } = await bootServer((req, res, next) => next());

    await fetch(`http://127.0.0.1:${port}/matches`);
    await fetch(`http://127.0.0.1:${port}/matches`);

    expect(securityMiddlewareMock).toHaveBeenCalledTimes(1);
  });
});