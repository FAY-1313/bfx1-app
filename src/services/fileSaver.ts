/**
 * BFX1 文件保存 —— 原生 FileSaver 插件的 TS 封装（v74 · 2026-10-16）
 *
 * 背景（用户 2026-10-16 实测反馈）：
 *   「点击导出，没有弹出文件分享，只提示存了 JSON 文件，但是我搜不到。」
 *   根因：Capacitor WebView 里
 *     ① Blob + <a download> 没有 DownloadListener，下载被静默吞掉；
 *     ② navigator.share / canShare({files}) 在本机 WebView 不可用。
 *   所以导出必须走原生落盘（见 android/.../plugins/FileSaverPlugin.java）。
 *
 * 用法：
 *   hasNativeSaver()                    —— 是否在 Android 真机上
 *   savePresetFile(name, text)          —— 一步保存到「下载/BFX1/」
 *   savePresetFileAs(name, text)        —— 调起系统目录选择器，用户自选位置
 */

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

export interface FileSaverPlugin {
  /** 保存到「下载/<subdir>/」，返回用户可读的显示路径 */
  save(options: { filename: string; content: string; subdir?: string; mime?: string }): Promise<{ displayPath: string }>;
  /** 调起系统文档选择器（SAF），由用户选择保存位置 */
  saveAs(options: { filename: string; content: string; mime?: string }): Promise<{ uri: string }>;
  /** v3.68：一次写多个文件到「下载/<subdir>/」 */
  saveMany(options: { files: FilePayload[]; subdir?: string }): Promise<{ displayPaths: string[]; dir: string }>;
  /** v3.68：让用户选一个文件夹（SAF 目录树），把多个文件写进去 */
  saveManyAs(options: { files: FilePayload[]; subdir?: string }): Promise<{ count: number; folder: string; filenames: string[] }>;
}

/** v3.68：一个待写出的文件（本地库三种格式导出用） */
export interface FilePayload {
  filename: string;
  content: string;
  mime?: string;
}

const FileSaver = registerPlugin<FileSaverPlugin>('FileSaver');

/** 当前是否具备原生落盘能力（Android 真机；Web 调试时为 false） */
export function hasNativeSaver(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android';
  } catch { return false; }
}

/** 是否运行在 iOS 原生壳（导出走 Filesystem + 系统分享面板） */
export function isIOSNative(): boolean {
  try {
    return Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'ios';
  } catch { return false; }
}

/**
 * iOS 导出：先把文件写到 App 缓存目录，再交给系统「共享」面板。
 *
 * 为什么不能用 Android 那套：
 *   ① iOS 没有「下载/BFX1」这种公共目录，用户可见位置只能靠「文件」App；
 *   ② WKWebView 里 navigator.share / <a download> 都不可靠（和 Android WebView 同理）。
 * 所以标准做法 = @capacitor/filesystem 落盘 + @capacitor/share 弹面板，
 * 用户在面板里选「存储到文件」即完成导出。
 */
async function exportViaIOS(files: FilePayload[]): Promise<{ ok: boolean; message: string; canceled?: boolean }> {
  const uris: string[] = [];
  try {
    for (const f of files) {
      const path = `BFX1/${f.filename}`;
      await Filesystem.writeFile({
        path,
        data: f.content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
        recursive: true,
      });
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      uris.push(uri);
    }
    await Share.share({
      title: files.length === 1 ? files[0].filename : `BFX1 导出（${files.length} 个文件）`,
      files: uris,
    });
    return {
      ok: true,
      message: files.length === 1
        ? `已导出 ${files[0].filename}（在分享面板选「存储到文件」即可保存）`
        : `已导出 ${files.length} 个文件（在分享面板选「存储到文件」即可保存）`,
    };
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (msg.includes('cancel') || msg.includes('Cancel')) {
      return { ok: false, message: '已取消导出', canceled: true };
    }
    return { ok: false, message: `导出失败：${msg}` };
  }
}

