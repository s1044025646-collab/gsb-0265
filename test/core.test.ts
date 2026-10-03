import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encrypt, decrypt, lettersOnly } from '../src/vigenere.js';
import { analyze, chiSquareForShift } from '../src/analyze.js';
import { ApiError } from '../src/errors.js';
import { SAMPLE_TEXT, SAMPLE_KEY } from '../src/sampleText.js';
import { saveExperiment, getExperiment } from '../src/db.js';

test('已知向量: ATTACKATDAWN + LEMON = LXFOPVEFRNHR', () => {
  assert.equal(encrypt('ATTACKATDAWN', 'LEMON'), 'LXFOPVEFRNHR');
  assert.equal(decrypt('LXFOPVEFRNHR', 'LEMON'), 'ATTACKATDAWN');
});

test('模 26 回绕: Z + B = A', () => {
  assert.equal(encrypt('Z', 'B'), 'A');
  assert.equal(decrypt('A', 'B'), 'Z');
  assert.equal(encrypt('XYZ', 'ZZZ'), 'WXY');
});

test('大小写保留，标点空格不推进密钥', () => {
  const ct = encrypt('Attack, at dawn!', 'lemon');
  assert.equal(ct, 'Lxfopv, ef rnhr!');
  assert.equal(decrypt(ct, 'LEMON'), 'Attack, at dawn!');
});

test('重复密钥与往返', () => {
  const key = 'KEYKEY';
  const text = 'The quick brown fox jumps over the lazy dog!';
  assert.equal(decrypt(encrypt(text, key), key), text);
  assert.equal(encrypt('AAAA', 'AAAA'), 'AAAA');
});

test('非法参数诊断', () => {
  assert.throws(() => encrypt('abc', ''), (e: ApiError) => e.code === 'EMPTY_KEY');
  assert.throws(() => encrypt('abc', 'K3Y'), (e: ApiError) => e.code === 'NON_ALPHA_KEY');
  assert.throws(() => encrypt('abc', 'A'.repeat(65)), (e: ApiError) => e.code === 'KEY_TOO_LONG');
  assert.throws(() => analyze('12345 !!!', 2), (e: ApiError) => e.code === 'NO_LETTERS');
  assert.throws(() => analyze('ABC', 0), (e: ApiError) => e.code === 'INVALID_KEY_LENGTH');
  assert.throws(() => analyze('ABC', 2.5), (e: ApiError) => e.code === 'INVALID_KEY_LENGTH');
  assert.throws(() => analyze('ABC', 41), (e: ApiError) => e.code === 'INVALID_KEY_LENGTH');
});

test('lettersOnly 与列分组只统计字母', () => {
  assert.equal(lettersOnly('A b!c, Z.'), 'ABCZ');
});

test('手工核对卡方: 单列 "A" shift=0', () => {
  // 手工计算: (1-0.08167)^2/0.08167 + sum(其余期望) = 10.32607 + 0.91833 = 11.2444
  const chi = chiSquareForShift('A', 0);
  assert.ok(Math.abs(chi - 11.2444) < 0.001, `实际 ${chi}`);
});


test('长文本已知长度分析: 组合最优应命中真实密钥', () => {
  const ct = encrypt(SAMPLE_TEXT, SAMPLE_KEY);
  const result = analyze(ct, SAMPLE_KEY.length);
  assert.equal(result.bestKey, SAMPLE_KEY);
  assert.equal(result.lowConfidence, false);
  assert.equal(result.columns.length, SAMPLE_KEY.length);
  // 每列 26 个移位评分齐全且升序
  for (const col of result.columns) {
    assert.equal(col.rankedShifts.length, 26);
    for (let i = 1; i < 26; i++) {
      assert.ok(col.rankedShifts[i].chiSquare >= col.rankedShifts[i - 1].chiSquare);
    }
    // 真实计数总和等于列字母数
    assert.equal(col.observedCounts.reduce((a, b) => a + b, 0), col.letterCount);
  }
});

test('短文本标记证据不足', () => {
  const ct = encrypt('MEET ME AT NOON', 'KEY');
  const result = analyze(ct, 3);
  assert.equal(result.lowConfidence, true);
  assert.ok(result.notes.length > 0);
});

test('相同输入排序稳定', () => {
  const ct = encrypt(SAMPLE_TEXT, SAMPLE_KEY);
  const a = analyze(ct, 5);
  const b = analyze(ct, 5);
  assert.deepEqual(a.bestKey, b.bestKey);
  assert.deepEqual(a.combinedCandidates, b.combinedCandidates);
});

test('实验记录持久化可回读', () => {
  const id = saveExperiment('encrypt', 'HELLO', { key: 'B' }, null, { ciphertext: 'IFMMP' });
  const row = getExperiment(id);
  assert.ok(row);
  assert.equal(row.kind, 'encrypt');
  assert.equal(JSON.parse(row.result).ciphertext, 'IFMMP');
});

