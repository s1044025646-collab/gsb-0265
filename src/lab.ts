import {
  decrypt as vigenereDecrypt,
  encrypt as vigenereEncrypt,
  extractLettersUpperCase,
  normalizeKey,
} from "./crypto/vigenere.js";
import {
  analyzeColumns,
  loadFrequencyTable,
  type AnalysisReport,
} from "./crypto/frequency.js";
import {
  getExperiment,
  listExperiments,
  saveExperiment,
  type ExperimentRecord,
} from "./db.js";
import {
  ApiError,
  validateKeyLength,
  validatePositiveInt,
  validateText,
  LIMITS,
} from "./validation.js";
import {
  KNOWN_CIPHERTEXT,
  KNOWN_KEY,
  KNOWN_PLAINTEXT,
  SAMPLE_PLAINTEXT,
  SAMPLE_SHORT_TEXT,
} from "./data/sample.js";

export function encryptText(text: unknown, key: unknown) {
  const validText = validateText(text);
  const normalizedKey = normalizeKey(key);
  if (normalizedKey.length > LIMITS.MAX_KEY_LENGTH) {
    throw new ApiError(
      "KEY_TOO_LONG",
      `密钥过长：${normalizedKey.length} > ${LIMITS.MAX_KEY_LENGTH} 字符上限。`,
    );
  }
  const ciphertext = vigenereEncrypt({ text: validText, key: normalizedKey });
  const id = saveExperiment({
    kind: "encrypt",
    inputText: validText,
    params: { key: normalizedKey },
    result: { ciphertext },
  });
  return { id, ciphertext, key: normalizedKey };
}

export function decryptText(text: unknown, key: unknown) {
  const validText = validateText(text);
  const normalizedKey = normalizeKey(key);
  if (normalizedKey.length > LIMITS.MAX_KEY_LENGTH) {
    throw new ApiError("KEY_TOO_LONG", `密钥过长，上限 ${LIMITS.MAX_KEY_LENGTH} 字符。`);
  }
  const plaintext = vigenereDecrypt({ text: validText, key: normalizedKey });
  const id = saveExperiment({
    kind: "decrypt",
    inputText: validText,
    params: { key: normalizedKey },
    result: { plaintext },
  });
  return { id, plaintext, key: normalizedKey };
}

export interface AnalyzeInput {
  ciphertext?: unknown;
  keyLength?: unknown;
  topK?: unknown;
  maxCombinations?: unknown;
}

export function analyzeCiphertext(input: AnalyzeInput): {
  id: number;
  report: AnalysisReport;
} {
  const ciphertext = validateText(input.ciphertext);
  const keyLength = validateKeyLength(input.keyLength);
  const topK = validatePositiveInt(input.topK, "topK", LIMITS.MAX_TOP_K, 3);
  const maxCombinations = validatePositiveInt(
    input.maxCombinations,
    "maxCombinations",
    LIMITS.MAX_COMBINATIONS,
    100,
  );
  const letters = extractLettersUpperCase(ciphertext);
  if (keyLength > letters.length) {
    throw new ApiError(
      "KEYLENGTH_TOO_LARGE_FOR_INPUT",
      `keyLength=${keyLength} 大于有效字母数 ${letters.length}，至少有一列没有样本，无法分析。`,
    );
  }
  const report = analyzeColumns({ letters, keyLength, topKPerColumn: topK, maxCombinations });
  const id = saveExperiment({
    kind: "analyze",
    inputText: ciphertext,
    params: { keyLength, topK, maxCombinations },
    frequencyTableVersion: report.frequencyTableVersion,
    result: report,
  });
  return { id, report };
}

/** 人工选定候选密钥（或任意合法密钥），用其解密某次实验的密文。 */
export function chooseCandidate(
  experimentId: unknown,
  key: unknown,
): { id: number; sourceExperimentId: number; key: string; plaintext: string } {
  if (typeof experimentId !== "number" || !Number.isInteger(experimentId)) {
    throw new ApiError("EXPERIMENT_ID_INVALID", "experimentId 必须是整数。");
  }
  const source = getExperiment(experimentId);
  if (!source) {
    throw new ApiError("EXPERIMENT_NOT_FOUND", `实验 ${experimentId} 不存在。`, 404);
  }
  if (source.kind !== "analyze") {
    throw new ApiError(
      "EXPERIMENT_WRONG_KIND",
      `实验 ${experimentId} 不是分析实验（kind=${source.kind}），无法选用候选密钥。`,
    );
  }
  const normalizedKey = normalizeKey(key);
  if (normalizedKey.length > LIMITS.MAX_KEY_LENGTH) {
    throw new ApiError("KEY_TOO_LONG", `密钥过长，上限 ${LIMITS.MAX_KEY_LENGTH} 字符。`);
  }
  const report = source.result as AnalysisReport;
  if (normalizedKey.length !== report.keyLength) {
    throw new ApiError(
      "KEY_LENGTH_MISMATCH",
      `候选密钥长度 ${normalizedKey.length} 与分析时的 keyLength ${report.keyLength} 不一致。`,
    );
  }
  const plaintext = vigenereDecrypt({ text: source.input_text, key: normalizedKey });
  const newId = saveExperiment({
    kind: "decrypt",
    inputText: source.input_text,
    params: { key: normalizedKey, sourceExperimentId: experimentId },
    result: { plaintext },
  });
  return { id: newId, sourceExperimentId: experimentId, key: normalizedKey, plaintext };
}

export function getExperimentById(id: unknown): ExperimentRecord {
  if (typeof id !== "number" || !Number.isInteger(id)) {
    throw new ApiError("EXPERIMENT_ID_INVALID", "id 必须是整数。");
  }
  const record = getExperiment(id);
  if (!record) {
    throw new ApiError("EXPERIMENT_NOT_FOUND", `实验 ${id} 不存在。`, 404);
  }
  return record;
}

export function listAllExperiments(limit?: number) {
  const validLimit =
    limit === undefined ? 50 : validatePositiveInt(limit, "limit", 500, 50);
  return listExperiments(validLimit);
}

export function exportExperiment(id: unknown) {
  const record = getExperimentById(id);
  return {
    exportedAt: new Date().toISOString(),
    tool: "vigenere-lab",
    record,
  };
}

export function getMeta() {
  const table = loadFrequencyTable();
  return {
    name: "vigenere-lab",
    cipher: "classic-additive-vigenere",
    limits: LIMITS,
    frequencyTable: {
      version: table.version,
      language: table.language,
      description: table.description,
      frequencies: table.frequencies,
    },
    knownVector: {
      plaintext: KNOWN_PLAINTEXT,
      key: KNOWN_KEY,
      ciphertext: KNOWN_CIPHERTEXT,
    },
    sample: {
      longTextLength: SAMPLE_PLAINTEXT.length,
      shortText: SAMPLE_SHORT_TEXT,
    },
  };
}
