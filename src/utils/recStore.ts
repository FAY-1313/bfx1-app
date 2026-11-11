// ─── 录音持久化存储 (IndexedDB) — 多轨工程 v2 ───────────────────────
// C16 (2026-09-02): 录音从「仅内存」改为落盘 (v1: 单条 meta+samples).
// F 批 #5 (2026-09-03): 录音机多轨化 → schema v2:
//   - object store `projects`   (keyPath id): 工程 meta — 含 lanes 配置 (色/名/gain/muted/soloed/时长/波形峰值)
//   - object store `laneSamples`(keyPath id): laneId → Float32 全量采样 (播放/导出才按需加载)
//   旧 v1 数据 (meta/samples 两个 store) 首次打开自动迁移为「1 轨工程」后删除旧 store.
// DB 版本: v1=1 → v2 建新 store=3 → 迁移完成删旧 store=4. (2 留给中间态未用)

export interface RecordingLane {
  /** 全局唯一 laneId (工程内亦唯一) */
  id: string;
  name: string;
  color: string;
  gain: number;
  muted: boolean;
  soloed: boolean;
  /** 本轨时长 (秒); 0 = 空轨 */
  durSec: number;
  /** 波形预览峰值 (min/max 对, 空轨 = 0 长度), 列表/波形快速渲染不必加载全量采样 */
  peaks: Float32Array;
}

export interface ProjectMeta {
  id: string;
  name: string;
  /** 工程总时长 = max(lanes.durSec); 0 = 尚无任何内容 */
  durSec: number;
  /** 工程采样率; 0 = 尚未录过音 (首个 take 落定时以 ctx.sampleRate 补齐) */
  sampleRate: number;
  createdAt: string;
  lanes: RecordingLane[];
}

const DB_NAME = 'bfx_recorder';
const DB_VER_NEW = 3; // 建 projects/laneSamples
const DB_VER_DROP = 4; // 迁移完成后删除 v1 旧 store
const STORE_PROJECTS = 'projects';
const STORE_LANES = 'laneSamples';

let _dbPromise: Promise<IDBDatabase> | null = null;
/** 迁移幂等标记 (进程内): 已确认无 v1 旧库 / 已完成迁移 */
let _migrated = false;

function openDb(): Promise<IDBDatabase> {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER_NEW);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_PROJECTS)) db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(STORE_LANES)) db.createObjectStore(STORE_LANES, { keyPath: 'id' });
    };
    req.onsuccess = () => {
      const db = req.result;
      // 还有 v1 旧 store (meta/samples) → 启动一次自动迁移
      if (!_migrated && db.objectStoreNames.contains('meta')) {
        _migrated = true;
        migrateV1(db).then(() => resolve(db)).catch(e => {
          console.error('[recStore] v1 migration failed, fallback to v3 db:', e);
          _dbPromise = null;
          resolve(db);
        });
        return;
      }
      _migrated = true;
      resolve(db);
    };
    req.onerror = () => { _dbPromise = null; reject(req.error); };
  });
  return _dbPromise;
}

/** 打开 v4 并删除旧 store (供迁移收尾). */
function openDropLegacy(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER_DROP);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (db.objectStoreNames.contains('meta')) db.deleteObjectStore('meta');
      if (db.objectStoreNames.contains('samples')) db.deleteObjectStore('samples');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** v1 → v2 迁移: 每条旧录音 → 1 轨工程; 成功后把 DB 升到 v4 删掉旧 store. */
