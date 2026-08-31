import { DEFAULT_STATE, type PlannerState, type Task } from "./planner";

const DB_NAME = "damntodo-offline";
const STORE_NAME = "planner";
const STATE_KEY = "state-v2";
const FALLBACK_KEY = "damntodo-state-v2";

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadState(): Promise<PlannerState> {
  try {
    if (typeof indexedDB === "undefined") return readFallbackState();
    const db = await openDatabase();
    const stored = await new Promise<PlannerState | undefined>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result as PlannerState | undefined);
      request.onerror = () => reject(request.error);
    });
    db.close();
    if (stored?.version === 2 && Array.isArray(stored.tasks)) {
      return {
        ...DEFAULT_STATE,
        ...stored,
        settings: { ...DEFAULT_STATE.settings, ...stored.settings },
      };
    }
  } catch (error) {
    console.error("Could not read offline planner data", error);
  }
  return readFallbackState();
}

export async function saveState(state: PlannerState) {
  try {
    if (typeof indexedDB === "undefined") throw new Error("IndexedDB unavailable");
    const db = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readwrite").objectStore(STORE_NAME).put(state, STATE_KEY);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
    db.close();
    localStorage.removeItem(FALLBACK_KEY);
  } catch {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(state));
  }
}

function readFallbackState(): PlannerState {
  try {
    const raw = localStorage.getItem(FALLBACK_KEY);
    if (!raw) return migrateLegacyTodos();
    const stored = JSON.parse(raw) as PlannerState;
    if (stored.version !== 2 || !Array.isArray(stored.tasks)) return migrateLegacyTodos();
    return { ...DEFAULT_STATE, ...stored, settings: { ...DEFAULT_STATE.settings, ...stored.settings } };
  } catch {
    return migrateLegacyTodos();
  }
}

function migrateLegacyTodos(): PlannerState {
  try {
    const raw = localStorage.getItem("todos");
    if (!raw) return DEFAULT_STATE;
    const legacy = JSON.parse(raw) as Array<{ id?: string; msg?: string }>;
    const now = new Date().toISOString();
    const tasks: Task[] = legacy
      .filter((item) => item.msg?.trim())
      .map((item) => ({
        id: item.id ?? crypto.randomUUID(),
        title: item.msg!.trim(),
        notes: "",
        status: "backlog",
        priority: "medium",
        duration: 30,
        dueAt: null,
        scheduledAt: null,
        reminderMinutes: null,
        remindedFor: null,
        createdAt: now,
        updatedAt: now,
        completedAt: null,
      }));
    localStorage.removeItem("todos");
    return { ...DEFAULT_STATE, tasks };
  } catch {
    return DEFAULT_STATE;
  }
}
