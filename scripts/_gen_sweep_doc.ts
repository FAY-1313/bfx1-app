/**
 * 生成「全寄存器扫描图 + EA 打包分组」核对文档（Markdown + CSV）
 *
 * 用法（由 esbuild 打包后交给 node 运行）：
 *   esbuild scripts/_gen_sweep_doc.ts --bundle --platform=node --format=esm --outfile=<tmp>.mjs
 *   node <tmp>.mjs <输出目录>
 *
 * 所有数值都从 src 里真实 import，杜绝手抄错值。
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import {
  TEST_SWEEP_MAP, TEST_SWEEP_ADDRS, TEST_SWEEP_COUNT, TEST_SWEEP_SUM,
  nameOfAddr, isSafetyAddr, isBypassAddr,
} from '../src/data/_def/testSweep';
import { orderAddrsBypassLast } from '../src/data/passThrough';
import { EA_MAX_FRAMES_PER_PKT } from '../src/services/bleService';

const outDir = process.argv[2] || '.';
mkdirSync(outDir, { recursive: true });

/** 发送顺序：与 APP 实际一致（数据类地址升序，旁路位最后，收尾 72 → 107） */
const sendOrder = orderAddrsBypassLast(TEST_SWEEP_ADDRS);
const TOTAL = sendOrder.length;
const PER = EA_MAX_FRAMES_PER_PKT;                 // 20
const FRAME_BYTES = 12;

/** 分包：每 PER 帧一包，最后一包按剩余帧数（不凑满） */
const packets: Array<{ no: number; n: number; bytes: number; from: number; to: number; first: number; last: number }> = [];
for (let i = 0; i < TOTAL; i += PER) {
  const chunk = sendOrder.slice(i, i + PER);
  packets.push({
    no: packets.length + 1,
    n: chunk.length,
    bytes: chunk.length * FRAME_BYTES,
    from: i + 1,
    to: i + chunk.length,
    first: chunk[0],
    last: chunk[chunk.length - 1],
  });
}
const totalBytes = TOTAL * FRAME_BYTES;
const pktNoOf = (orderIdx: number) => Math.floor(orderIdx / PER) + 1;

/** 地址区间 → 模块说明（只用于文档分组统计） */
const RANGES: Array<{ lo: number; hi: number; label: string }> = [
  { lo: 0, hi: 1, label: '噪声门（旁路 / 阈值）' },
  { lo: 7, hi: 13, label: '压缩器（旁路 / 阈值 / 起停 / 比率 / 拐点 / 增益）' },
  { lo: 42, hi: 42, label: '过载 OD1 总旁路' },
  { lo: 44, hi: 51, label: '过载 OD1 Pre-PEQ / 削波 / DRIVE / DC / LEVEL' },
  { lo: 53, hi: 56, label: '过载 OD1 Post-PEQ' },
  { lo: 57, hi: 58, label: '箱头 总旁路 / 库旁路' },
  { lo: 59, hi: 71, label: '箱头 驱动段 / 失真段' },
  { lo: 72, hi: 73, label: '箱头 内部旁路（72 = 收尾慢档）' },
  { lo: 74, hi: 82, label: '箱头 EQ / 存在感 / 共振' },
  { lo: 83, hi: 98, label: '箱头 N8 音调段 / 音量 / MASTER' },
  { lo: 107, hi: 142, label: '箱体 PEQ（多段）' },
  { lo: 215, hi: 223, label: '合唱 / 延迟' },
  { lo: 224, hi: 229, label: '混响' },
  { lo: 239, hi: 239, label: '箱头 MASTER（本图固定 40）' },
  { lo: 254, hi: 259, label: '限幅器（固定参数，仅调试可调）' },
  { lo: 260, hi: 261, label: '输出（260 静音=0 / 261 音量=50 → 0 dB）' },
];

const rangeRows = RANGES.map((r) => {
  const n = sendOrder.filter((a) => a >= r.lo && a <= r.hi).length;
  return `| ${r.lo}–${r.hi} | ${r.label} | ${n} |`;
});

const packetRows = packets.map((p) =>
  `| ${p.no} | ${p.n} | ${p.bytes} B | #${p.from}–#${p.to} | ${p.first} | ${p.last} |`);

const detailRows = sendOrder.map((a, i) => {
  const tag = isSafetyAddr(a) ? '安全值' : isBypassAddr(a) ? '旁路位=0(启用)' : '循环 1–15';
  return `| ${i + 1} | ${pktNoOf(i)} | ${a} | ${nameOfAddr(a) || '—'} | ${TEST_SWEEP_MAP[a]} | ${tag} |`;
});