async function migrateV1(db: IDBDatabase): Promise<void> {
  // 1) 读旧库 (meta 轻量 + samples 全量)
  const metas = await new Promise<any[]>((res, rej) => {
    const t = db.transaction('meta', 'readonly');
    const r = t.objectStore('meta').getAll();
    r.onsuccess = () => res(r.result as any[]);
    r.onerror = () => rej(r.error);
  });
  const samples = await new Promise<any[]>((res, rej) => {
    const t = db.transaction('samples', 'readonly');
    const r = t.objectStore('samples').getAll();
    r.onsuccess = () => res(r.result as any[]);
    r.onerror = () => rej(r.error);
  });
  const sampleById = new Map<string, ArrayBuffer>();
  for (const s of samples) if (s && s.id != null && s.samples) sampleById.set(String(s.id), s.samples as ArrayBuffer);

  const laneIdOf = (recId: string) => `${recId}#l0`;
  const projects: ProjectMeta[] = metas.map(m => ({
    id: String(m.id),
    name: String(m.name ?? ''),
    durSec: Number(m.durSec ?? 0),
    sampleRate: Number(m.sampleRate ?? 0),
    createdAt: String(m.createdAt ?? new Date().toISOString()),
    lanes: [{
      id: laneIdOf(String(m.id)),
      name: String(m.name ?? ''),
      color: '#ff5078',
      gain: 1, muted: false, soloed: false,
      durSec: Number(m.durSec ?? 0),
      peaks: m.peaks instanceof Float32Array ? m.peaks : new Float32Array(0),
    }],
  }));

  // 2) 关旧连接 → 升 v4: 写入 projects/laneSamples + 删 meta/samples
  db.close();
  const db4 = await openDropLegacy();
  await new Promise<void>((resolve, reject) => {
    const t = db4.transaction([STORE_PROJECTS, STORE_LANES], 'readwrite');
    for (const p of projects) t.objectStore(STORE_PROJECTS).put(p);
    for (const [recId, buf] of sampleById) {
      t.objectStore(STORE_LANES).put({ id: laneIdOf(recId), samples: buf });
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
  db4.close();
  console.log(`[recStore] migrated ${projects.length} legacy take(s) to projects`);
}

function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
  return openDb().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(store, mode);
    const req = fn(t.objectStore(store));
    req.onsuccess = () => resolve(req.result as T);
    req.onerror = () => reject(req.error);
  }));
}

/** 工程列表 (轻量 meta, 含各轨 peaks; 按创建时间倒序). */
export async function loadProjects(): Promise<ProjectMeta[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_PROJECTS, 'readonly');
    const req = t.objectStore(STORE_PROJECTS).getAll();
    req.onsuccess = () => {
      const list = (req.result as ProjectMeta[]).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      resolve(list);
    };
    req.onerror = () => reject(req.error);
  });
}

/** 读单个工程 meta. */
export async function getProject(id: string): Promise<ProjectMeta | null> {
  const p = await tx<ProjectMeta | undefined>(STORE_PROJECTS, 'readonly', s => s.get(id));
  return p ?? null;
}

/** 新建工程 (meta 全量写). */
export async function saveProject(meta: ProjectMeta): Promise<void> {
  await tx<void>(STORE_PROJECTS, 'readwrite', s => s.put(meta));
}

/** 覆盖写工程 meta (改名/轨配置/时长变化). samples 由 saveLaneSample 单独管. */
export async function updateProjectMeta(meta: ProjectMeta): Promise<void> {
  await tx<void>(STORE_PROJECTS, 'readwrite', s => s.put(meta));
}

/** 写一轨采样 (Float32Array → 底层 buffer). */
export async function saveLaneSample(laneId: string, samples: Float32Array): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_LANES, 'readwrite');
    t.objectStore(STORE_LANES).put({
      id: laneId,
      samples: samples.buffer.slice(samples.byteOffset, samples.byteOffset + samples.byteLength),
    });
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** 按需加载一轨全量采样 (Float32Array). 无记录返回 null. */
export async function loadLaneSample(laneId: string): Promise<Float32Array | null> {
  const rec = await tx<{ id: string; samples: ArrayBuffer } | undefined>(STORE_LANES, 'readonly', s => s.get(laneId));
  if (!rec) return null;
  return new Float32Array(rec.samples);
}

/** 删除工程 (meta + 全部轨采样). */
export async function deleteProject(id: string): Promise<void> {
  const meta = await getProject(id);
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction([STORE_PROJECTS, STORE_LANES], 'readwrite');
    t.objectStore(STORE_PROJECTS).delete(id);
    for (const l of meta?.lanes ?? []) t.objectStore(STORE_LANES).delete(l.id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}

/** 删除指定轨采样 (删除轨道时用; 保留其它轨). */
export async function deleteLaneSamples(laneIds: string[]): Promise<void> {
  if (!laneIds.length) return;
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const t = db.transaction(STORE_LANES, 'readwrite');
    for (const id of laneIds) t.objectStore(STORE_LANES).delete(id);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
