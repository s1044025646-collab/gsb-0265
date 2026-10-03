/**
 * 按密钥位置分组的频率分析与卡方评分。
 *
 * 步骤：
 * 1. 取密文中的有效英文字母（忽略大小写与非字母字符；非字母不占列位置）；
 * 2. 按字母序号 mod keyLength 分为 keyLength 列，每列对应密钥的一个位置；
 * 3. 对每列枚举 26 种移位 shift（即假设该列密钥字母），把列内字母反向移位后
 *    统计 A..Z 计数，并与内置英文频率表比较，计算卡方差异：
 *
 *      chi2 = Σ (observed_i - expected_i)^2 / expected_i
 *
 *    expected_i = N * (freq_i / 100)，N 为该列字母总数；
 * 4. 分数越小表示与英文分布越吻合。卡方只是启发式排序，不能证明答案正确。
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { indexToUpperLetter, letterToIndex } from "./vigenere.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export interface FrequencyTable {
  version: string;
  language: string;
  description: string;
  frequencies: Record<string, number>;
}

let cachedTable: FrequencyTable | null = null;

export function loadFrequencyTable(): FrequencyTable {
  if (cachedTable) return cachedTable;
  const candidates = [
    resolve(__dirname, "../../data/frequency-en.json"),
    resolve(__dirname, "../data/frequency-en.json"),
    resolve(process.cwd(), "data/frequency-en.json"),
  ];
  for (const path of candidates) {
    try {
      const parsed = JSON.parse(readFileSync(path, "utf8")) as FrequencyTable;
      const table = normalizeTable(parsed);
      cachedTable = table;
      return table;
    } catch {
      // try next candidate
    }
  }
  throw new Error("找不到英文频率表 data/frequency-en.json");
}

function normalizeTable(parsed: FrequencyTable): FrequencyTable {
  const frequencies: Record<string, number> = {};
  let sum = 0;
  for (let i = 0; i < 26; i++) {
    const letter = indexToUpperLetter(i);
    const value = parsed.frequencies[letter];
    if (typeof value !== "number" || value < 0) {
      throw new Error(`频率表中 ${letter} 的频率无效`);
    }
    frequencies[letter] = value;
    sum += value;
  }
  if (Math.abs(sum - 100) > 0.5) {
    throw new Error(`频率表百分比之和应为约 100，实际为 ${sum}`);
  }
  return {
    version: parsed.version,
    language: parsed.language,
    description: parsed.description,
    frequencies,
  };
}

export interface ShiftScore {
  shift: number;
  keyLetter: string;
  score: number;
  counts: number[];
}

export interface ColumnReport {
  columnIndex: number;
  sampleSize: number;
  scores: ShiftScore[];
  bestShift: number;
  bestKeyLetter: string;
  bestScore: number;
  /** 证据等级：small 样本太少；weak 分数区分度弱；moderate 有一定区分度。 */
  evidence: "small" | "weak" | "moderate";
  /** 第一名与第二名分数差，用于判断区分度。 */
  margin: number;
}

export interface AnalysisReport {
  keyLength: number;
  totalLetters: number;
  frequencyTableVersion: string;
  columns: ColumnReport[];
  topKey: string;
  topKeyScore: number;
  /** 组合候选密钥及合计分数，按分数稳定升序。 */
  keyCandidates: Array<{ key: string; score: number }>;
  note: string;
}

export interface AnalyzeOptions {
  letters: string;
  keyLength: number;
  topKPerColumn?: number;
  maxCombinations?: number;
}

export const SMALL_SAMPLE_THRESHOLD = 25;

export function analyzeColumns(options: AnalyzeOptions): AnalysisReport {
  const { letters, keyLength } = options;
  const topKPerColumn = options.topKPerColumn ?? 3;
  const maxCombinations = options.maxCombinations ?? 100;
  const table = loadFrequencyTable();
  const freq = Array.from({ length: 26 }, (_, i) => {
    const letter = indexToUpperLetter(i);
    return table.frequencies[letter]! / 100;
  });

  const columns: number[][] = Array.from({ length: keyLength }, () => []);
  for (let i = 0; i < letters.length; i++) {
    columns[i % keyLength]!.push(letterToIndex(letters[i]!));
  }

  const reports: ColumnReport[] = columns.map((column, columnIndex) => {
    const n = column.length;
    const scores: ShiftScore[] = [];
    for (let shift = 0; shift < 26; shift++) {
      const counts = new Array<number>(26).fill(0);
      for (const cipherIndex of column) {
        const plainIndex = (cipherIndex - shift + 26) % 26;
        counts[plainIndex]! += 1;
      }
      let chi2 = 0;
      for (let i = 0; i < 26; i++) {
        const expected = n * freq[i]!;
        if (expected > 0) {
          const diff = counts[i]! - expected;
          chi2 += (diff * diff) / expected;
        }
      }
      scores.push({ shift, keyLetter: indexToUpperLetter(shift), score: chi2, counts });
    }
    // 稳定排序：分数升序，分数相同按 shift 升序。
    scores.sort((a, b) => a.score - b.score || a.shift - b.shift);
    const best = scores[0]!;
    const second = scores[1]!;
    // 第一名领先第二名的幅度（>=0）；越大说明头部候选区分度越强。
    const margin = second.score - best.score;
    let evidence: ColumnReport["evidence"];
    if (n < SMALL_SAMPLE_THRESHOLD) {
      evidence = "small";
    } else if (margin < 2) {
      evidence = "weak";
    } else {
      evidence = "moderate";
    }
    return {
      columnIndex,
      sampleSize: n,
      scores: scores.slice(0, Math.max(1, topKPerColumn)),
      bestShift: best.shift,
      bestKeyLetter: best.keyLetter,
      bestScore: best.score,
      evidence,
      margin,
    };
  });

  const topKey = reports.map((r) => r.bestKeyLetter).join("");
  const topKeyScore = reports.reduce((sum, r) => sum + r.bestScore, 0);
  const keyCandidates = combineCandidates(reports, topKPerColumn, maxCombinations);

  return {
    keyLength,
    totalLetters: letters.length,
    frequencyTableVersion: table.version,
    columns: reports,
    topKey,
    topKeyScore,
    keyCandidates,
    note:
      "卡方分数越小越接近内置英文频率分布；排名第一仅为统计最优候选，并非必然正确。" +
      "样本不足（evidence=small）或区分度弱（weak）的列应人工核对。",
  };
}

/**
 * 对各列前 topK 个移位做笛卡尔积，按合计分数稳定升序取前 maxCombinations 个。
 */
function combineCandidates(
  columns: ColumnReport[],
  topK: number,
  maxCombinations: number,
): Array<{ key: string; score: number }> {
  let combos: Array<{ key: string; score: number }> = [{ key: "", score: 0 }];
  for (const column of columns) {
    const next: Array<{ key: string; score: number }> = [];
    for (const combo of combos) {
      for (const scored of column.scores.slice(0, topK)) {
        next.push({
          key: combo.key + scored.keyLetter,
          score: combo.score + scored.score,
        });
      }
    }
    // 控制中间结果规模：按分数稳定排序后裁剪。
    next.sort(
      (a, b) =>
        a.score - b.score ||
        (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
    );
    combos = next.slice(0, maxCombinations);
  }
  return combos;
}
