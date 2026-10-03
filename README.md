# 维吉尼亚密码离线实验服务（教学用）

一个**纯本地、离线**的古典维吉尼亚密码实验后端：TypeScript + Node.js + SQLite（Node 内置 `node:sqlite`），只提供 API 与 CLI，无前端、不联网、不依赖 Docker/WSL/外部服务。

> 本系统仅用于古典密码教学。维吉尼亚密码在现代意义下完全不安全，这里的"分析"是统计候选方法，**排名第一的候选不等于正确密钥**。

## 功能

- 经典加法维吉尼亚加解密：字母映射 A=0..Z=25，密钥循环相加取模 26
- 已知密钥长度时的候选密钥分析：按密钥位置把密文字母分列，对每列 26 种移位计算与内置英文频率表的卡方差异，按分数升序给出候选与组合密钥
- SQLite 持久化实验记录（原文/密文、参数、频率表版本、结果），重启后保留
- 明确的参数校验与错误码；可配置端口（默认自动选空闲端口）；数据目录在项目内 `data/`

## 规则约定

- **大小写**：加解密保留原文大小写；密钥不区分大小写
- **非字母字符**：标点、空格、数字原样保留，**不推进密钥位置**；分析时的列分组使用同样的位置定义（只统计英文字母）
- **密钥**：非空、仅英文字母，长度上限 64；分析用密钥长度上限 40
- **输入大小**：单次最大 200,000 字符
- **证据不足**：某列字母数 < 30 时标记 `lowConfidence`，报告中明确提示，不伪造确定结论

## 评分方法

对某列的每个候选移位 s（0..25，即密钥字母 A..Z）：

1. 用 s 解密该列字母，统计 26 个字母的真实计数 `observed`
2. 期望计数 `expected[i] = 内置英文频率[i] x 列字母数`
3. 卡方统计量 `chi2 = sum((observed - expected)^2 / expected)`

**分数越小，说明该移位解密后的分布越接近普通英文。** 频率表为项目内 `src/frequency.ts`，版本号 `en-classic-v1`，随每份报告记录。短文本、样本稀少的列或偏离英文分布的文本会使排名不可靠，报告会显示证据不足而非确定结论。

## 快速开始

```powershell
npm install        # 安装开发依赖（仅 typescript + @types/node）
npm run build      # 编译到 dist/
npm test           # 构建并运行全部测试
npm start          # 启动 API 服务（默认自动选空闲端口）
npm run demo       # 内置演示：已知向量 + 长文本分析 + 短文本不可靠示例
```

## CLI 用法

```powershell
node dist/src/cli.js serve --port 8080          # 指定端口；省略则自动选空闲端口
node dist/src/cli.js encrypt --text "Attack at dawn" --key LEMON
node dist/src/cli.js decrypt --text "Lxfopv ef rnhr" --key LEMON
node dist/src/cli.js analyze --ciphertext "..." --key-length 5 --all
node dist/src/cli.js list                        # 列出实验
node dist/src/cli.js show --id 3                 # 查看实验（含每列计数与 26 个移位评分）
node dist/src/cli.js decrypt-with-key --id 3 --key LEMON   # 人工选用候选密钥解密
node dist/src/cli.js export --id 3 --out report.json       # 导出实验 JSON
node dist/src/cli.js demo
```

`--text`/`--ciphertext` 可替换为 `--file 路径` 从文件读取。

## API 一览（默认 `http://127.0.0.1:<自动端口>`）

- `POST /api/experiments/encrypt` `{text, key}` → `{id, ciphertext}`
- `POST /api/experiments/decrypt` `{text, key}` → `{id, plaintext}`
- `POST /api/experiments/analyze` `{ciphertext, keyLength}` → `{id, bestKey, columns[], combinedCandidates[], lowConfidence, notes[], freqTableVersion, ...}`
- `GET /api/experiments` / `GET /api/experiments/:id` / `GET /api/experiments/:id/export`
- `POST /api/experiments/:id/decrypt-with-key` `{key}` → 人工选用候选解密（作用于该实验保存的输入文本）
- `GET /api/health`

示例：

```powershell
curl -X POST http://127.0.0.1:8080/api/experiments/encrypt -H "Content-Type: application/json" -d '{\"text\":\"ATTACKATDAWN\",\"key\":\"LEMON\"}'
```

## 错误码

| 代码 | 含义 |
|---|---|
| `EMPTY_KEY` | 密钥为空 |
| `NON_ALPHA_KEY` | 密钥含非英文字母 |
| `KEY_TOO_LONG` | 密钥超过 64 字母 |
| `NO_LETTERS` | 输入没有任何英文字母 |
| `INPUT_TOO_LARGE` | 输入超过 200,000 字符 |
| `INVALID_KEY_LENGTH` | 分析长度非 1..40 的整数 |
| `NOT_FOUND` | 实验或路由不存在 |
| `BAD_REQUEST` | 参数缺失或 JSON 非法 |

## 验证与演示

- 已知向量：`ATTACKATDAWN` + `LEMON` → `LXFOPVEFRNHR`（`npm run demo` 第 1 段）
- 长文本分析：内置合成英文材料（`src/sampleText.ts`，约 1159 字母）以 `LEMON` 加密后，已知长度 5 的分析把 `LEMON` 列为组合最优，且每列真实计数与全部 26 个移位评分都在报告中
- 短文本示例：`MEET ME AT NOON`（每列仅 4 字母）标记 `lowConfidence`，说明统计证据不足

测试覆盖：模 26 回绕、大小写保留、标点不推进密钥、重复密钥、往返一致性、空/非法参数诊断、手工计数小列的卡方精确核对、长文本命中真实密钥、短文本证据不足、相同输入稳定排序、SQLite 持久化回读。

## 限制

- 只做经典加法维吉尼亚；不自动推断密钥长度，不支持其他密码体制
- 频率分析依赖"明文接近普通英文"的假设；短文本或非英文文本结论不可靠（系统会标记而非保证）
- 数据目录默认 `./data`（可用环境变量 `VIGENERE_DATA_DIR` 覆盖）；仅保存虚构教学数据
- `node:sqlite` 在 Node 25 仍为实验特性，启动时会打印 ExperimentalWarning，属正常
