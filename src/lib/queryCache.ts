/**
 * queryCache.ts — Cache layer nhẹ cho Supabase queries
 * Pattern: stale-while-revalidate
 *  - Trả về cache cũ ngay lập tức (không chờ network)
 *  - Đồng thời fetch dữ liệu mới ngầm, cập nhật khi xong
 *  - TTL mặc định 60 giây (sau đó coi là stale, fetch lại)
 */

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

// In-memory cache (mất khi reload trang)
const memCache = new Map<string, CacheEntry<any>>();

// Các key đang được fetch (tránh duplicate requests)
const inflight = new Map<string, Promise<any>>();

const TTL_MS = 60_000; // 60 giây

/** Lấy từ localStorage nếu có */
function getFromStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(`qc:${key}`);
    if (!raw) return null;
    const entry: CacheEntry<T> = JSON.parse(raw);
    return entry.data;
  } catch {
    return null;
  }
}

/** Lưu vào localStorage */
function saveToStorage<T>(key: string, data: T): void {
  try {
    const entry: CacheEntry<T> = { data, timestamp: Date.now() };
    localStorage.setItem(`qc:${key}`, JSON.stringify(entry));
  } catch {
    // localStorage đầy hoặc private mode — bỏ qua
  }
}

/** Kiểm tra cache còn fresh không */
function isFresh(key: string): boolean {
  const entry = memCache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < TTL_MS;
}

/**
 * cachedQuery — Wrapper cho Supabase query với stale-while-revalidate
 *
 * @param key      Key duy nhất cho query này (vd: 'products', 'transactions:2024-01')
 * @param fetcher  Async function trả về dữ liệu
 * @param onUpdate Callback nhận data mới (để setXxx trong component)
 * @returns        Data từ cache (hoặc null nếu chưa có cache)
 */
export async function cachedQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  onUpdate?: (data: T) => void
): Promise<T | null> {

  // 1. Trả ngay từ memory cache nếu còn fresh
  const memEntry = memCache.get(key);
  if (memEntry && isFresh(key)) {
    return memEntry.data as T;
  }

  // 2. Trả ngay từ localStorage (stale OK) trong khi fetch ngầm
  const stored = getFromStorage<T>(key);
  if (stored && onUpdate) {
    onUpdate(stored); // Hiển thị data cũ ngay
  }

  // 3. Tránh fetch duplicate nếu đã đang chạy
  if (inflight.has(key)) {
    const fresh = await inflight.get(key);
    if (onUpdate && fresh) onUpdate(fresh);
    return fresh;
  }

  // 4. Fetch mới
  const fetchPromise = fetcher().then((data) => {
    // Lưu vào cache
    memCache.set(key, { data, timestamp: Date.now() });
    saveToStorage(key, data);
    if (onUpdate) onUpdate(data);
    inflight.delete(key);
    return data;
  }).catch((err) => {
    inflight.delete(key);
    console.warn(`[queryCache] fetch error for key "${key}":`, err?.message);
    // Trả stored data nếu fetch lỗi
    return stored;
  });

  inflight.set(key, fetchPromise);

  // Nếu không có stored data, chờ fetch xong
  if (!stored) {
    return fetchPromise;
  }

  // Có stored data rồi → trả về stored, fetch chạy ngầm
  return stored;
}

/** Xóa cache của một key (sau khi save/update) */
export function invalidateCache(key: string): void {
  memCache.delete(key);
  try { localStorage.removeItem(`qc:${key}`); } catch {}
}

/** Xóa cache theo prefix (vd: invalidateCachePrefix('transactions') xóa tất cả transaction cache) */
export function invalidateCachePrefix(prefix: string): void {
  for (const key of memCache.keys()) {
    if (key.startsWith(prefix)) memCache.delete(key);
  }
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`qc:${prefix}`)) localStorage.removeItem(k);
    }
  } catch {}
}
