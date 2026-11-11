/**
 * BFX1 · 写入节奏总开关（2026-10-17）
 *
 * 用户要求：「把所有 EA 参数发送间隔时间更换为和 EB 一样的 5ms」→ 出一个单独的实验版。
 *
 * ★★ 回退只有一行：把下面的 WRITE_PROFILE 改成另一档，重新出包即可。
 *     也可以在旧版 APK 上直接覆盖安装（versionCode 相同，不会被判降级）。
 *
 * 历史口径（A3 · 2026-09-22）：
 *   所有寄存器写入统一 20ms（与固件节拍一致），仅 EB（保存到硬件）保留 5ms。
 *   设计文档 T1 条曾写死「批量写间隔固定 20ms，不可缩短」——
 *   本版是用户明确要求下的提速实验：若出现「连续加载第二次失效 / 偶发断连 / 爆音」，
 *   第一嫌疑就是这个档位（GATT 拥塞），请回退 standard 档再验。
 *
 * 四个数字的含义：
 *   ea      普通寄存器写（0xEA 及数据类）的最小间隔
 *   eb      保存到硬件（EB）路径
 *   slow    42 / 57 旁路位落定间隔
 *   slow72  72 旁路位落定间隔（标准档最长 150ms，防爆音用）
 */

export type WriteProfile = 'ea5ms' | 'standard';

/** ★★★ 改这一行即可切换 / 回退 ★★★ */
export const WRITE_PROFILE: WriteProfile = 'standard';

/**
 * 档位表 —— 用查表而不是三元比较。
 * ⚠️ 踩过的坑（2026-10-17）：`export const WRITE_PROFILE: WriteProfile = 'standard'`
 *   会被 TS 窄化成字面量类型 'standard'，此时写 `WRITE_PROFILE === 'ea5ms'`
 *   会报 TS2367「两个类型没有重叠」，而 `vite build` 里带类型检查 → 直接出包失败。
 *   查表法没有比较表达式，两种档位都安全。
 */
const PROFILES: Record<WriteProfile, { ea: number; eb: number; slow: number; slow72: number }> = {
  ea5ms:    { ea: 5,  eb: 5, slow: 5,  slow72: 5 },     // 提速实验版
  standard: { ea: 20, eb: 5, slow: 50, slow72: 150 },   // 原厂节奏（回退档）
};

const P = PROFILES[WRITE_PROFILE];

export const EA_WRITE_MS = P.ea;
export const EB_WRITE_MS = P.eb;
export const BYPASS_SLOW_MS = P.slow;
export const BYPASS_72_MS = P.slow72;

/** 便于在日志 / 调试面板里一眼看出当前是哪一档 */
export const TIMING_PROFILE = `${WRITE_PROFILE}:EA${EA_WRITE_MS}/EB${EB_WRITE_MS}/BP${BYPASS_72_MS}`;


