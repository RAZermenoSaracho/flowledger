import express from "express";
import morgan from "morgan";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { requestLogFormat } from "../requestLogFormat.js";

async function logLineFor(path: string, referrer?: string) {
  const lines: string[] = [];
  const app = express();
  app.use(morgan(requestLogFormat, { stream: { write: (line) => void lines.push(line) } }));
  app.use((_req, res) => {
    res.json({ ok: true });
  });

  const call = request(app).get(path);
  await (referrer ? call.set("Referer", referrer) : call);
  await new Promise((resolve) => setImmediate(resolve));
  return lines[0] ?? "";
}

describe("requestLogFormat", () => {
  it("logs the path without query values", async () => {
    const line = await logLineFor("/auth/google/callback?code=secret-code&state=secret-state");

    expect(line).toContain("GET /auth/google/callback 200");
    expect(line).not.toContain("secret-code");
    expect(line).not.toContain("secret-state");
  });

  it("logs only the referrer's host", async () => {
    const line = await logLineFor("/x", "https://app.example.com/oauth/authorize?req=secret-req");

    expect(line).toContain("ref=app.example.com");
    expect(line).not.toContain("secret-req");
  });

  it("tolerates a malformed referrer", async () => {
    expect(await logLineFor("/x", "not a url")).toContain("ref=-");
  });
});