export interface NativeSaveResult {
  ok: boolean;
  /** 给用户看的一句话（含落盘位置或失败原因） */
  message: string;
  /** 走了哪条路径 */
  via: 'native' | 'native-picker' | 'share-file' | 'share-text' | 'download';
  /** 原生落盘成功时的显示路径，如「下载/BFX1/bfx1-presets-5-20261016-2030.json」 */
  displayPath?: string;
}

/**
 * 保存预设文件 —— 原生优先，多级降级。
 *
 * ① Android 原生：MediaStore 写入「下载/BFX1/」（API 29+）→ 立即可搜索；
 *    失败或用户取消则明确告知，不再假装成功。
 * ② 系统分享（带文件）→ 适配桌面浏览器 / 其它 WebView。
 * ③ 纯文本分享。
 * ④ Blob 下载（仅浏览器调试）。
 */
export async function savePresetFileNative(filename: string, text: string): Promise<NativeSaveResult> {
  /* ★ iOS：落缓存 + 系统分享面板（见 exportViaIOS 的说明） */
  if (isIOSNative()) {
    const r = await exportViaIOS([{ filename, content: text, mime: 'application/json' }]);
    return { ok: r.ok, message: r.message, via: 'share-file' };
  }
  if (hasNativeSaver()) {
    try {
      const r = await FileSaver.save({ filename, content: text });
      const dp = r?.displayPath || `下载/BFX1/${filename}`;
      return { ok: true, message: `已保存到 ${dp}`, via: 'native', displayPath: dp };
    } catch (e: any) {
      const msg = String(e?.message || e || '');
      /* 用户主动取消不算错误 */
      if (msg.includes('CANCELED')) {
        return { ok: false, message: '已取消保存', via: 'native' };
      }
      /* 原生失败：落到分享/下载降级，并在消息里保留原因便于排查 */
      const fallback = await savePresetFileFallback(filename, text);
      return { ...fallback, message: fallback.ok ? fallback.message : `原生保存失败（${msg}）` };
    }
  }
  return savePresetFileFallback(filename, text);
}

/** 另存为：调起系统目录选择器，用户自选位置（SAF） */
export async function savePresetFileAsNative(filename: string, text: string): Promise<NativeSaveResult> {
  /* ★ iOS 没有「选择目录」的原生存盘 API，系统分享面板本身就承担「选存到哪」的职责 */
  if (isIOSNative()) {
    const r = await exportViaIOS([{ filename, content: text, mime: 'application/json' }]);
    return { ok: r.ok, message: r.message, via: 'share-file' };
  }
  if (!hasNativeSaver()) {
    return { ok: false, message: '当前环境不支持选择保存位置', via: 'download' };
  }
  try {
    await FileSaver.saveAs({ filename, content: text });
    return { ok: true, message: `已保存 ${filename}`, via: 'native-picker' };
  } catch (e: any) {
    const msg = String(e?.message || e || '');
    if (msg.includes('CANCELED')) return { ok: false, message: '已取消保存', via: 'native-picker' };
    return { ok: false, message: `保存失败：${msg}`, via: 'native-picker' };
  }
}

/* ────────────────────── v3.68：多文件（三种格式）导出 ────────────────────── */

export interface MultiSaveResult {
  ok: boolean;
  /** 给用户看的一句话 */
  message: string;
  /** 走了哪条路径：系统默认下载目录 / 用户选的文件夹 */
  via: 'native' | 'picker' | 'unsupported';
  /** 落盘目录（用户可读） */
  dir?: string;
  /** 实际写出的文件名 */
  filenames?: string[];
}

const isCancel = (e: any) => String(e?.message || e || '').includes('CANCELED');

