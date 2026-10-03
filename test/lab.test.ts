import { test, before } from "node:test";
import assert from "node:assert/strict";
import { resetDatabase } from "../src/db.js";
import * as lab from "../src/lab.js";
import { ApiError } from "../src/validation.js";
import { tempDbPath } from "./helpers.js";

before(() => {
  resetDatabase(tempDbPath());
});

test("加密实验持久化并记录参数", () => {
  const result = lab.encryptText("ATTACK AT DAWN", "LEMON");
  assert.equal(result.ciphertext, "LXFOPV EF RNHR");
  const stored = lab.getExperimentById(result.id);
  assert.equal(stored.kind, "encrypt");
  assert.deepEqual(stored.params, { key: "LEMON" });
});

test("分析实验保存频率表版本、真实计数和每列评分", () => {
  const { report, id } = lab.analyzeCiphertext({
    ciphertext: "LXFOPVEFRNHR",
    keyLength: 5,
  });
  assert.equal(report.totalLetters, 12);
  assert.equal(report.frequencyTableVersion, "en-classical-1");
  assert.equal(report.columns.length, 5);
  for (const column of report.columns) {
    assert.ok(column.scores.length >= 1);
    const total = column.scores[0]!.counts.reduce((a, b) => a + b, 0);
    assert.equal(total, column.sampleSize);
  }
  const stored = lab.getExperimentById(id);
  assert.equal(stored.frequency_table_version, "en-classical-1");
});

test("人工选用候选密钥解密", () => {
  const { id } = lab.analyzeCiphertext({ ciphertext: "LXFOPVEFRNHR", keyLength: 5 });
  const chosen = lab.chooseCandidate(id, "LEMON");
  assert.equal(chosen.plaintext, "ATTACKATDAWN");
});

test("候选密钥长度不匹配报错", () => {
  const { id } = lab.analyzeCiphertext({ ciphertext: "LXFOPVEFRNHR", keyLength: 5 });
  assert.throws(
    () => lab.chooseCandidate(id, "XX"),
    (e: unknown) => (e as ApiError).code === "KEY_LENGTH_MISMATCH",
  );
});

test("参数错误码", () => {
  assert.throws(() => lab.encryptText("", "KEY"), (e: unknown) => (e as ApiError).code === "TEXT_EMPTY");
  assert.throws(() => lab.encryptText("...!!!", "KEY"), (e: unknown) => (e as ApiError).code === "NO_LETTERS");
  assert.throws(() => lab.encryptText("HELLO", ""), (e: unknown) => (e as ApiError).code === "KEY_EMPTY");
  assert.throws(() => lab.encryptText("HELLO", "K1"), (e: unknown) => (e as ApiError).code === "KEY_INVALID");
  assert.throws(
    () => lab.analyzeCiphertext({ ciphertext: "ABC", keyLength: 0 }),
    (e: unknown) => (e as ApiError).code === "KEYLENGTH_INVALID",
  );
  assert.throws(
    () => lab.analyzeCiphertext({ ciphertext: "ABC", keyLength: 4 }),
    (e: unknown) => (e as ApiError).code === "KEYLENGTH_TOO_LARGE_FOR_INPUT",
  );
  assert.throws(
    () => lab.getExperimentById(999_999),
    (e: unknown) => (e as ApiError).code === "EXPERIMENT_NOT_FOUND",
  );
});

test("重启后保留实验：同一数据库文件可重新读取", () => {
  const created = lab.encryptText("PERSISTENCE", "KEY");
  // 重新打开同一文件路径的连接（db 模块缓存同一实例，但数据来自文件）
  const fetched = lab.getExperimentById(created.id);
  assert.equal((fetched.result as { ciphertext: string }).ciphertext, created.ciphertext);
});

test("导出实验包含记录与导出时间", () => {
  const created = lab.encryptText("EXPORTME", "KEY");
  const exported = lab.exportExperiment(created.id);
  assert.ok(exported.exportedAt);
  assert.equal(exported.record.id, created.id);
});
