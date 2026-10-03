/**
 * 经典加法型维吉尼亚密码。
 *
 * 规则：
 * - 字母映射 A..Z -> 0..25；
 * - 只有英文字母会推进密钥位置，非字母字符（标点、空格、数字等）原样保留，
 *   且不消耗密钥位置；
 * - 大小写保留：用原文对应字母的大小写输出；
 * - 密钥循环使用（key[i mod keyLength]）；
 * - 加密 C = (P + K) mod 26，解密 P = (C - K + 26) mod 26。
 */

export interface TransformOptions {
  text: string;
  key: string;
}

/** 判断字符是否为 A-Z / a-z。 */
export function isEnglishLetter(ch: string): boolean {
  return (ch >= "A" && ch <= "Z") || (ch >= "a" && ch <= "z");
}

/** 字母转 0..25（不区分大小写）。 */
export function letterToIndex(ch: string): number {
  const code = ch.charCodeAt(0);
  if (ch >= "A" && ch <= "Z") return code - 65;
  return code - 97;
}

/** 0..25 转大写字母。 */
export function indexToUpperLetter(index: number): string {
  return String.fromCharCode(65 + ((index % 26) + 26) % 26);
}

/** 校验并规范化密钥：必须为非空英文字母，统一转大写。 */
export function normalizeKey(key: unknown): string {
  if (typeof key !== "string") {
    throw new VigenereError("KEY_INVALID", "密钥必须是字符串。");
  }
  if (key.length === 0) {
    throw new VigenereError("KEY_EMPTY", "密钥不能为空。");
  }
  for (const ch of key) {
    if (!isEnglishLetter(ch)) {
      throw new VigenereError(
        "KEY_INVALID",
        `密钥只能包含英文字母，发现非法字符 ${JSON.stringify(ch)}。`,
      );
    }
  }
  return key.toUpperCase();
}

export class VigenereError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "VigenereError";
    this.code = code;
  }
}

function transform(text: string, normalizedKey: string, encrypt: boolean): string {
  const keyLength = normalizedKey.length;
  const keyShifts = [...normalizedKey].map(letterToIndex);
  let keyPosition = 0;
  let output = "";
  for (const ch of text) {
    if (isEnglishLetter(ch)) {
      const isUpper = ch >= "A" && ch <= "Z";
      const letterIndex = letterToIndex(ch);
      const shift = keyShifts[keyPosition % keyLength]!;
      const transformed = encrypt
        ? (letterIndex + shift) % 26
        : (letterIndex - shift + 26) % 26;
      const outLetter = indexToUpperLetter(transformed);
      output += isUpper ? outLetter : outLetter.toLowerCase();
      keyPosition += 1;
    } else {
      output += ch;
    }
  }
  return output;
}

export function encrypt(options: TransformOptions): string {
  const key = normalizeKey(options.key);
  return transform(options.text, key, true);
}

export function decrypt(options: TransformOptions): string {
  const key = normalizeKey(options.key);
  return transform(options.text, key, false);
}

/** 只提取有效字母（大写），用于分析；与加解密的“密钥位置”定义一致。 */
export function extractLettersUpperCase(text: string): string {
  let result = "";
  for (const ch of text) {
    if (isEnglishLetter(ch)) result += ch.toUpperCase();
  }
  return result;
}
