/**
 * seedOfficial — one-shot upsert of the 45 official tones into `tones`.
 *
 * Why a cloud function instead of the client: the `tones` rules require
 * `doc.uid == auth.uid`, so the client can never write documents owned by
 * the `official` account. Running here (admin privileges) lets the app drop
 * its seed routine entirely — no more doomed write on every cold start.
 *
 * Idempotent: uses doc(_id).set(), so re-running just refreshes the content.
 * Params: { dryRun?: boolean, ids?: string[] }
 */
const cloud = require('@cloudbase/node-sdk');
const SEEDS = require('./tones.json');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();

exports.main = async (event) => {
  /* ★★★ v3.78（2026-10-26 用户拍板）：**开关已关闭** ★★★
   * 「现有云端预设参数全部取消，不再保留；现在先删除即可，也不要生成新的云端预设。
   *   现在云端打开显示为空即可。」
   * `tones` 集合已被清空（45 → 0）。这个函数保留代码是为了将来重新灌库，
   * 但只要 SEED_ENABLED 为 false，调用它不会写入任何数据 —— 防止误触发把 45 条灌回去。
   * 需要重灌时把它改成 true，并在管理端手动调用。 */
  const SEED_ENABLED = false;
  if (!SEED_ENABLED) {
    return { ok: true, disabled: true, reason: 'v3.78: official seed disabled by user request', total: 0 };
  }

  const { dryRun = false, ids } = event || {};
  const list = Array.isArray(ids) && ids.length
    ? SEEDS.filter((s) => ids.includes(s._id))
    : SEEDS;

  if (dryRun) {
    return { ok: true, dryRun: true, total: list.length, ids: list.map((s) => s._id) };
  }

  let ok = 0;
  const failed = [];
  for (const seed of list) {
    const { _id, ...body } = seed;
    try {
      await db.collection('tones').doc(_id).set(body);
      ok += 1;
    } catch (e) {
      failed.push({ id: _id, err: String((e && e.message) || e) });
    }
  }
  return { ok: failed.length === 0, written: ok, failed };
};
