import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "../src/db.js";
import { createApp, findFreePort } from "../src/server.js";
import { tempDbPath } from "./helpers.js";
import type { Server } from "node:http";

let server: Server;
let baseUrl: string;

before(async () => {
  resetDatabase(tempDbPath());
  server = createApp();
  const port = await findFreePort();
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

async function api(path: string, init?: RequestInit) {
  const response = await fetch(baseUrl + path, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = await response.json();
  return { status: response.status, body };
}

test("GET /api/health", async () => {
  const { status, body } = await api("/api/health");
  assert.equal(status, 200);
  assert.equal(body.data.status, "ok");
});

test("POST /api/encrypt 已知向量", async () => {
  const { body } = await api("/api/encrypt", {
    method: "POST",
    body: JSON.stringify({ text: "ATTACKATDAWN", key: "LEMON" }),
  });
  assert.equal(body.data.ciphertext, "LXFOPVEFRNHR");
});

test("分析 -> 查看 -> 选用候选 全链路", async () => {
  const analyzed = await api("/api/analyze", {
    method: "POST",
    body: JSON.stringify({ ciphertext: "LXFOPVEFRNHR", keyLength: 5, topK: 3 }),
  });
  assert.equal(analyzed.status, 200);
  const id = analyzed.body.data.id;
  const fetched = await api(`/api/experiments/${id}`);
  assert.equal(fetched.body.data.kind, "analyze");
  const chosen = await api(`/api/experiments/${id}/choose`, {
    method: "POST",
    body: JSON.stringify({ key: "LEMON" }),
  });
  assert.equal(chosen.body.data.plaintext, "ATTACKATDAWN");
  const exported = await api(`/api/experiments/${id}/export`);
  assert.equal(exported.body.data.record.id, id);
});

test("错误响应带错误码", async () => {
  const { status, body } = await api("/api/encrypt", {
    method: "POST",
    body: JSON.stringify({ text: "123", key: "KEY" }),
  });
  assert.equal(status, 400);
  assert.equal(body.error.code, "NO_LETTERS");
});