/** 导出到系统默认目录「下载/BFX1/」—— 一步完成，不需要用户操作 */
export async function saveFilesNative(files: FilePayload[], subdir = 'BFX1'): Promise<MultiSaveResult> {
  if (isIOSNative()) {
    const r = await exportViaIOS(files);
    return {
      ok: r.ok,
      message: r.message,
      via: r.ok ? 'picker' : 'unsupported',
      dir: r.ok ? '系统分享面板' : undefined,
      filenames: r.ok ? files.map((f) => f.filename) : undefined,
    };
  }
  if (!hasNativeSaver()) {
    return { ok: false, message: '当前环境不支持写入手机文件夹', via: 'unsupported' };
  }
  try {
    const r = await FileSaver.saveMany({ files, subdir });
    return {
      ok: true,
      message: `已保存 ${files.length} 个文件到 ${r?.dir || `下载/${subdir}`}`,
      via: 'native',
      dir: r?.dir || `下载/${subdir}`,
      filenames: files.map((f) => f.filename),
    };
  } catch (e: any) {
    if (isCancel(e)) return { ok: false, message: '已取消导出', via: 'native' };
    return { ok: false, message: `保存失败：${String(e?.message || e)}`, via: 'native' };
  }
}

/** 让用户自己选一个文件夹再写进去（SAF 目录树）——「打开本地文件夹并保存到里面」 */
export async function saveFilesAsNative(files: FilePayload[], subdir = 'BFX1'): Promise<MultiSaveResult> {
  if (isIOSNative()) {
    const r = await exportViaIOS(files);
    return {
      ok: r.ok,
      message: r.message,
      via: r.ok ? 'picker' : 'unsupported',
      dir: r.ok ? '系统分享面板' : undefined,
      filenames: r.ok ? files.map((f) => f.filename) : undefined,
    };
  }
  if (!hasNativeSaver()) {
    return { ok: false, message: '当前环境不支持选择文件夹', via: 'unsupported' };
  }
  try {
    const r = await FileSaver.saveManyAs({ files, subdir });
    const where = r?.folder ? `所选文件夹/${r.folder}` : '所选文件夹';
    return {
      ok: true,
      message: `已保存 ${r?.count ?? files.length} 个文件到${where}`,
      via: 'picker',
      dir: where,
      filenames: r?.filenames || files.map((f) => f.filename),
    };
  } catch (e: any) {
    if (isCancel(e)) return { ok: false, message: '已取消导出', via: 'picker' };
    return { ok: false, message: `保存失败：${String(e?.message || e)}`, via: 'picker' };
  }
}

/* ────────────────────────── 非原生环境降级链 ────────────────────────── */

function canShareFiles(): boolean {
  try {
    return typeof navigator !== 'undefined'
      && typeof navigator.canShare === 'function'
      && typeof File !== 'undefined'
      && navigator.canShare({ files: [new File(['x'], 'probe.json', { type: 'application/json' })] });
  } catch { return false; }
}

async function savePresetFileFallback(filename: string, text: string): Promise<NativeSaveResult> {
  /* ② 系统分享面板 + 文件 */
  if (canShareFiles()) {
    try {
      const file = new File([text], filename, { type: 'application/json' });
      await navigator.share({ files: [file], title: filename, text: 'BFX1 预设文件' });
      return { ok: true, message: `已导出 ${filename}（可在系统面板选择保存位置）`, via: 'share-file' };
    } catch (e: any) {
      if (e && (e.name === 'AbortError' || String(e.message || '').includes('cancel'))) {
        return { ok: false, message: '已取消导出', via: 'share-file' };
      }
    }
  }

  /* ③ 纯文本分享 */
  if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title: filename, text });
      return { ok: true, message: `已导出 ${filename}（文本形式，可粘贴保存）`, via: 'share-text' };
    } catch (e: any) {
      if (e && (e.name === 'AbortError' || String(e.message || '').includes('cancel'))) {
        return { ok: false, message: '已取消导出', via: 'share-text' };
      }
    }
  }

  /* ④ Blob 下载（仅浏览器调试有效） */
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.setTimeout(() => URL.revokeObjectURL(url), 4000);
    return { ok: true, message: `已触发下载 ${filename}`, via: 'download' };
  } catch (e: any) {
    return { ok: false, message: `导出失败：${e?.message || e}`, via: 'download' };
  }
}

export default FileSaver;
