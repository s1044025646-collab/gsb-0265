import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_DB_PATH = resolve(
  __dirname,
  "../data/lab/experiments.sqlite",
);

let dbInstance: DatabaseSync | null = null;

export function openDatabase(dbPath: string = DEFAULT_DB_PATH): DatabaseSync {
  if (dbInstance) return dbInstance;
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    CREATE TABLE IF NOT EXISTS experiments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      created_at TEXT NOT NULL,
      kind TEXT NOT NULL,
      input_text TEXT NOT NULL,
      params TEXT NOT NULL,
      frequency_table_version TEXT,
      result TEXT NOT NULL
    );
  `);
  dbInstance = db;
  return db;
}

/** 关闭并在指定路径重新打开（主要供测试隔离使用）。 */
export function resetDatabase(dbPath: string): DatabaseSync {
  dbInstance?.close();
  dbInstance = null;
  return openDatabase(dbPath);
}

export interface ExperimentRecord {
  id: number;
  created_at: string;
  kind: string;
  input_text: string;
  params: unknown;
  frequency_table_version: string | null;
  result: unknown;
}

export function saveExperiment(input: {
  kind: string;
  inputText: string;
  params: unknown;
  frequencyTableVersion?: string | null;
  result: unknown;
}): number {
  const db = openDatabase();
  const stmt = db.prepare(`
    INSERT INTO experiments (created_at, kind, input_text, params, frequency_table_version, result)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const info = stmt.run(
    new Date().toISOString(),
    input.kind,
    input.inputText,
    JSON.stringify(input.params),
    input.frequencyTableVersion ?? null,
    JSON.stringify(input.result),
  );
  return Number(info.lastInsertRowid);
}

export function getExperiment(id: number): ExperimentRecord | null {
  const db = openDatabase();
  const row = db
    .prepare("SELECT * FROM experiments WHERE id = ?")
    .get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return hydrate(row);
}

export function listExperiments(limit = 50): ExperimentRecord[] {
  const db = openDatabase();
  const rows = db
    .prepare("SELECT * FROM experiments ORDER BY id DESC LIMIT ?")
    .all(limit) as Array<Record<string, unknown>>;
  return rows.map(hydrate);
}

function hydrate(row: Record<string, unknown>): ExperimentRecord {
  return {
    id: Number(row.id),
    created_at: String(row.created_at),
    kind: String(row.kind),
    input_text: String(row.input_text),
    params: JSON.parse(String(row.params)),
    frequency_table_version:
      row.frequency_table_version == null
        ? null
        : String(row.frequency_table_version),
    result: JSON.parse(String(row.result)),
  };
}
