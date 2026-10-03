import { test } from "node:test";
import assert from "node:assert/strict";
import {
  decrypt,
  encrypt,
  extractLettersUpperCase,
  letterToIndex,
  normalizeKey,
  VigenereError,
} from "../src/crypto/vigenere.js";

test("已知向量: ATTACKATDAWN + LEMON = LXFOPVEFRNHR", () => {
  assert.equal(encrypt({ text: "ATTACKATDAWN", key: "LEMON" }), "LXFOPVEFRNHR");
  assert.equal(decrypt({ text: "LXFOPVEFRNHR", key: "LEMON" }), "ATTACKATDAWN");
});

test("模二十六回绕: Z + B = A，A - B = Z", () => {
  assert.equal(encrypt({ text: "Z", key: "B" }), "A");
  assert.equal(decrypt({ text: "A", key: "B" }), "Z");
});

test("保留大小写与标点，且标点不推进密钥位置", () => {
  const cipher = encrypt({ text: "Attack at dawn!", key: "LEMON" });
  assert.equal(cipher, "Lxfopv ef rnhr!");
  // 去掉标点后的字母序列与无标点版本一致
  const noPunct = encrypt({ text: "ATTACKATDAWN", key: "LEMON" });
  assert.equal(extractLettersUpperCase(cipher), noPunct);
  assert.equal(decrypt({ text: cipher, key: "LEMON" }), "Attack at dawn!");
});

test("密钥循环使用（长文本短密钥往返）", () => {
  const text = "THEQUICKBROWNFOXJUMPSOVERTHELAZYDOG".repeat(10);
  const key = "KEY";
  const cipher = encrypt({ text, key });
  assert.equal(decrypt({ text: cipher, key }), text);
});

test("密钥大小写不敏感，统一按大写处理", () => {
  assert.equal(
    encrypt({ text: "HELLO", key: "lemon" }),
    encrypt({ text: "HELLO", key: "LEMON" }),
  );
});

test("非法密钥诊断", () => {
  assert.throws(() => normalizeKey(""), (e: unknown) => (e as VigenereError).code === "KEY_EMPTY");
  assert.throws(() => normalizeKey("AB1"), (e: unknown) => (e as VigenereError).code === "KEY_INVALID");
  assert.throws(() => normalizeKey("A B"), (e: unknown) => (e as VigenereError).code === "KEY_INVALID");
});

test("letterToIndex 映射 A=0..Z=25", () => {
  assert.equal(letterToIndex("A"), 0);
  assert.equal(letterToIndex("Z"), 25);
  assert.equal(letterToIndex("a"), 0);
});
