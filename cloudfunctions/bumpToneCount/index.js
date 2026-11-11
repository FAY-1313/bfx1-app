/**
 * bumpToneCount — trialCount / favCount counter.
 *
 * Why a cloud function: the `tones` collection keeps the strictest rule
 * (update only by the document owner), so a non-author cannot increment
 * someone else's counter. Cloud functions run with admin privileges and
 * bypass row-level rules, so the counter works while the rule stays strict.
 *
 * Params: { id: string, field: 'trialCount' | 'favCount', delta?: 1 | -1 }
 * Returns: { ok: true, updated: n } | { ok: false, err: string }
 */
const cloud = require('@cloudbase/node-sdk');

const app = cloud.init({ env: cloud.SYMBOL_CURRENT_ENV });
const db = app.database();
const _ = db.command;

const FIELDS = ['trialCount', 'favCount'];

exports.main = async (event) => {
  const { id, field, delta } = event || {};
  if (!id || typeof id !== 'string') return { ok: false, err: 'bad_id' };
  if (!FIELDS.includes(field)) return { ok: false, err: 'bad_field' };

  const step = delta === -1 ? -1 : 1;
  try {
    const res = await db.collection('tones').doc(id).update({ [field]: _.inc(step) });
    return { ok: true, updated: res && res.updated };
  } catch (e) {
    return { ok: false, err: String((e && e.message) || e) };
  }
};
