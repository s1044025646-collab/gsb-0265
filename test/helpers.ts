import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export function tempDbPath(): string {
  const dir = mkdtempSync(join(tmpdir(), "vigenere-lab-"));
  return join(dir, "experiments.sqlite");
}
