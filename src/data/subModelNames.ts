/**
 * ★★ v3.78（2026-10-26）：型号归一化 —— 全链路唯一口径 = **key**
 *
 * 历史：v3.70 把口径定成「name」，但 name 是可变的显示名（还会翻译、还会精简），
 * 于是 v3.78 改成「全英文 + 精简」时，所有老存档的 name 全部对不上。
 * 根因没解决：**显示名不能当主键**。
 *
 * 现在：
 *   · 存档 / 云端 / 预设只存 key（纯 ASCII、不可变）
 *   · 老存档（存旧中文名 / 旧 id / 旧全名）→ 由 modelKey 的反查链自动补成 key
 *   · 解析不出来的值 **原样保留**，由调用方提示，不再静默猜
 *
 * 保留 `normalizeSubModels` 这个名字是为了不动 Index / switchPacks 的调用点。
 */
import { toKeySubModels, type ModelRef } from '../data/modelKey';
import { customOdModels, customAmpModels } from '../ui2/customModules';

/** 自定义模块也参与反查（影子注册） */
function customRefs(moduleId: string): ModelRef[] | undefined {
  if (moduleId === 'overdrive') return customOdModels().map((m) => ({ key: m.id, name: m.name }));
  if (moduleId === 'amp-head') return customAmpModels().map((m) => ({ key: m.id, name: m.name }));
  return undefined;
}

export function normalizeSubModels(
  sm?: Record<string, string> | null,
): Record<string, string> | undefined {
  return toKeySubModels(sm, customRefs);
}
