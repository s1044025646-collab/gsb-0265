import { isEnglishLetter } from "./crypto/vigenere.js";

export const LIMITS = {
  MAX_TEXT_LENGTH: 100_000,
  MAX_KEY_LENGTH: 128,
  MAX_KEY_LENGTH_ANALYSIS: 64,
  MAX_TOP_K: 26,
  MAX_COMBINATIONS: 1000,
} as const;

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;
  constructor(code: string, message: string, status = 400, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export function validateText(text: unknown): string {
  if (typeof text !== "string") {
    throw new ApiError("TEXT_INVALID", "text 必须是字符串。");
  }
  if (text.length === 0) {
    throw new ApiError("TEXT_EMPTY", "输入文本为空。");
  }
  if (text.length > LIMITS.MAX_TEXT_LENGTH) {
    throw new ApiError(
      "TEXT_TOO_LONG",
      `输入文本过长：${text.length} > ${LIMITS.MAX_TEXT_LENGTH} 字符上限。`,
    );
  }
  let letterCount = 0;
  for (const ch of text) {
    if (isEnglishLetter(ch)) letterCount += 1;
  }
  if (letterCount === 0) {
    throw new ApiError(
      "NO_LETTERS",
      "输入中没有任何英文字母，无法进行加解密或频率分析（标点和空格不参与运算）。",
    );
  }
  return text;
}

export function validateKeyLength(keyLength: unknown): number {
  if (typeof keyLength !== "number" || !Number.isInteger(keyLength)) {
    throw new ApiError("KEYLENGTH_INVALID", "keyLength 必须是整数。");
  }
  if (keyLength <= 0) {
    throw new ApiError("KEYLENGTH_INVALID", "keyLength 必须大于 0。");
  }
  if (keyLength > LIMITS.MAX_KEY_LENGTH_ANALYSIS) {
    throw new ApiError(
      "KEYLENGTH_TOO_LARGE",
      `keyLength 过大：${keyLength} > ${LIMITS.MAX_KEY_LENGTH_ANALYSIS} 分析上限。`,
      400,
    );
  }
  return keyLength;
}

export function validatePositiveInt(
  value: unknown,
  name: string,
  max: number,
  fallback: number,
): number {
  if (value === undefined || value === null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new ApiError("PARAM_INVALID", `${name} 必须是正整数。`);
  }
  if (value > max) {
    throw new ApiError("PARAM_INVALID", `${name} 不能超过 ${max}。`);
  }
  return value;
}
