import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyzeColumns,
  loadFrequencyTable,
  SMALL_SAMPLE_THRESHOLD,
} from "../src/crypto/frequency.js";
import { encrypt, extractLettersUpperCase } from "../src/crypto/vigenere.js";
import { SAMPLE_PLAINTEXT } from "../src/data/sample.js";

test("手工计数小列：移位 A(0) 卡方为 0", () => {
  // 列内容 "AAAAA"：若明文真的全是 A，观察分布与英文频率表差异极大，
  // 但 shift=0 时计数必须是 A=5，且 26 个移位评分各自对应确定计数。
  const report = analyzeColumns({ letters: "AAAAA", keyLength: 1, topKPerColumn: 26 });
  const column = report.columns[0]!;
  const shiftZero = column.scores.find((s) => s.shift === 0)!;
  assert.equal(shiftZero.counts[0], 5);
  assert.equal(shiftZero.counts.slice(1).reduce((a, b) => a + b, 0), 0);
  assert.equal(column.evidence, "small");
});

test("手工卡方：观察计数等于期望计数时分数为 0", () => {
  // 构造一列密文：取 shift=0 时明文计数精确等于英文频率在 N 下的期望计数。
  const table = loadFrequencyTable();
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const N = 100_000;
  let columnLetters = "";
  for (const letter of letters) {
    const expected = Math.round((table.frequencies[letter]! / 100) * N);
    columnLetters += letter.repeat(expected);
  }
  const report = analyzeColumns({ letters: columnLetters, keyLength: 1, topKPerColumn: 26 });
  const best = report.columns[0]!.scores[0]!;
  assert.equal(best.shift, 0);
  assert.ok(best.score < 1, `期望卡方接近 0，实际 ${best.score}`);
  assert.notEqual(report.columns[0]!.evidence, "small");
});

test("长样本内置材料：真实密钥排在候选组合中", () => {
  const key = "ORCHID";
  const cipher = extractLettersUpperCase(encrypt({ text: SAMPLE_PLAINTEXT, key }));
  const report = analyzeColumns({
    letters: cipher,
    keyLength: key.length,
    topKPerColumn: 5,
    maxCombinations: 200,
  });
  assert.ok(report.totalLetters > 400);
  const keys = report.keyCandidates.map((c) => c.key);
  assert.ok(keys.includes(key), `候选中应包含真实密钥 ${key}，实际前几名: ${keys.slice(0, 5).join(",")}`);
  // 各列样本充足
  for (const column of report.columns) {
    assert.ok(column.sampleSize >= SMALL_SAMPLE_THRESHOLD);
    assert.notEqual(column.evidence, "small");
  }
});

test("短文本：列证据标为 small", () => {
  const cipher = extractLettersUpperCase(encrypt({ text: "Hi", key: "AB" }));
  const report = analyzeColumns({ letters: cipher, keyLength: 2, topKPerColumn: 3 });
  for (const column of report.columns) {
    assert.equal(column.evidence, "small");
  }
});

test("稳定排序：相同输入两次结果完全一致", () => {
  const cipher = extractLettersUpperCase(
    encrypt({ text: SAMPLE_PLAINTEXT, key: "SECRET" }),
  );
  const run1 = analyzeColumns({ letters: cipher, keyLength: 6 });
  const run2 = analyzeColumns({ letters: cipher, keyLength: 6 });
  assert.deepEqual(JSON.parse(JSON.stringify(run1)), JSON.parse(JSON.stringify(run2)));
});