const md = `# BFX1 · 全寄存器扫描图 + EA 打包分组（核对用）

生成时间：${new Date().toLocaleString('zh-CN')}
生成方式：**由 App 源码直接导出**（\`src/data/_def/testSweep.ts\` / \`services/bleService.ts\`），
与安装包内实际发送的帧完全一致。

> 本版依据《App 侧 EA 打包规则（对应固件 BFRT10.187 / M77-eapack）》：
> **N 条 EA 帧首尾相接（N×12 字节），用 \`writeWithoutResponse\` 一次写下去，包间等一次写回调。**

---

## 一、这次测什么

App 侧把「预设库 / 本地库」的 **16 个预设**全部换成同一张**全寄存器扫描图**，
并且**加载音色时走 EA 打包发送**（不再是逐帧 5ms）。所以无论切到 A1…D4 哪一档，
点一次加载 = 发同一套参数，可以直接循环点。

| 项目 | 值 |
|---|---|
| 寄存器（帧）总数 | **${TEST_SWEEP_COUNT}** 帧 |
| 每帧字节 | ${FRAME_BYTES} B（EA 帧定长） |
| 总字节 | **${totalBytes} B** = ${TOTAL} × 12 |
| **每包帧数上限** | **${PER}** 帧（设备侧硬上限 / MTU 247 → (247−3)/12 = 20） |
| **总包数** | **${packets.length}** 包（${packets.map((p) => p.n).join(' + ')}） |
| 数值校验和 | **${TEST_SWEEP_SUM}** |
| 首帧 / 末帧地址 | ${sendOrder[0]} / ${sendOrder[TOTAL - 1]} |
| 末两帧顺序 | ${sendOrder.slice(-2).join(' → ')}（旁路收尾规则，固定） |

---

## 二、怎么判定"完整收到"

1. **写操作次数**：一次加载应看到 **${packets.length}** 次 GATT 写（不是 ${TOTAL} 次单帧写）。
2. **每包长度**：${packets.map((p) => p.bytes + 'B').join(' / ')}（都是 12 的整数倍，最后一包不凑满）。
3. **总字节**：${totalBytes} B。
4. **帧数**：${TOTAL} 帧；总校验和 = **${TEST_SWEEP_SUM}**。
5. **顺序**：数据类按地址升序，旁路语义地址排在最后，**最后两帧固定 ${sendOrder.slice(-2).join(' → ')}**。
6. 首帧地址应为 **${sendOrder[0]}**（值 ${TEST_SWEEP_MAP[sendOrder[0]]}）。

> 若只收到第一帧或只生效第一条 → 固件仍是 M76 及以前（只解析首帧），必须烧 **BFRT10.187**。
> 若前 8 条生效、后 12 条丢 → 包长超 96B 被截断（旧固件），同样是固件版本问题。

### 关于"要不要等设备回包"

**不用等**。设备整批处理完会回一条 16 字节 G1V7 帧，但 App 不需要等它才发下一包——
包与包之间只等一次 \`onCharacteristicWrite\` 回调。如果哪一包写失败（Android 上一个操作未完成
会返回 busy），App 会**退回本包重试**（最多 3 次），不会跳帧。

### 这条路径与"上传"的区别（重要）

| 触发方式 | 帧头 | 是否打包 | 用途 |
|---|---|---|---|
| **点预设 / 本地库「加载」** | **0xEA** | **是（20 帧/包）** | ★ 本次打包测试走这条 |
| 预设库「上传」 | 0xEB | 否（仍是逐条 5ms） | EB 是"存到硬件"通道，不属于 EA 打包规则 |

---

## 三、取值规律（便于快速发现错位）

- **旁路位**（0 / 7 / 42 / 57 / 72 / 107 / 215 / 221 / 224）一律写 **0 = 启用**。
- **安全固定值**：239 = 40（箱头 MASTER）、260 = 0（不静音）、261 = 50（输出 0 dB）。
- **其余地址**：按顺序循环 **1…15**，相邻地址取值不同 → 可发现"地址/值错位"。

---

## 四、按模块统计（覆盖率自查）

| 地址区间 | 模块 | 帧数 |
|---|---|---|
${rangeRows.join('\n')}
| **合计** | | **${TOTAL}** |

---

## 五、**打包分组表**（每包 ${PER} 帧 = ${PER * FRAME_BYTES} B）

| 包号 | 帧数 | 字节数 | 帧序号 | 首帧地址 | 末帧地址 |
|---|---|---|---|---|---|
${packetRows.join('\n')}

> 第 ${packets.length} 包只有 ${packets[packets.length - 1].n} 帧 = ${packets[packets.length - 1].bytes} B —— 按规则 6，最后一包**不补位**。

---

## 六、逐帧对照表（**按实际发送顺序**，含所属包号）

| # | 包号 | 地址 | 寄存器名 | 发送值 | 取值规则 |
|---|---|---|---|---|---|
${detailRows.join('\n')}

---

## 七、备注

1. 本文档由源码自动生成；若与抓到的帧不符，请以实际抓包为准并反馈。
2. 该包为**测试专用**：\`TEST_SWEEP_MODE = true\` + \`EA_PACK_TEST = true\`，16 个预设已被替换，
   **不可作为正式版本**。恢复：两个开关都改回 \`false\` 重新出包。
3. 另有「上传（EB）」通道仍为逐条写入，条数 = ${TOTAL}（含 261），可作为对照基线。
`;

writeFileSync(join(outDir, 'BFX1-EA打包分组-核对文档.md'), md, 'utf8');

/** CSV：给蓝牙端直接用 Excel / 脚本比对 */
const csv = ['序号,包号,地址,寄存器名,发送值,取值规则']
  .concat(sendOrder.map((a, i) => {
    const tag = isSafetyAddr(a) ? '安全值' : isBypassAddr(a) ? '旁路位=0' : '循环1-15';
    return `${i + 1},${pktNoOf(i)},${a},${nameOfAddr(a) || ''},${TEST_SWEEP_MAP[a]},${tag}`;
  }))
  .join('\n');
writeFileSync(join(outDir, 'BFX1-EA打包分组.csv'), '\ufeff' + csv, 'utf8');

console.log(`frames=${TOTAL} sum=${TEST_SWEEP_SUM} packets=${packets.length} ` +
  `sizes=${packets.map((p) => p.bytes).join('/')} totalBytes=${totalBytes}`);
console.log(`written to ${outDir}`);
