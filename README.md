# vigenere-lab：维吉尼亚密码编解码与候选密钥分析后端（教学用途）

Windows 本地可运行的**纯后端**实验服务：经典加法型维吉尼亚密码（Vigenère cipher）的加密、解密，以及在**用户给定密钥长度**下，基于按列字母频率与卡方（chi-square）评分的候选密钥分析。只提供 HTTP API 与 CLI，不连接任何网站，数据全部来自项目内置虚构文本或用户显式输入。

> 适用范围：仅限经典加法维吉尼亚（A=0..Z=25，密钥循环相加取模 26）。
> **不**包含自动推断密钥长度（Kasiski/重合指数等）、其他密码体制或在线服务。

## 1. 密码规则

- 字母映射：`A..Z -> 0..25`；加密 `C = (P + K) mod 26`，解密 `P = (C - K + 26) mod 26`。
- 密钥循环使用：第 `i` 个有效字母使用 `key[i mod keyLength]`。
- **大小写与非字母字符**：标点、空格、数字等原样保留，且**不推进密钥位置**；输出保留原字母大小写。
- 密钥：非空英文字母（大小写不敏感，内部统一转大写），长度上限 128；分析时密钥长度上限 64。
- 文本上限 100,000 字符；不含任何英文字母的输入会被拒绝。

已知验证向量：`ATTACKATDAWN` + 密钥 `LEMON` → 密文 `LXFOPVEFRNHR`（Wikipedia 经典示例）。

## 2. 频率分析方法（核心）

1. 提取密文中的有效英文字母（与加解密的密钥位置定义一致，标点不占列）。
2. 按 `字母序号 mod keyLength` 把密文分为 `keyLength` 列，每列对应密钥的一个位置。
3. 对每列枚举 26 种移位 `shift`（即该列假设的密钥字母），把列内字母反向移位后统计 A..Z 实际计数 `observed_i`。
4. 与内置英文频率表 `data/frequency-en.json` 比较，计算卡方差异：

   `chi2 = Σ (observed_i − expected_i)^2 / expected_i`，其中 `expected_i = N × (freq_i / 100)`。

   **分数越小表示该移位还原后的分布越接近英文分布。**
5. 每列按分数稳定升序排名；对各列前 `topK` 个移位做笛卡尔积，按合计卡方升序给出组合候选密钥（默认前 100 个，相同输入排序完全确定）。

**证据等级（避免伪造确定性结论）**：
- `small`：该列样本 `< 25` 个字母，统计基本不可靠；
- `weak`：样本不少但第一名与第二名分数差距 `< 2`，区分度弱；
- `moderate`：有一定区分度。

排名第一的候选**只是统计上最优的猜测，不是必然正确的答案**。短文本、样本很少的列、偏离英文分布的文本（如大量专有名词）都应人工核对。

频率表版本（当前 `en-classical-1`）随每次分析实验一并存入数据库，报告中也会标注。

## 3. 环境与构建

- 需要 Node.js >= 22.5（内置 `node:sqlite`，无需本机编译工具链，不依赖 Docker/WSL）。

```powershell
npm install
npm run build        # 编译到 dist/
npm test             # 编译并运行全部 23 个测试（node:test）
npm start            # 启动 HTTP API（默认自动选择空闲端口；可用环境变量 PORT 指定）
npm run demo         # CLI 端到端演示：已知向量 + 长文本候选 + 短文本证据不足
```

数据目录：SQLite 数据库保存在项目内 `data/lab/experiments.sqlite`（首次运行自动创建）。

## 4. HTTP API

