import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { createServer as createNetServer } from "node:net";
import { ApiError } from "./validation.js";
import { VigenereError } from "./crypto/vigenere.js";
import * as lab from "./lab.js";

interface Route {
  method: string;
  pattern: RegExp;
  handler: (
    body: any,
    params: string[],
    req: IncomingMessage,
  ) => unknown | Promise<unknown>;
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/meta$/, handler: () => lab.getMeta() },
  { method: "POST", pattern: /^\/api\/encrypt$/, handler: (b) => lab.encryptText(b.text, b.key) },
  { method: "POST", pattern: /^\/api\/decrypt$/, handler: (b) => lab.decryptText(b.text, b.key) },
  {
    method: "POST",
    pattern: /^\/api\/analyze$/,
    handler: (b) =>
      lab.analyzeCiphertext({
        ciphertext: b.ciphertext,
        keyLength: b.keyLength,
        topK: b.topK,
        maxCombinations: b.maxCombinations,
      }),
  },
  {
    method: "POST",
    pattern: /^\/api\/experiments\/(\d+)\/choose$/,
    handler: (b, p) => lab.chooseCandidate(Number(p[0]), b.key),
  },
  {
    method: "GET",
    pattern: /^\/api\/experiments$/,
    handler: (_b, _p, req) => {
      const url = new URL(req.url!, "http://localhost");
      const limitParam = url.searchParams.get("limit");
      return lab.listAllExperiments(limitParam === null ? undefined : Number(limitParam));
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/experiments\/(\d+)$/,
    handler: (_b, p) => lab.getExperimentById(Number(p[0])),
  },
  {
    method: "GET",
    pattern: /^\/api\/experiments\/(\d+)\/export$/,
    handler: (_b, p) => lab.exportExperiment(Number(p[0])),
  },
  { method: "GET", pattern: /^\/api\/health$/, handler: () => ({ status: "ok" }) },
];

async function readJsonBody(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(chunk as Buffer);
    if (Buffer.concat(chunks).length > 2_000_000) {
      throw new ApiError("BODY_TOO_LARGE", "请求体超过 2MB 上限。", 413);
    }
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  if (raw.length === 0) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError("JSON_INVALID", "请求体不是合法 JSON。");
  }
}

function sendJson(res: ServerResponse, status: number, payload: unknown) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
  });
  res.end(body);
}

export function createApp() {
  return createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url!, "http://localhost").pathname;
      if (req.method === "GET" && pathname === "/") {
        sendJson(res, 200, {
          name: "vigenere-lab",
          endpoints: routes.map((r) => `${r.method} ${r.pattern.source.replace(/\\/g, "").replace(/\^|\$|\(\d\+\)/g, (m) => (m === "(\\d+)" ? ":id" : ""))}`),
        });
        return;
      }
      for (const route of routes) {
        if (route.method !== req.method) continue;
        const match = route.pattern.exec(pathname);
        if (!match) continue;
        const body = req.method === "GET" ? {} : await readJsonBody(req);
        const result = await route.handler(body, match.slice(1), req);
        sendJson(res, 200, { ok: true, data: result });
        return;
      }
      sendJson(res, 404, { ok: false, error: { code: "NOT_FOUND", message: "路由不存在。" } });
    } catch (error) {
      if (error instanceof ApiError) {
        sendJson(res, error.status, { ok: false, error: { code: error.code, message: error.message } });
      } else if (error instanceof VigenereError) {
        sendJson(res, 400, { ok: false, error: { code: error.code, message: error.message } });
      } else {
        sendJson(res, 500, {
          ok: false,
          error: { code: "INTERNAL", message: (error as Error).message },
        });
      }
    }
  });
}

/** 请求系统分配一个空闲 TCP 端口。 */
export function findFreePort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createNetServer();
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolvePort(port));
      } else {
        server.close(() => reject(new Error("无法获取空闲端口")));
      }
    });
    server.on("error", reject);
  });
}

async function main() {
  const requested = process.env.PORT ? Number(process.env.PORT) : NaN;
  const port =
    Number.isInteger(requested) && requested > 0 ? requested : await findFreePort();
  const server = createApp();
  server.listen(port, "127.0.0.1", () => {
    console.log(`[vigenere-lab] HTTP API 已启动: http://127.0.0.1:${port}`);
    console.log("[vigenere-lab] 可用 POST /api/encrypt, /api/decrypt, /api/analyze 等，见 README。");
  });
}

const invokedPath = process.argv[1] ? process.argv[1].replace(/\\/g, "/") : "";
if (invokedPath.endsWith("server.js") || invokedPath.endsWith("server.ts")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
