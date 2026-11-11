#!/usr/bin/env node
/**
 * BFX1 · i18n 死键检查（G6 · 2026-10-17）
 *
 * 背景：`bt.connected` 这类键在功能改版后（连接成功改为「设备图亮起」）就没人引用了，
 *       但字典里还留着中英两条 —— 久而久之字典与界面脱节，改文案时容易改错地方。
 *
 * 用法：
 *   node scripts/check-i18n-unused.mjs           # 列出未使用的键，有则退出码 1
 *   node scripts/check-i18n-unused.mjs --json    # 机器可读输出
 *
 * 判定：把 src 下所有 .ts/.tsx（不含 i18n 自身）拼成一个大字符串，键在其中出现即算被引用；
 *       另外识别「模板前缀」写法（如 `menu.mod.${id}` / 'toast.' + name），
 *       凡命中前缀的键一律算已使用，避免误报。
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

/* 注意：工程路径含中文，必须用 fileURLToPath 解码（import.meta.url 是百分号编码的） */
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'src');
const I18N = join(SRC, 'i18n', 'index.tsx');

const asJson = process.argv.includes('--json');

/** 递归收集源文件 */
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (name === 'node_modules' || name === 'dist') continue;
      walk(p, out);
    } else if (['.ts', '.tsx'].includes(extname(p))) {
      out.push(p);
    }
  }
  return out;
}

const i18nSrc = readFileSync(I18N, 'utf8');

/** 字典键：仅取形如  'a.b.c': '...'  的行首键，避免匹配到文案里的冒号 */
const keys = [...new Set(
  [...i18nSrc.matchAll(/^\s*'([a-zA-Z][\w.]*)':/gm)].map((m) => m[1]),
)].sort();

/** 所有引用方源码拼成一个大字符串 */
let blob = '';
for (const file of walk(SRC)) {
  if (file.replace(/\\/g, '/').endsWith('/i18n/index.tsx')) continue;
  blob += readFileSync(file, 'utf8') + '\n';
}

/** 动态前缀：`key.prefix${...}` 或 'key.prefix' + ... */
const dynPrefixes = new Set();
for (const m of blob.matchAll(/[`'"]([a-zA-Z][\w.]*\.)\$\{/g)) dynPrefixes.add(m[1]);
for (const m of blob.matchAll(/[`'"]([a-zA-Z][\w.]*\.)['"]\s*\+/g)) dynPrefixes.add(m[1]);

const isUsed = (k) =>
  blob.includes(`'${k}'`) ||
  blob.includes(`"${k}"`) ||
  blob.includes(`\`${k}\``) ||
  [...dynPrefixes].some((p) => k.startsWith(p));

const unused = keys.filter((k) => !isUsed(k));

if (asJson) {
  console.log(JSON.stringify({ total: keys.length, unused }, null, 2));
} else {
  console.log(`i18n 键总数 ${keys.length}，未被引用 ${unused.length} 个`);
  for (const k of unused) console.log('  ·', k);
  if (unused.length) {
    console.log('\n若确认这些键已废弃，请从中英两份字典里一并删除。');
  } else {
    console.log('✓ 没有死键');
  }
}

process.exit(unused.length ? 1 : 0);