服务监听 `127.0.0.1`。响应统一为 `{ "ok": true, "data": ... }`；错误为
`{ "ok": false, "error": { "code", "message" } }` 并带 HTTP 400/404/413/500 状态。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/meta` | 上限、频率表（含版本与频率值）、已知向量 |
| POST | `/api/encrypt` | `{text, key}` 加密并落库 |
| POST | `/api/decrypt` | `{text, key}` 解密并落库 |
| POST | `/api/analyze` | `{ciphertext, keyLength, topK?, maxCombinations?}` 指定长度分析 |
| GET | `/api/experiments?limit=` | 实验列表（最新在前） |
| GET | `/api/experiments/:id` | 查看实验（分析实验内含每列计数与全部移位评分） |
| GET | `/api/experiments/:id/export` | 导出单条实验（含导出时间与记录） |
| POST | `/api/experiments/:id/choose` | `{key}` 人工选用候选密钥解密某次分析实验的密文 |

可复制示例（PowerShell）：

```powershell
npm start   # 记下输出的端口，例如 51910

# 已知向量
Invoke-RestMethod -Uri "http://127.0.0.1:51910/api/encrypt" -Method Post `
  -ContentType "application/json" `
  -Body '{"text":"ATTACKATDAWN","key":"LEMON"}'

# 指定长度分析
Invoke-RestMethod -Uri "http://127.0.0.1:51910/api/analyze" -Method Post `
  -ContentType "application/json" `
  -Body '{"ciphertext":"LXFOPVEFRNHR","keyLength":5,"topK":3}'
```

错误码：`TEXT_EMPTY`、`TEXT_INVALID`、`TEXT_TOO_LONG`、`NO_LETTERS`、`KEY_EMPTY`、
`KEY_INVALID`、`KEY_TOO_LONG`、`KEYLENGTH_INVALID`、`KEYLENGTH_TOO_LARGE`、
`KEYLENGTH_TOO_LARGE_FOR_INPUT`、`KEY_LENGTH_MISMATCH`、`PARAM_INVALID`、
`BODY_TOO_LARGE`、`JSON_INVALID`、`EXPERIMENT_NOT_FOUND`、`EXPERIMENT_ID_INVALID`、
`EXPERIMENT_WRONG_KIND`、`NOT_FOUND`、`INTERNAL`。

## 5. CLI

```powershell
node dist/cli/index.js encrypt --text "Attack at dawn!" --key LEMON
node dist/cli/index.js decrypt --text LXFOPVEFRNHR --key LEMON
node dist/cli/index.js analyze --text LXFOPVEFRNHR --key-length 5 --top-k 3
node dist/cli/index.js columns --id 1
node dist/cli/index.js choose --id 1 --key LEMON
node dist/cli/index.js get --id 1
node dist/cli/index.js list --limit 20
node dist/cli/index.js export --id 1
node dist/cli/index.js meta
node dist/cli/index.js demo
```

`analyze` 默认人类可读输出（每列 topK 移位、计数对应的卡方、组合候选），加 `--format json` 输出完整 JSON。所有实验与 API 共用同一个 SQLite 数据库。

## 6. 内置数据与演示

- `data/frequency-en.json`：经典教科书英文单字母频率（百分比），版本 `en-classical-1`。
- `src/data/sample.ts`：约 1,100 字符的**虚构**英文教学材料（花园故事，非真实出版物），用密钥 `ORCHID` 加密后按长度 6 分析，真实密钥在长样本下排名第一；
  另有短文本 `"Hi!"` 示例，两列均标记为 `small`，展示短文本不可靠。

## 7. 测试覆盖

`npm test` 运行 23 个测试：模 26 回绕、大小写保留、标点不推进密钥、重复密钥往返、
空输入/无字母/非法与过长密钥长度诊断、手工计数小列与卡方核对、长/短文本证据等级、
稳定排序、SQLite 持久化（含频率表版本）、API 全链路与错误码。

## 8. 限制与免责声明

- 仅为古典密码与统计候选方法的**教学演示**，不提供任何真实安全保障；现代场景不应使用维吉尼亚密码。
- 卡方评分是启发式排序，单字母频率不利用词法/多字母结构；频率表是通用近似值。
- 不自动推断密钥长度：长度必须由调用方提供，且不大于有效字母数。
- 所有文本均为虚构教学数据或用户输入，不访问网络、不依赖任何在线 API。
