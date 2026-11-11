/**
 * BFX1 前端 API 服务
 *
 * 与后端服务器通信，处理用户认证、预设云存储、TONE3000 数据加载
 */

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001";

// ─── 用户认证 ────────────────────────────────────────────────────────

export interface User {
  id: number;
  username: string;
  email: string;
  role: string;
  storage_used?: number;
  storage_limit?: number;
}

interface AuthResponse {
  token: string;
  user: User;
}

function getToken(): string | null {
  return localStorage.getItem("bfx1_token");
}

function setToken(token: string) {
  localStorage.setItem("bfx1_token", token);
}

export function clearToken() {
  localStorage.removeItem("bfx1_token");
}

export function isLoggedIn(): boolean {
  return !!getToken();
}

async function request(path: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
  if (res.status === 401) {
    clearToken();
    throw new Error("登录已过期，请重新登录");
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "请求失败");
  return data;
}

export async function register(username: string, email: string, password: string): Promise<AuthResponse> {
  const data = await request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify({ username, email, password }),
  });
  setToken(data.token);
  return data;
}

export async function login(username: string, password: string): Promise<AuthResponse> {
  const data = await request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
  setToken(data.token);
  return data;
}

export async function getMe(): Promise<User> {
  const data = await request("/api/auth/me");
  return data.user;
}

// ─── 预设管理 ────────────────────────────────────────────────────────

export interface Preset {
  id: number;
  name: string;
  description: string;
  is_public: boolean;
  tags: string[];
  tone_score: number;
  download_count: number;
  created_at: string;
  updated_at: string;
  module_data?: Record<string, any>;
  knob_values?: Record<string, Record<string, number>>;
  ble_register_values?: Record<string, number>;
  username?: string;
}

export async function getMyPresets(): Promise<Preset[]> {
  const data = await request("/api/presets");
  return data.presets;
}

export async function getPublicPresets(page = 1, limit = 20, search?: string, tag?: string): Promise<{ presets: Preset[]; total: number }> {
  const params = new URLSearchParams({ page: String(page), limit: String(limit) });
  if (search) params.set("search", search);
  if (tag) params.set("tag", tag);
  const data = await request(`/api/presets/public?${params.toString()}`);
  return data;
}

export async function getPreset(id: number): Promise<Preset> {
  return await request(`/api/presets/${id}`);
}

export async function createPreset(preset: {
  name: string;
  description?: string;
  module_data?: any;
  knob_values?: any;
  ble_register_values?: any;
  is_public?: boolean;
  tags?: string[];
}): Promise<{ id: number }> {
  return await request("/api/presets", {
    method: "POST",
    body: JSON.stringify(preset),
  });
}

export async function updatePreset(id: number, updates: Partial<Preset>): Promise<void> {
  await request(`/api/presets/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates),
  });
}

export async function deletePreset(id: number): Promise<void> {
  await request(`/api/presets/${id}`, { method: "DELETE" });
}

export async function downloadPreset(id: number): Promise<void> {
  await request(`/api/presets/${id}/download`, { method: "POST" });
}

// ─── TONE3000 API ────────────────────────────────────────────────────

export interface Tone3000Tone {
  id: string;
  name: string;
  description: string;
  platform: string;
  gear_type: string;
  architect: string;
  author: string;
  rating: number;
  downloads: number;
  tags: string[];
  created_at: string;
  parameters?: Record<string, number>;
}

export async function getTone3000Tones(params: {
  page?: number;
  limit?: number;
  platform?: string;
  gear_type?: string;
  architect?: string;
  search?: string;
}): Promise<{ tones: Tone3000Tone[]; total: number; page: number }> {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v) searchParams.set(k, String(v)); });
  try {
    // Try local backend proxy first
    return await request(`/api/tone3000/tones?${searchParams.toString()}`);
  } catch {
    // Fallback: try direct TONE3000 API
    try {
      const res = await fetch(`https://www.tone3000.com/api/tones?${searchParams.toString()}`);
      if (res.ok) return await res.json();
    } catch { /* ignore */ }
    // Return empty with mock data as final fallback
    return {
      tones: [
        { id: 'demo-1', name: 'Demo Clean Tone', description: 'Clean guitar tone', platform: 'guitar', gear_type: 'amp', architect: 'demo', author: 'demo', rating: 4.5, downloads: 1200, tags: ['clean'], created_at: new Date().toISOString() },
        { id: 'demo-2', name: 'Demo Crunch', description: 'Crunch rhythm tone', platform: 'guitar', gear_type: 'amp', architect: 'demo', author: 'demo', rating: 4.2, downloads: 800, tags: ['crunch'], created_at: new Date().toISOString() },
        { id: 'demo-3', name: 'Demo Lead', description: 'Lead solo tone', platform: 'guitar', gear_type: 'amp', architect: 'demo', author: 'demo', rating: 4.8, downloads: 2500, tags: ['lead'], created_at: new Date().toISOString() },
        { id: 'demo-4', name: 'Demo Bass', description: 'Bass DI tone', platform: 'bass', gear_type: 'amp', architect: 'demo', author: 'demo', rating: 4.0, downloads: 600, tags: ['bass'], created_at: new Date().toISOString() },
      ],
      total: 4,
      page: 1,
    };
  }
}

export async function getTone3000Tone(id: string): Promise<Tone3000Tone> {
  return await request(`/api/tone3000/tones/${id}`);
}

// ─── NAM/IR 文件记录 ────────────────────────────────────────────────

export async function saveNAMIrRecord(record: {
  filename: string;
  file_type: string;
  file_size: number;
  analysis_result: any;
  register_suggestions: any[];
}): Promise<{ id: number }> {
  return await request("/api/nam-ir", {
    method: "POST",
    body: JSON.stringify(record),
  });
}

export async function getNAMIrRecords(): Promise<{ files: any[] }> {
  return await request("/api/nam-ir");
}
