import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

export type ExperimentKind = 'encrypt' | 'decrypt' | 'analyze' | 'manual-decrypt';

export interface ExperimentRow {
  id: number;
  created_at: string;
  kind: ExperimentKind;
  input_text: string;
  params: string; // JSON
  freq_version: string | null;
  result: string; // JSON
}

const DATA_DIR = process.env.VIGENERE_DATA_DIR ?? path.join(process.cwd(), 'data');
mkdirSync(DATA_DIR, { recursive: true });
const DB_PATH = path.join(DATA_DIR, 'vigenere.db');

export const db = new DatabaseSync(DB_PATH);
db.exec(`
CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  kind TEXT NOT NULL,
  input_text TEXT NOT NULL,
  params TEXT NOT NULL,
  freq_version TEXT,
  result TEXT NOT NULL
)`);

export function saveExperiment(
  kind: ExperimentKind,
  inputText: string,
  params: unknown,
  freqVersion: string | null,
  result: unknown,
): number {
  const stmt = db.prepare(
    'INSERT INTO experiments (kind, input_text, params, freq_version, result) VALUES (?, ?, ?, ?, ?)',
  );
  const info = stmt.run(kind, inputText, JSON.stringify(params), freqVersion, JSON.stringify(result));
  return Number(info.lastInsertRowid);
}

export function getExperiment(id: number): ExperimentRow | undefined {
  const stmt = db.prepare('SELECT * FROM experiments WHERE id = ?');
  return stmt.get(id) as unknown as ExperimentRow | undefined;
}

export function listExperiments(limit = 50): Omit<ExperimentRow, 'result' | 'input_text'>[] {
  const stmt = db.prepare(
    'SELECT id, created_at, kind, params, freq_version FROM experiments ORDER BY id DESC LIMIT ?',
  );
  return stmt.all(limit) as unknown as Omit<ExperimentRow, 'result' | 'input_text'>[];
}

export { DB_PATH };
