// 失真 5 款 (单块, DIST 64/65/66=唯一引擎, OD 前端 43/48/52=1 全旁路, 49/50/51 中性 0/50/288)
export const DISTORTION_ENGINE_5 = new Set(['B&F DS-1', 'B&F RAT2', 'B&F MT-2', 'B&F HM-2', 'B&F Shredmaster']);
export const isDistortionEngine = (name?: string): boolean => !!name && DISTORTION_ENGINE_5.has(name);

// NAM 拟合模型: 绕过 42/57 固定旁路语义与 BOOST/TUBE 写回 (拟合值含全部旁路状态, 自带真实 bypass)
// 两级结构组合键为 "B&F NAM X/位置" (硬件名含 B&F NAM 前缀), 也属于 NAM 拟合;
// v27 型号化后组合键为 "系列名/型号" (如 "中频过载/TS808"), 同样走 NAM 拟合分支
import { SERIES_BY_COMPOSED } from './seriesData';
export const isNamModel = (name?: string): boolean => !!name && (name.startsWith('NAM') || name.startsWith('B&F NAM') || !!SERIES_BY_COMPOSED[name]);
