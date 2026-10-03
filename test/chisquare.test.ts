import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chiSquareForShift } from '../src/analyze.js';

test('手工计数小列 KHOOR: shift=3 解密为 HELLO，卡方与手工计算一致', () => {
  // 手工计数: n=5, 解密后计数 E=1 H=1 L=2 O=1 其余 0
  // 期望 = 频率% x 5: E=0.6351 H=0.3047 L=0.20125 O=0.37535
  // 各项: E 0.20965, H 1.58661, L 16.0770, O 1.03954, 其余 0 计数项合计 3.4836
  // 总和 = 22.3964
  const chi = chiSquareForShift('KHOOR', 3);
  assert.ok(Math.abs(chi - 22.3964) < 0.001, `实际 ${chi}`);
});

test('5 字母小列排名本身不稳定（教学点：短列不可靠）', () => {
  // 即使 shift=3 是真实密钥，5 个字母也不足以让它排第一
  const scores = Array.from({ length: 26 }, (_, s) => chiSquareForShift('KHOOR', s));
  const best = scores.indexOf(Math.min(...scores));
  assert.notEqual(best, 3);
});
