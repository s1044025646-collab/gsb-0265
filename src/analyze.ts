import { ENGLISH_FREQ, FREQ_TABLE_VERSION } from './frequency.js';
import { decrypt, requireLetters } from './vigenere.js';
import { checkInputSize, validateKeyLength } from './errors.js';

export interface ShiftScore {
  shift: number; // 解密移位量，即密钥字母 A=0..Z=25
  keyLetter: string;
  chiSquare: number;
}

export interface ColumnAnalysis {
  columnIndex: number;
  letterCount: number;
  observedCounts: number[]; // 26 个字母的真实计数
  rankedShifts: ShiftScore[]; // 卡方升序，越小越匹配英文分布
  lowConfidence: boolean;
}

export interface AnalysisResult {
  freqTableVersion: string;
  keyLength: number;
  totalLetters: number;
  minLettersPerColumn: number;
  lowConfidence: boolean;
  notes: string[];
  columns: ColumnAnalysis[];
  /** 每列取第一名拼出的组合密钥（仅为统计最优，不保证正确） */
  bestKey: string;
  /** 组合候选：每列前几名的受控组合，按总卡方升序 */
  combinedCandidates: { key: string; totalChiSquare: number; plaintextPreview: string }[];
}

/** 每列字母数低于该值时标记证据不足 */
export const MIN_LETTERS_PER_COLUMN = 30;
const COMBINED_TOP_N = 3;
const MAX_COMBINED = 20;

/**
 * 卡方统计量：sum((observed - expected)^2 / expected)。
 * expected 来自内置英文频率表 x 列字母数。分数越小，说明该移位解密后的
 * 分布越接近普通英文；但排名第一不等于必然正确，短列尤其不可靠。
 */
export function chiSquareForShift(columnLetters: string, shift: number): number {
  const counts = new Array<number>(26).fill(0);
  for (const ch of columnLetters) {
    const idx = (ch.charCodeAt(0) - 65 - shift + 26) % 26;
    counts[idx]++;
  }
  const n = columnLetters.length;
  let chi = 0;
  for (let i = 0; i < 26; i++) {
    const expected = (ENGLISH_FREQ[i] / 100) * n;
    const diff = counts[i] - expected;
    chi += (diff * diff) / expected;
  }
  return chi;
}

export function analyze(ciphertext: string, keyLengthInput: number): AnalysisResult {
  checkInputSize(ciphertext, 'ciphertext');
  const keyLength = validateKeyLength(keyLengthInput);
  const letters = requireLetters(ciphertext);

  const columns: string[] = Array.from({ length: keyLength }, () => '');
  for (let i = 0; i < letters.length; i++) {
    columns[i % keyLength] += letters[i];
  }

  const notes: string[] = [];
  const columnResults: ColumnAnalysis[] = columns.map((col, idx) => {
    const observedCounts = new Array<number>(26).fill(0);
    for (const ch of col) observedCounts[ch.charCodeAt(0) - 65]++;
    const ranked: ShiftScore[] = [];
    for (let shift = 0; shift < 26; shift++) {
      ranked.push({
        shift,
        keyLetter: String.fromCharCode(65 + shift),
        chiSquare: Math.round(chiSquareForShift(col, shift) * 1000) / 1000,
      });
    }
    ranked.sort((a, b) => a.chiSquare - b.chiSquare || a.shift - b.shift);
    const lowConfidence = col.length < MIN_LETTERS_PER_COLUMN;
    if (lowConfidence) {
      notes.push(
        `第 ${idx} 列只有 ${col.length} 个字母（建议 >= ${MIN_LETTERS_PER_COLUMN}），统计证据不足，排名仅供参考`,
      );
    }
    return {
      columnIndex: idx,
      letterCount: col.length,
      observedCounts,
      rankedShifts: ranked,
      lowConfidence,
    };
  });

  const minLettersPerColumn = Math.min(...columnResults.map((c) => c.letterCount));
  const lowConfidence = columnResults.some((c) => c.lowConfidence);
  if (lowConfidence) {
    notes.unshift('样本量不足：部分列字母过少，卡方排名不稳定，不能把第一名当作正确密钥');
  }

  const bestKey = columnResults.map((c) => c.rankedShifts[0].keyLetter).join('');

  type Combo = { key: string; total: number };
  let combos: Combo[] = [{ key: '', total: 0 }];
  for (const col of columnResults) {
    const next: Combo[] = [];
    for (const combo of combos) {
      for (const s of col.rankedShifts.slice(0, COMBINED_TOP_N)) {
        next.push({ key: combo.key + s.keyLetter, total: combo.total + s.chiSquare });
      }
    }
    next.sort((a, b) => a.total - b.total || (a.key < b.key ? -1 : 1));
    combos = next.slice(0, MAX_COMBINED);
  }
  const combinedCandidates = combos.map((c) => ({
    key: c.key,
    totalChiSquare: Math.round(c.total * 1000) / 1000,
    plaintextPreview: decrypt(letters.slice(0, 80), c.key),
  }));

  return {
    freqTableVersion: FREQ_TABLE_VERSION,
    keyLength,
    totalLetters: letters.length,
    minLettersPerColumn,
    lowConfidence,
    notes,
    columns: columnResults,
    bestKey,
    combinedCandidates,
  };
}
