import cloudbase from '@cloudbase/js-sdk';

const ENV_ID = 'bfx1-v1-fay-d6g6w79ss8e4d9bf5';

const app = cloudbase.init({ env: ENV_ID, region: 'ap-shanghai' });

export { app };
export const auth = app.auth({ persistence: 'local' });
export const db = app.database();

/** 获取用户信息 */
export async function getUserInfo(uid: string) {
  try {
    const res = await db.collection('users').where({ uid: uid }).get();
    return res.data?.[0] || null;
  } catch { return null; }
}

/** 保存/更新用户信息 */
export async function saveUserInfo(info: {
  uid: string;
  phone: string;
  nickname?: string;
  device_model?: string;
  device_sn?: string;
}) {
  try {
    const exist = await db.collection('users').where({ uid: info.uid }).get();
    if (exist.data?.length) {
      await db.collection('users').doc(exist.data[0]._id).update({
        ...info,
        updated_at: new Date().toISOString(),
      });
    } else {
      await db.collection('users').add({
        ...info,
        created_at: new Date().toISOString(),
      });
    }
    return true;
  } catch { return false; }
}

// ─── 预设档位 ────────────────────────────────────────────────────────

export interface PresetData {
  _id?: string;
  user_phone: string;
  slot: number;        // 1-16
  name: string;
  playMode: string;
  modules: Record<string, boolean>;
  subModels: Record<string, string>;
  knobValues: Record<string, Record<string, number>>;  // moduleId → knobLabel → normalized 0-1
  registers: Record<number, number>;                    // ALL registers (visible + hidden)
}

/** 保存单个档位到云端（覆盖写入） */
export async function savePresetToCloud(data: Omit<PresetData, '_id'>) {
  try {
    const exist = await db.collection('presets').where({ user_phone: data.user_phone, slot: data.slot }).get();
    if (exist.data?.length) {
      await db.collection('presets').doc(exist.data[0]._id).update({
        ...data,
        updatedAt: new Date().toISOString(),
      });
    } else {
      await db.collection('presets').add({
        ...data,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return true;
  } catch { return false; }
}

/** 加载用户全部 16 个档位 */
export async function loadPresetsFromCloud(user_phone: string): Promise<PresetData[]> {
  try {
    const result = await db.collection('presets').where({ user_phone }).orderBy('slot', 'asc').get();
    return (result.data || []) as PresetData[];
  } catch { return []; }
}

/** 删除单个档位 */
export async function deletePresetFromCloud(presetId: string) {
  try {
    await db.collection('presets').doc(presetId).remove();
    return true;
  } catch { return false; }
}
