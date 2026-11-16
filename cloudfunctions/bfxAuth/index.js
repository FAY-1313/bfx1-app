/**
 * bfxAuth —— 用户名 + 密码 自助注册 / 登录（云函数）
 *
 * 为什么需要它：CloudBase 的「用户名密码登录」身份源只允许登录**已存在**的账号，
 * 直接 signUp({username,password}) 会被服务端拒绝（501 you can not signup just by
 * username and password）；邮箱/短信验证码通道未开通时也没有别的自助注册入口。
 * 所以这里自建账号表（bcrypt 风格 scrypt 加盐哈希），校验通过后签发
 * **自定义登录 ticket**，客户端拿 ticket 换一个真正的 CloudBase 会话
 * （社区音色、关注、收藏都需要会话才能读写数据库）。
 *
 * 部署：
 *   1) tcb login && tcb fn deploy bfxAuth（或在控制台「云函数」里上传本目录）
 *   2) 云开发控制台 → 环境 → 登录授权 → 开启「自定义登录」，并下载私钥；
 *      把私钥内容放到本函数目录的 tcb_custom_login.json（或配到函数环境变量
 *      CUSTOM_LOGIN_KEY / 私钥文件路径），否则 createTicket 会失败，
 *      接口会返回 custom_login_not_configured。
 *   3) 集合 bfx_users 需存在（首次写入会自动建集合；权限建议「仅管理端可读写」）
 *
 * 请求：
 *   { action: 'register', username, password }
 *   { action: 'login',    username, password }
 * 返回：
 *   { ok: true, uid, username, ticket }
 *   { ok: false, error: 'user_exists'|'user_not_found'|'wrong_password'|... }
 */
const crypto = require('crypto');
const cloudbase = require('@cloudbase/node-sdk');

/**
 * 自定义登录私钥（用于 createTicket）：
 *   1) 优先读函数环境变量 `BFX_CUSTOM_LOGIN_KEY`（私钥 JSON 的字符串形式，不进仓库）
 *   2) 兼容官方文档写法：同目录 tcb_custom_login.json
 * 两者都没有时，注册/密码校验照常，只是 ticket 会返回 custom_login_not_configured。
 */
function loadCredentials() {
  const raw = process.env.BFX_CUSTOM_LOGIN_KEY;
  if (raw) {
    try { return JSON.parse(raw); } catch { /* 落到文件 */ }
  }
  try { return require('./tcb_custom_login.json'); } catch { return null; }
}

const credentials = loadCredentials();
const app = credentials
  ? cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV, credentials })
  : cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
const db = app.database();
const USERS = 'bfx_users';

const NAME_MIN = 2;
const NAME_MAX = 12;
const PASS_MIN = 6;

function hashPassword(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString('hex');
}

function checkName(name) {
  if (!name) return 'name_invalid';
  if (name.length < NAME_MIN || name.length > NAME_MAX) return 'name_invalid';
  if (!/^[\u4e00-\u9fa5A-Za-z0-9_\-·]+$/.test(name)) return 'name_invalid';
  return '';
}

/** 用户主键：小写用户名，保证「Fan / fan」不会撞成两个账号 */
function nameKey(name) {
  return name.toLowerCase();
}

/** 集合不存在时自动创建（新环境第一次注册会走到这里） */
async function ensureCollection() {
  try {
    await db.createCollection(USERS);
  } catch {
    /* 已存在 / 无权限时忽略，后续 add 会给出真实错误 */
  }
}

async function findUser(name) {
  try {
    const r = await db.collection(USERS).where({ nameKey: nameKey(name) }).limit(1).get();
    return (r.data && r.data[0]) || null;
  } catch (e) {
    const msg = String((e && e.message) || e);
    if (/not exist|COLLECTION_NOT_EXIST|ResourceNotFound/i.test(msg)) return null;
    throw e;
  }
}

async function issueTicket(uid) {
  try {
    const ticket = await app.auth().createTicket(uid, { refresh: 3600 * 24 * 30 });
    return { ticket };
  } catch (e) {
    return { error: 'custom_login_not_configured', detail: String((e && e.message) || e) };
  }
}

/**
 * 兼容两种调用方式：
 *   · tcb fn invoke / SDK callFunction —— event 就是入参对象
 *   · HTTP 访问服务（https://<env>.service.tcloudbase.com/bfxAuth）
 *     —— event = { body: '{"action":...}', headers, httpMethod, ... }
 */
function normalizeEvent(raw) {
  if (raw && typeof raw === 'object' && typeof raw.body === 'string' && raw.body) {
    try { return JSON.parse(raw.body); } catch { return raw; }
  }
  return raw || {};
}

exports.main = async (rawEvent) => {
  const event = normalizeEvent(rawEvent);
  const action = String(event.action || '');
  const username = String(event.username || '').trim();
  const password = String(event.password || '');

  const nameErr = checkName(username);
  if (nameErr) return { ok: false, error: nameErr };
  if (password.length < PASS_MIN) return { ok: false, error: 'password_short' };

  if (action === 'register') {
    await ensureCollection();
    if (await findUser(username)) return { ok: false, error: 'user_exists' };

    const salt = crypto.randomBytes(16).toString('hex');
    /* uid 由用户名派生，跨设备稳定；前缀区分自定义账号与匿名会话 */
    const uid = 'bfx_' + nameKey(username);
    const now = new Date().toISOString();

    try {
      await db.collection(USERS).add({
        uid,
        nameKey: nameKey(username),
        username,
        salt,
        hash: hashPassword(password, salt),
        createdAt: now,
        lastLoginAt: now,
      });
    } catch (e) {
      return { ok: false, error: 'write_failed', detail: String((e && e.message) || e) };
    }

    /* 顺带把社区昵称写进 users，登录后资料页能直接显示 */
    try {
      const exist = await db.collection('users').where({ uid }).limit(1).get();
      if (!exist.data || !exist.data.length) {
        await db.collection('users').add({ uid, name: username, createdAt: now, updatedAt: now });
      }
    } catch { /* 社区表不存在/权限不足时不影响注册 */ }

    const t = await issueTicket(uid);
    if (t.error) return { ok: false, error: t.error, detail: t.detail, uid };
    return { ok: true, uid, username, ticket: t.ticket };
  }

  if (action === 'login') {
    const user = await findUser(username);
    if (!user) return { ok: false, error: 'user_not_found' };

    const hash = hashPassword(password, user.salt || '');
    const a = Buffer.from(hash, 'hex');
    const b = Buffer.from(String(user.hash || ''), 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { ok: false, error: 'wrong_password' };
    }

    try {
      await db.collection(USERS).doc(user._id).update({ lastLoginAt: new Date().toISOString() });
    } catch { /* 记录登录时间失败不影响登录 */ }

    const t = await issueTicket(user.uid);
    if (t.error) return { ok: false, error: t.error, detail: t.detail, uid: user.uid };
    return { ok: true, uid: user.uid, username: user.username, ticket: t.ticket };
  }

  return { ok: false, error: 'bad_action' };
};
