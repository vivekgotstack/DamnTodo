import { DEFAULT_STATE, type Plan, type PlannerSettings, type PlannerState, type Roadmap, type Task } from "./planner";

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
    const stored = await new Promise<unknown>((resolve, reject) => {
      const request = db.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(STATE_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    const upgraded = upgradePlannerState(stored);
    if (upgraded) return upgraded;
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
    return upgradePlannerState(JSON.parse(raw)) ?? migrateLegacyTodos();
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

type StoredState = {
  version?: number;
  tasks?: Task[];
  roadmaps?: Roadmap[];
  plans?: Plan[];
  settings?: Partial<PlannerSettings>;
};

function roadmapsFromLegacyTasks(tasks: Task[], settings: PlannerSettings) {
  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    if (!task.goalId) continue;
    groups.set(task.goalId, [...(groups.get(task.goalId) ?? []), task]);
  }
  return [...groups.entries()].map(([id, sessions]): Roadmap => {
    const ordered = [...sessions].sort((a, b) => (a.sessionIndex ?? 0) - (b.sessionIndex ?? 0));
    const first = ordered[0];
    const scheduled = sessions.map((task) => task.scheduledAt).filter((value): value is string => Boolean(value)).sort();
    const workDays = [...new Set(scheduled.map((value) => new Date(value).getDay()))];
    return {
      id,
      title: first.title,
      notes: first.notes,
      priority: first.priority,
      startDate: (scheduled[0] ?? first.createdAt).slice(0, 10),
      endDate: (first.dueAt ?? scheduled.at(-1) ?? first.createdAt).slice(0, 10),
      sessionDuration: first.duration,
      workDays: workDays.length ? workDays : settings.workDays,
      planMode: "daily",
      scheduleStyle: "fixed",
      fixedTime: scheduled[0]?.slice(11, 16) ?? settings.dayStart,
      randomStart: settings.dayStart,
      randomEnd: settings.dayEnd,
      alarmMode: first.alarmMode ?? (first.reminderMinutes === null ? "none" : "gentle"),
      reminderMinutes: first.reminderMinutes,
      createdAt: first.createdAt,
      updatedAt: sessions.reduce((latest, task) => task.updatedAt > latest ? task.updatedAt : latest, first.updatedAt),
    };
  });
}

export function upgradePlannerState(value: unknown): PlannerState | null {
  if (!value || typeof value !== "object") return null;
  const stored = value as StoredState;
  if (!Array.isArray(stored.tasks) || (stored.version !== 2 && stored.version !== 3 && stored.version !== 4)) return null;
  const settings = { ...DEFAULT_STATE.settings, ...stored.settings };
  const tasks = stored.tasks.map((task) => ({
    ...task,
    alarmMode: task.alarmMode ?? (task.reminderMinutes === null ? "none" : "gentle"),
    alarmModeLocked: task.alarmModeLocked ?? Boolean(task.scheduledAt),
    snoozedUntil: task.snoozedUntil ?? null,
    backlogAlarmTime: task.backlogAlarmTime ?? "09:00",
    backlogAlarmStartsAt: task.backlogAlarmStartsAt ?? null,
    goalId: task.goalId ?? null,
    sessionIndex: task.sessionIndex ?? null,
    sessionCount: task.sessionCount ?? null,
    totalGoalMinutes: task.totalGoalMinutes ?? null,
    plannedFor: task.plannedFor ?? task.scheduledAt ?? null,
    missedAt: task.missedAt ?? null,
  }));
  return {
    version: 4,
    tasks,
    roadmaps: (stored.version === 3 || stored.version === 4) && Array.isArray(stored.roadmaps) ? stored.roadmaps : roadmapsFromLegacyTasks(tasks, settings),
    plans: stored.version === 4 && Array.isArray(stored.plans) ? stored.plans : [],
    settings,
  };
}
