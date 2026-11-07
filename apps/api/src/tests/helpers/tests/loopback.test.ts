import express from "express";
import net from "node:net";
import http from "node:http";
import request from "supertest";
import { afterEach, describe, expect, it } from "vitest";
import { loopbackOrigin } from "../loopback.js";

const open: net.Server[] = [];
afterEach(() => open.splice(0).forEach((s) => s.close()));

const fakeServer = (address: object) =>
  ({ address: () => address }) as unknown as http.Server;

describe("loopbackOrigin", () => {
  it("uses the IPv6 loopback for a dual-stack wildcard listener", () => {
    expect(loopbackOrigin(fakeServer({ family: "IPv6", port: 1234 }))).toBe(
      "http://[::1]:1234"
    );
  });

  it("falls back to the IPv4 loopback for an IPv4-only listener", () => {
    expect(loopbackOrigin(fakeServer({ family: "IPv4", port: 1234 }))).toBe(
      "http://127.0.0.1:1234"
    );
  });

  it("is not reached by a foreign listener on exactly 127.0.0.1:<port>", async () => {
    const app = express().get("/who", (_req, res) => res.send("app"));
    const server = http.createServer(app).listen(0);
    open.push(server);
    const port = (server.address() as net.AddressInfo).port;

    const foreign = http.createServer((_req, res) => res.end("foreign"));
    open.push(foreign);
    // macOS lets the foreign listener shadow the app on 127.0.0.1; Linux refuses, leaving nothing to shadow it.
    await new Promise<void>((resolve) => {
      foreign.once("error", () => resolve());
      foreign.listen(port, "127.0.0.1", () => resolve());
    });

    const res = await request(server).get("/who");
    expect(res.status).toBe(200);
    expect(res.text).toBe("app");
  });
});
