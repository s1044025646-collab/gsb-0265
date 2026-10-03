import { ApiError, checkInputSize, validateKey } from './errors.js';

const A_UPPER = 65;
const A_LOWER = 97;

function isUpperAlpha(c: number): boolean {
  return c >= 65 && c <= 90;
}
function isLowerAlpha(c: number): boolean {
  return c >= 97 && c <= 122;
}

/**
 * 经典加法维吉尼亚。字母映射 A=0..Z=25，密钥循环相加/相减取模 26。
 * 保留英文字母的大小写；标点、空格、数字等原样保留且不推进密钥位置。
 */
export function crypt(text: string, key: string, direction: 1 | -1): string {
  checkInputSize(text);
  const normKey = validateKey(key);
  const shifts = [...normKey].map((c) => c.charCodeAt(0) - A_UPPER);
  const out: string[] = [];
  let pos = 0;
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (isUpperAlpha(code)) {
      out.push(String.fromCharCode(((code - A_UPPER + direction * shifts[pos % shifts.length] + 26) % 26) + A_UPPER));
      pos++;
    } else if (isLowerAlpha(code)) {
      out.push(String.fromCharCode(((code - A_LOWER + direction * shifts[pos % shifts.length] + 26) % 26) + A_LOWER));
      pos++;
    } else {
      out.push(ch);
    }
  }
  return out.join('');
}

export function encrypt(text: string, key: string): string {
  return crypt(text, key, 1);
}

export function decrypt(text: string, key: string): string {
  return crypt(text, key, -1);
}

/** 只提取英文字母（统一大写），与分析时的列分组位置定义一致。 */
export function lettersOnly(text: string): string {
  let out = '';
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (isUpperAlpha(code)) out += ch;
    else if (isLowerAlpha(code)) out += String.fromCharCode(code - 32);
  }
  return out;
}

export function requireLetters(text: string): string {
  const letters = lettersOnly(text);
  if (letters.length === 0) {
    throw new ApiError('NO_LETTERS', '输入中没有任何英文字母，无法处理');
  }
  return letters;
}
