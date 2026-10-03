export type ErrorCode =
  | 'EMPTY_KEY'
  | 'NON_ALPHA_KEY'
  | 'KEY_TOO_LONG'
  | 'NO_LETTERS'
  | 'INPUT_TOO_LARGE'
  | 'INVALID_KEY_LENGTH'
  | 'NOT_FOUND'
  | 'BAD_REQUEST';

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const MAX_INPUT_CHARS = 200_000;
export const MAX_KEY_LENGTH = 64;
export const MAX_ANALYZE_KEY_LENGTH = 40;

export function checkInputSize(text: unknown, field = 'text'): asserts text is string {
  if (typeof text !== 'string') {
    throw new ApiError('BAD_REQUEST', `参数 ${field} 必须是字符串`);
  }
  if (text.length > MAX_INPUT_CHARS) {
    throw new ApiError('INPUT_TOO_LARGE', `输入过长：${text.length} 字符，上限 ${MAX_INPUT_CHARS}`);
  }
}

export function validateKey(key: unknown): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new ApiError('EMPTY_KEY', '密钥不能为空，且必须只包含英文字母');
  }
  if (!/^[A-Za-z]+$/.test(key)) {
    throw new ApiError('NON_ALPHA_KEY', '密钥只能包含英文字母 A-Z / a-z');
  }
  if (key.length > MAX_KEY_LENGTH) {
    throw new ApiError('KEY_TOO_LONG', `密钥过长：${key.length} 个字母，上限 ${MAX_KEY_LENGTH}`);
  }
  return key.toUpperCase();
}

export function validateKeyLength(len: unknown): number {
  if (typeof len !== 'number' || !Number.isInteger(len) || len < 1) {
    throw new ApiError('INVALID_KEY_LENGTH', '密钥长度必须是 >= 1 的整数');
  }
  if (len > MAX_ANALYZE_KEY_LENGTH) {
    throw new ApiError('INVALID_KEY_LENGTH', `密钥长度过大：${len}，上限 ${MAX_ANALYZE_KEY_LENGTH}`);
  }
  return len;
}
