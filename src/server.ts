import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { encrypt, decrypt } from './vigenere.js';
import { analyze } from './analyze.js';
import { FREQ_TABLE_VERSION } from './frequency.js';
import { ApiError } from './errors.js';
import { saveExperiment, getExperiment, listExperiments } from './db.js';

async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new ApiError('BAD_REQUEST', '请求体必须是合法 JSON');
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body, null, 2);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(payload);
}

function mustGet(obj: unknown, field: string): unknown {
  if (typeof obj !== 'object' || obj === null || !(field in obj)) {
    throw new ApiError('BAD_REQUEST', `缺少参数 ${field}`);
  }
  return (obj as Record<string, unknown>)[field];
}

export function handleRoute(
  method: string,
  url: URL,
  body: unknown,
): { status: number; payload: unknown } {
  const p = url.pathname;

  if (method === 'POST' && p === '/api/experiments/encrypt') {
    const text = mustGet(body, 'text') as string;
    const key = mustGet(body, 'key') as string;
    const ciphertext = encrypt(text, key);
    const id = saveExperiment('encrypt', text, { key }, null, { ciphertext });
    return { status: 201, payload: { id, ciphertext } };
  }

  if (method === 'POST' && p === '/api/experiments/decrypt') {
    const text = mustGet(body, 'text') as string;
    const key = mustGet(body, 'key') as string;
    const plaintext = decrypt(text, key);
    const id = saveExperiment('decrypt', text, { key }, null, { plaintext });
    return { status: 201, payload: { id, plaintext } };
  }

  if (method === 'POST' && p === '/api/experiments/analyze') {
    const ciphertext = mustGet(body, 'ciphertext') as string;
    const keyLength = mustGet(body, 'keyLength') as number;
    const result = analyze(ciphertext, keyLength);
    const id = saveExperiment('analyze', ciphertext, { keyLength }, FREQ_TABLE_VERSION, result);
    return { status: 201, payload: { id, ...result } };
  }

  if (method === 'GET' && p === '/api/experiments') {
    return { status: 200, payload: { experiments: listExperiments() } };
  }

  const expMatch = p.match(/^\/api\/experiments\/(\d+)(\/export)?$/);
  if (method === 'GET' && expMatch) {
    const row = getExperiment(Number(expMatch[1]));
    if (!row) throw new ApiError('NOT_FOUND', `实验 ${expMatch[1]} 不存在`, 404);
    const full = { ...row, params: JSON.parse(row.params), result: JSON.parse(row.result) };
    return { status: 200, payload: full };
  }

  const manualMatch = p.match(/^\/api\/experiments\/(\d+)\/decrypt-with-key$/);
  if (method === 'POST' && manualMatch) {
    const row = getExperiment(Number(manualMatch[1]));
    if (!row) throw new ApiError('NOT_FOUND', `实验 ${manualMatch[1]} 不存在`, 404);
    const key = mustGet(body, 'key') as string;
    const plaintext = decrypt(row.input_text, key);
    const id = saveExperiment(
      'manual-decrypt',
      row.input_text,
      { key, basedOnExperiment: row.id },
      row.freq_version,
      { plaintext },
    );
    return { status: 201, payload: { id, basedOnExperiment: row.id, key: key.toUpperCase(), plaintext } };
  }

  if (method === 'GET' && p === '/api/health') {
    return { status: 200, payload: { ok: true, freqTableVersion: FREQ_TABLE_VERSION } };
  }

  throw new ApiError('NOT_FOUND', `路由不存在: ${method} ${p}`, 404);
}

export function startServer(port: number): Promise<number> {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const body = req.method === 'POST' ? await readBody(req) : undefined;
      const { status, payload } = handleRoute(req.method ?? 'GET', url, body);
      send(res, status, payload);
    } catch (err) {
      if (err instanceof ApiError) {
        send(res, err.status, { error: { code: err.code, message: err.message } });
      } else {
        send(res, 500, { error: { code: 'INTERNAL', message: String(err) } });
      }
    }
  });
  return new Promise((resolve, reject) => {
    server.on('error', reject);
    // port 0 表示让系统分配空闲端口（默认行为）
    server.listen(port, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr ? addr.port : port);
    });
  });
}
