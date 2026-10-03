import { readFileSync, writeFileSync } from 'node:fs';
import { encrypt, decrypt } from './vigenere.js';
import { analyze, AnalysisResult } from './analyze.js';
import { FREQ_TABLE_VERSION } from './frequency.js';
import { ApiError } from './errors.js';
import { saveExperiment, getExperiment, listExperiments, DB_PATH } from './db.js';
import { startServer } from './server.js';
import { SAMPLE_TEXT, SAMPLE_KEY } from './sampleText.js';

function argValue(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
}

function readTextArg(args: string[], valueName = 'text'): string {
  const inline = argValue(args, valueName);
  if (inline !== undefined) return inline;
  const file = argValue(args, 'file');
  if (file !== undefined) return readFileSync(file, 'utf8');
  throw new ApiError('BAD_REQUEST', `请通过 --${valueName} 或 --file 提供输入文本`);
}

function printAnalysis(result: AnalysisResult, showAllShifts: boolean): void {
  console.log(`频率表版本: ${result.freqTableVersion}`);
  console.log(`密钥长度: ${result.keyLength}，总字母数: ${result.totalLetters}，最少列字母数: ${result.minLettersPerColumn}`);
  if (result.lowConfidence) console.log('!! 证据不足：结果仅供参考，不能把第一名当作正确密钥');
  for (const note of result.notes) console.log(`   - ${note}`);
  console.log(`组合最优密钥（统计意义，不保证正确）: ${result.bestKey}`);
  console.log('组合候选 Top:');
  for (const c of result.combinedCandidates.slice(0, 5)) {
    console.log(`   ${c.key}  totalChi2=${c.totalChiSquare}  预览: ${c.plaintextPreview.slice(0, 50)}...`);
  }
  for (const col of result.columns) {
    console.log(`列 ${col.columnIndex}（${col.letterCount} 字母）计数: [${col.observedCounts.join(',')}]`);
    const shifts = showAllShifts ? col.rankedShifts : col.rankedShifts.slice(0, 5);
    for (const s of shifts) {
      console.log(`   ${s.keyLetter} (shift=${s.shift})  chi2=${s.chiSquare}`);
    }
    if (!showAllShifts) console.log('   ...（加 --all 显示全部 26 个移位）');
  }
}

async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  switch (cmd) {
    case 'serve': {
      const port = Number(argValue(args, 'port') ?? '0'); // 默认 0 = 自动选空闲端口
      const actual = await startServer(port);
      console.log(`API 服务已启动: http://127.0.0.1:${actual}  (数据库: ${DB_PATH})`);
      break;
    }
    case 'encrypt': {
      const text = readTextArg(args);
      const key = argValue(args, 'key');
      if (!key) throw new ApiError('BAD_REQUEST', '缺少 --key');
      const ciphertext = encrypt(text, key);
      const id = saveExperiment('encrypt', text, { key }, null, { ciphertext });
      console.log(JSON.stringify({ id, ciphertext }, null, 2));
      break;
    }
    case 'decrypt': {
      const text = readTextArg(args);
      const key = argValue(args, 'key');
      if (!key) throw new ApiError('BAD_REQUEST', '缺少 --key');
      const plaintext = decrypt(text, key);
      const id = saveExperiment('decrypt', text, { key }, null, { plaintext });
      console.log(JSON.stringify({ id, plaintext }, null, 2));
      break;
    }
    case 'analyze': {
      const ciphertext = readTextArg(args, 'ciphertext');
      const keyLength = Number(argValue(args, 'key-length'));
      const result = analyze(ciphertext, keyLength);
      const id = saveExperiment('analyze', ciphertext, { keyLength }, FREQ_TABLE_VERSION, result);
      console.log(`实验已保存，id=${id}`);
      printAnalysis(result, args.includes('--all'));
      break;
    }
    case 'list': {
      console.log(JSON.stringify(listExperiments(), null, 2));
      break;
    }
    case 'show': {
      const id = Number(argValue(args, 'id'));
      const row = getExperiment(id);
      if (!row) throw new ApiError('NOT_FOUND', `实验 ${id} 不存在`, 404);
      console.log(JSON.stringify({ ...row, params: JSON.parse(row.params), result: JSON.parse(row.result) }, null, 2));
      break;
    }
    case 'decrypt-with-key': {
      const id = Number(argValue(args, 'id'));
      const key = argValue(args, 'key');
      if (!key) throw new ApiError('BAD_REQUEST', '缺少 --key');
      const row = getExperiment(id);
      if (!row) throw new ApiError('NOT_FOUND', `实验 ${id} 不存在`, 404);
      const plaintext = decrypt(row.input_text, key);
      const newId = saveExperiment('manual-decrypt', row.input_text, { key, basedOnExperiment: row.id }, row.freq_version, { plaintext });
      console.log(JSON.stringify({ id: newId, basedOnExperiment: row.id, key: key.toUpperCase(), plaintext }, null, 2));
      break;
    }
    case 'export': {
      const id = Number(argValue(args, 'id'));
      const row = getExperiment(id);
      if (!row) throw new ApiError('NOT_FOUND', `实验 ${id} 不存在`, 404);
      const out = argValue(args, 'out') ?? `experiment-${id}.json`;
      writeFileSync(out, JSON.stringify({ ...row, params: JSON.parse(row.params), result: JSON.parse(row.result) }, null, 2), 'utf8');
      console.log(`已导出到 ${out}`);
      break;
    }
    case 'demo': {
      console.log('=== 1. 已知向量: ATTACKATDAWN + LEMON ===');
      const ct = encrypt('ATTACKATDAWN', 'LEMON');
      console.log(`密文: ${ct}（期望 LXFOPVEFRNHR）`);
      console.log(`解密回原文: ${decrypt(ct, 'LEMON')}`);

      console.log('\n=== 2. 内置长英文材料，已知密钥长度分析 ===');
      const sampleCt = encrypt(SAMPLE_TEXT, SAMPLE_KEY);
      const result = analyze(sampleCt, SAMPLE_KEY.length);
      const id = saveExperiment('analyze', sampleCt, { keyLength: SAMPLE_KEY.length }, FREQ_TABLE_VERSION, result);
      console.log(`内置材料以密钥 ${SAMPLE_KEY} 加密（实验 id=${id}）`);
      printAnalysis(result, false);

      console.log('\n=== 3. 短文本不可靠示例 ===');
      const shortCt = encrypt('MEET ME AT NOON', 'KEY');
      const shortResult = analyze(shortCt, 3);
      console.log(`短密文: ${shortCt}`);
      console.log(`lowConfidence=${shortResult.lowConfidence}，bestKey=${shortResult.bestKey}（真实密钥 KEY，统计结果可能不同，属于正常现象）`);
      break;
    }
    default:
      console.log(`用法: node dist/src/cli.js <命令> [参数]
命令:
  serve [--port N]                启动 API 服务（默认自动选空闲端口）
  encrypt --text T --key K        加密（或 --file 读文件）
  decrypt --text T --key K        解密
  analyze --ciphertext C --key-length N [--all]   已知长度候选分析
  list                            列出实验
  show --id N                     查看实验详情
  decrypt-with-key --id N --key K 人工选用候选密钥解密
  export --id N [--out file]      导出实验 JSON
  demo                            运行内置演示`);
  }
}

main().catch((err) => {
  if (err instanceof ApiError) {
    console.error(`错误 [${err.code}] ${err.message}`);
    process.exit(2);
  }
  console.error(err);
  process.exit(1);
});
