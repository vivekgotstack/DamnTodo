export type TaskStatus = "backlog" | "scheduled" | "completed";
export type Priority = "low" | "medium" | "high";

export interface Task {
  id: string;
  title: string;
  notes: string;
  status: TaskStatus;
  priority: Priority;
  duration: number;
  dueAt: string | null;
  scheduledAt: string | null;
  reminderMinutes: number | null;
  remindedFor: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PlannerSettings {
  dayStart: string;
  dayEnd: string;
  workDays: number[];
  planningDays: number;
  defaultDuration: number;
  sound: boolean;
}

export interface PlannerState {
  tasks: Task[];
  settings: PlannerSettings;
  version: 2;
}

export const DEFAULT_SETTINGS: PlannerSettings = {
  dayStart: "09:00",
  dayEnd: "18:00",
  workDays: [1, 2, 3, 4, 5],
  planningDays: 7,
  defaultDuration: 30,
  sound: true,
};

export const DEFAULT_STATE: PlannerState = {
  tasks: [],
  settings: DEFAULT_SETTINGS,
  version: 2,
};

export interface TaskDraft {
  title: string;
  notes: string;
  priority: Priority;
  duration: number;
  dueAt: string;
  scheduledAt: string;
  reminderMinutes: number | null;
}

export const emptyDraft = (duration = 30): TaskDraft => ({
  title: "",
  notes: "",
  priority: "medium",
  duration,
  dueAt: "",
  scheduledAt: "",
  reminderMinutes: 30,
});

export function createTask(draft: TaskDraft): Task {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    status: draft.scheduledAt ? "scheduled" : "backlog",
    priority: draft.priority,
    duration: draft.duration,
    dueAt: draft.dueAt || null,
    scheduledAt: draft.scheduledAt || null,
    reminderMinutes: draft.dueAt ? draft.reminderMinutes : null,
    remindedFor: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function draftFromTask(task: Task): TaskDraft {
  return {
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    duration: task.duration,
    dueAt: task.dueAt ?? "",
    scheduledAt: task.scheduledAt ?? "",
    reminderMinutes: task.reminderMinutes,
  };
}

function timeParts(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return { hours, minutes };
}

function atTime(date: Date, value: string) {
  const next = new Date(date);
  const { hours, minutes } = timeParts(value);
  next.setHours(hours, minutes, 0, 0);
  return next;
}

function toLocalInput(date: Date) {
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
}

function dateKey(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function priorityWeight(priority: Priority) {
  return priority === "high" ? 0 : priority === "medium" ? 1 : 2;
}

export function autoSchedule(tasks: Task[], settings: PlannerSettings) {
  const now = new Date();
  const backlog = tasks
    .filter((task) => task.status === "backlog")
    .sort((a, b) => {
      const dueA = a.dueAt ? new Date(a.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      const dueB = b.dueAt ? new Date(b.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
      return dueA - dueB || priorityWeight(a.priority) - priorityWeight(b.priority) || a.createdAt.localeCompare(b.createdAt);
    });

  if (!backlog.length) return { tasks, scheduled: 0, overflow: 0 };

  const candidates: Array<{ date: Date; key: string; load: number; capacity: number }> = [];
  const cursor = new Date(now);
  cursor.setHours(0, 0, 0, 0);
  let daysScanned = 0;

  while (candidates.length < settings.planningDays && daysScanned < 31) {
    if (settings.workDays.includes(cursor.getDay())) {
      const start = atTime(cursor, settings.dayStart);
      const end = atTime(cursor, settings.dayEnd);
      if (dateKey(cursor) !== dateKey(now) || end > now) {
        const effectiveStart = dateKey(cursor) === dateKey(now) && now > start
          ? new Date(Math.ceil(now.getTime() / 900_000) * 900_000)
          : start;
        candidates.push({
          date: new Date(cursor),
          key: dateKey(cursor),
          load: Math.max(0, Math.round((effectiveStart.getTime() - start.getTime()) / 60_000)),
          capacity: Math.max(0, Math.round((end.getTime() - start.getTime()) / 60_000)),
        });
      }
    }
    cursor.setDate(cursor.getDate() + 1);
    daysScanned += 1;
  }

  for (const task of tasks.filter((item) => item.status === "scheduled" && item.scheduledAt)) {
    const day = candidates.find((candidate) => candidate.key === dateKey(task.scheduledAt!));
    if (day) day.load += task.duration;
  }

  const updates = new Map<string, Task>();
  let overflow = 0;

  for (const task of backlog) {
    const dueTime = task.dueAt ? new Date(task.dueAt).getTime() : Number.MAX_SAFE_INTEGER;
    const viable = candidates.filter((day) => {
      const start = atTime(day.date, settings.dayStart);
      return start.getTime() <= dueTime && day.load + task.duration <= day.capacity;
    });
    const fallback = candidates.filter((day) => day.load + task.duration <= day.capacity);
    const pool = viable.length ? viable : fallback;
    const chosen = [...pool].sort((a, b) => a.load - b.load || a.date.getTime() - b.date.getTime())[0];
    if (!chosen) {
      overflow += 1;
      continue;
    }

    const scheduled = atTime(chosen.date, settings.dayStart);
    scheduled.setMinutes(scheduled.getMinutes() + chosen.load);
    chosen.load += task.duration;
    updates.set(task.id, {
      ...task,
      status: "scheduled",
      scheduledAt: toLocalInput(scheduled),
      updatedAt: new Date().toISOString(),
    });
  }

  return {
    tasks: tasks.map((task) => updates.get(task.id) ?? task),
    scheduled: updates.size,
    overflow,
  };
}

export function scheduleToday(task: Task, tasks: Task[], settings: PlannerSettings) {
  const now = new Date();
  const start = atTime(now, settings.dayStart);
  const end = atTime(now, settings.dayEnd);
  const todayTasks = tasks
    .filter((item) => item.status === "scheduled" && item.scheduledAt && dateKey(item.scheduledAt) === dateKey(now))
    .sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
  const last = todayTasks.at(-1);
  const lastEnd = last?.scheduledAt
    ? new Date(new Date(last.scheduledAt).getTime() + last.duration * 60_000)
    : start;
  const slot = new Date(Math.max(now.getTime(), start.getTime(), lastEnd.getTime()));
  slot.setMinutes(Math.ceil(slot.getMinutes() / 15) * 15, 0, 0);
  if (slot.getTime() + task.duration * 60_000 > end.getTime()) return null;
  return toLocalInput(slot);
}

export function isSameDay(value: string | null, date = new Date()) {
  return Boolean(value && dateKey(value) === dateKey(date));
}

export function dueState(task: Task): "overdue" | "soon" | "later" | "none" {
  if (!task.dueAt || task.status === "completed") return "none";
  const diff = new Date(task.dueAt).getTime() - Date.now();
  if (diff < 0) return "overdue";
  if (diff <= 24 * 60 * 60 * 1000) return "soon";
  return "later";
}

export function formatDateTime(value: string) {
  const date = new Date(value);
  const today = isSameDay(value);
  const tomorrow = dateKey(date) === dateKey(new Date(Date.now() + 86_400_000));
  const day = today ? "Today" : tomorrow ? "Tomorrow" : new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" }).format(date);
  return `${day}, ${new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(date)}`;
}

export function formatDuration(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function localDateTime(date = new Date()) {
  return toLocalInput(date);
}
