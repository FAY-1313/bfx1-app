// ─── Looper 工程槽位存储 (IndexedDB) ────────────────────────────────
// 10 个本地槽位, 每个存完整 loop 工程 (20 轨 Float32Array + 节奏参数).
// 用 IndexedDB 而非 localStorage: 整段 44.1k 音频可达数 MB, localStorage 只有 ~5MB.

export interface LoopTrackData {
  data: Float32Array | null;
  gain: number;
}

export interface LoopSession {
  slot: number;
  bars: 1 | 2 | 4;
  timeSig: [number, number];
  bpm: number;
  loopTempo: number;
  masterVol: number;
  tracks: LoopTrackData[];
  savedAt: string;
  /** C15 (2026-09-02): 槽位可选名称 (renameLoopSlot 写入, 保存时透传保留) */
  name?: string;
}

export interface LoopSlotMeta {
  slot: number;
  savedAt: string;
  trackCount: number;
  bars: number;
  name?: string;
}

const DB_NAME = 'bfx_looper';
const DB_VER = 1;
const STORE = 'slots';

let _dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'slot' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const req = fn(t.objectStore(STORE));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

export async function saveLoopSlot(session: LoopSession): Promise<void> {
  await tx('readwrite', s => s.put(session));
}

export async function loadLoopSlot(slot: number): Promise<LoopSession | null> {
  const rec = await tx<LoopSession | undefined>('readonly', s => s.get(slot));
  return rec ?? null;
}

export async function deleteLoopSlot(slot: number): Promise<void> {
  await tx('readwrite', s => s.delete(slot));
}

// C15: 槽位重命名 — 读取现有 session → 写回 name (保留音频数据)
export async function renameLoopSlot(slot: number, name: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE, 'readwrite');
    const store = t.objectStore(STORE);
    const get = store.get(slot);
    get.onsuccess = () => {
      const rec = get.result as LoopSession | undefined;
      if (!rec) { resolve(); return; }
      rec.name = name;
      const put = store.put(rec);
      put.onsuccess = () => resolve();
      put.onerror = () => reject(put.error);
    };
    get.onerror = () => reject(get.error);
  });
}

export async function listLoopSlots(): Promise<LoopSlotMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, 'readonly');
    const req = t.objectStore(STORE).getAll();
    req.onsuccess = () => resolve((req.result as LoopSession[]).map(s => ({
      slot: s.slot,
      savedAt: s.savedAt,
      trackCount: s.tracks ? s.tracks.filter(x => x.data && x.data.length > 0).length : 0,
      bars: s.bars,
      name: s.name,
    })));
    req.onerror = () => reject(req.error);
  });
}
