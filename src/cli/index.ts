#!/usr/bin/env node
import {
  encrypt as vigenereEncrypt,
  decrypt as vigenereDecrypt,
} from "../crypto/vigenere.js";
import { analyzeColumns, loadFrequencyTable } from "../crypto/frequency.js";
import { extractLettersUpperCase } from "../crypto/vigenere.js";
import * as lab from "../lab.js";
import { ApiError } from "../validation.js";
import {
  KNOWN_CIPHERTEXT,
  KNOWN_KEY,
  KNOWN_PLAINTEXT,
  SAMPLE_PLAINTEXT,
  SAMPLE_SHORT_TEXT,
} from "../data/sample.js";

function printJson(value: unknown) {
  process.stdout.write(JSON.stringify(value, null, 2) + "\n");
}

function fail(error: unknown): never {
  if (error instanceof ApiError) {
    process.stderr.write(`错误 [${error.code}] ${error.message}\n`);
  } else if (error instanceof Error) {
    process.stderr.write(`错误 ${error.message}\n`);
  } else {
    process.stderr.write(`未知错误\n`);
  }
  process.exit(1);
}

function parseFlags(args: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    const token = args[i]!;
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = args[i + 1];
      if (next !== undefined && !next.startsWith("--")) {
        flags[key] = next;
        i += 1;
      } else {
        flags[key] = "true";
      }
    }
  }
  return flags;
}

function requireFlag(flags: Record<string, string>, key: string): string {
  if (flags[key] === undefined) throw new ApiError("MISSING_PARAM", `缺少必填参数 --${key}`);
  return flags[key];
}

const help = `vigenere-lab —— 经典加法维吉尼亚密码教学工具（离线，仅虚构/显式数据）

用法:
  node dist/cli/index.js encrypt --text "ATTACK AT DAWN" --key LEMON
  node dist/cli/index.js decrypt --text LXFOPVEFRNHR --key LEMON
  node dist/cli/index.js analyze --text <密文> --key-length 5 [--top-k 3] [--max-combinations 100]
  node dist/cli/index.js columns --id <分析实验ID>
  node dist/cli/index.js choose --id <分析实验ID> --key <候选密钥>
  node dist/cli/index.js get --id <实验ID>
  node dist/cli/index.js list [--limit 20]
  node dist/cli/index.js export --id <实验ID>
  node dist/cli/index.js meta
  node dist/cli/index.js demo

说明:
  分析报告中卡方分数越小越匹配英文频率；第一名候选不是确定答案。
`;

function printColumns(report: ReturnType<typeof lab.analyzeCiphertext>["report"]) {
  process.stdout.write(
    `keyLength=${report.keyLength}, letters=${report.totalLetters}, 频率表=${report.frequencyTableVersion}\n`,
  );
  for (const column of report.columns) {
    process.stdout.write(
      `\n列 ${column.columnIndex}: 样本=${column.sampleSize}, 证据=${column.evidence}, 次优差距=${column.margin.toFixed(2)}\n`,
    );
    for (const score of column.scores) {
      process.stdout.write(
        `  密钥字母 ${score.keyLetter} (shift=${score.shift}) 卡方=${score.score.toFixed(2)}\n`,
      );
    }
  }
  process.stdout.write(`\n组合候选密钥（分数越小越匹配）:\n`);
  for (const candidate of report.keyCandidates.slice(0, 10)) {
    process.stdout.write(`  ${candidate.key}  合计卡方=${candidate.score.toFixed(2)}\n`);
  }
  process.stdout.write(`\n提示: ${report.note}\n`);
}

function runDemo() {
  process.stdout.write("=== 演示 1：已知向量 ATTACKATDAWN + LEMON ===\n");
  const cipher = vigenereEncrypt({ text: KNOWN_PLAINTEXT, key: KNOWN_KEY });
  process.stdout.write(`密文: ${cipher}（期望 ${KNOWN_CIPHERTEXT}）\n`);
  const back = vigenereDecrypt({ text: cipher, key: KNOWN_KEY });
  process.stdout.write(`解密回原文: ${back}\n`);
  process.stdout.write(
    `带大小写/标点: ${vigenereEncrypt({ text: "Attack at dawn!", key: KNOWN_KEY })}\n\n`,
  );

  process.stdout.write("=== 演示 2：足够长的内置英文材料（已知长度分析）===\n");
  const table = loadFrequencyTable();
  const demoKey = "ORCHID";
  const demoCipher = vigenereEncrypt({ text: SAMPLE_PLAINTEXT, key: demoKey });
  const letters = extractLettersUpperCase(demoCipher);
  const report = analyzeColumns({
    letters,
    keyLength: demoKey.length,
    topKPerColumn: 3,
    maxCombinations: 50,
  });
  printColumns(report);
  process.stdout.write(`真实密钥: ${demoKey}\n\n`);

  process.stdout.write("=== 演示 3：短文本证据不足 ===\n");
  const shortCipher = vigenereEncrypt({ text: SAMPLE_SHORT_TEXT, key: "ABC" });
  const shortLetters = extractLettersUpperCase(shortCipher);
  const shortReport = analyzeColumns({
    letters: shortLetters,
    keyLength: 2,
    topKPerColumn: 3,
    maxCombinations: 20,
  });
  printColumns(shortReport);
  process.stdout.write(`频率表版本: ${table.version}\n`);
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(help);
    return;
  }
  switch (command) {
    case "encrypt": {
      printJson(lab.encryptText(requireFlag(flags, "text"), requireFlag(flags, "key")));
      break;
    }
    case "decrypt": {
      printJson(lab.decryptText(requireFlag(flags, "text"), requireFlag(flags, "key")));
      break;
    }
    case "analyze": {
      const result = lab.analyzeCiphertext({
        ciphertext: requireFlag(flags, "text"),
        keyLength: Number(requireFlag(flags, "key-length")),
        topK: flags["top-k"] === undefined ? undefined : Number(flags["top-k"]),
        maxCombinations:
          flags["max-combinations"] === undefined
            ? undefined
            : Number(flags["max-combinations"]),
      });
      if (flags.format === "json") {
        printJson(result);
      } else {
        process.stdout.write(`实验ID: ${result.id}\n`);
        printColumns(result.report);
      }
      break;
    }
    case "columns": {
      const record = lab.getExperimentById(Number(requireFlag(flags, "id")));
      if (record.kind !== "analyze") {
        throw new ApiError("EXPERIMENT_WRONG_KIND", "该实验不是分析实验。");
      }
      printColumns(record.result as ReturnType<typeof lab.analyzeCiphertext>["report"]);
      break;
    }
    case "choose": {
      printJson(
        lab.chooseCandidate(
          Number(requireFlag(flags, "id")),
          requireFlag(flags, "key"),
        ),
      );
      break;
    }
    case "get": {
      printJson(lab.getExperimentById(Number(requireFlag(flags, "id"))));
      break;
    }
    case "list": {
      printJson(lab.listAllExperiments(flags.limit === undefined ? undefined : Number(flags.limit)));
      break;
    }
    case "export": {
      printJson(lab.exportExperiment(Number(requireFlag(flags, "id"))));
      break;
    }
    case "meta": {
      printJson(lab.getMeta());
      break;
    }
    case "demo": {
      runDemo();
      break;
    }
    default:
      throw new ApiError("UNKNOWN_COMMAND", `未知命令: ${command}\n\n${help}`);
  }
}

main().catch(fail);
