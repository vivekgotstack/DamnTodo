export type TaskStatus = "backlog" | "scheduled" | "completed";
export type Priority = "low" | "medium" | "high";
export type AlarmMode = "none" | "gentle" | "strict";
export type DraftKind = "task" | "goal";
export type RoadmapPlanMode = "daily" | "custom";
export type ScheduleStyle = "fixed" | "random";

export interface Roadmap {
  id: string;
  title: string;
  notes: string;
  priority: Priority;
  startDate: string;
  endDate: string;
  sessionDuration: number;
  workDays: number[];
  planMode: RoadmapPlanMode;
  scheduleStyle: ScheduleStyle;
  fixedTime: string;
  randomStart: string;
  randomEnd: string;
  alarmMode: AlarmMode;
  reminderMinutes: number | null;
  createdAt: string;
  updatedAt: string;
}

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
  alarmMode?: AlarmMode;
  alarmModeLocked?: boolean;
  snoozedUntil?: string | null;
  backlogAlarmTime?: string;
  backlogAlarmStartsAt?: string | null;
  goalId?: string | null;
  sessionIndex?: number | null;
  sessionCount?: number | null;
  totalGoalMinutes?: number | null;
  plannedFor?: string | null;
  missedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface PlanItem {
  id: string;
  text: string;
  completed: boolean;
}

export interface Plan {
  id: string;
  title: string;
  items: PlanItem[];
  createdAt: string;
  updatedAt: string;
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
  roadmaps: Roadmap[];
  plans: Plan[];
  settings: PlannerSettings;
  version: 4;
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
  roadmaps: [],
  plans: [],
  settings: DEFAULT_SETTINGS,
  version: 4,
};

export interface TaskDraft {
  kind: DraftKind;
  title: string;
  notes: string;
  priority: Priority;
  duration: number;
  dueAt: string;
  scheduledAt: string;
  reminderMinutes: number | null;
  alarmMode: AlarmMode;
  backlogAlarmTime: string;
  availableFrom: string;
  totalDuration: number;
  maxSessionDuration: number;
  roadmapPlanMode: RoadmapPlanMode;
  customTasks: string;
  roadmapWorkDays: number[];
  scheduleStyle: ScheduleStyle;
  fixedTime: string;
  randomStart: string;
  randomEnd: string;
}

export const emptyDraft = (duration = 30): TaskDraft => ({
  kind: "task",
  title: "",
  notes: "",
  priority: "medium",
  duration,
  dueAt: "",
  scheduledAt: "",
  reminderMinutes: 30,
  alarmMode: "gentle",
  backlogAlarmTime: "09:00",
  availableFrom: toLocalInput(new Date()).slice(0, 10),
  totalDuration: 300,
  maxSessionDuration: 60,
  roadmapPlanMode: "daily",
  customTasks: "",
  roadmapWorkDays: [0, 1, 2, 3, 4, 5, 6],
  scheduleStyle: "fixed",
  fixedTime: "19:00",
  randomStart: "18:00",
  randomEnd: "21:00",
});

export function createTask(draft: TaskDraft): Task {
  const now = new Date().toISOString();
  const alarmMode = draft.scheduledAt ? draft.alarmMode : "none";
  return {
    id: crypto.randomUUID(),
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    status: draft.scheduledAt ? "scheduled" : "backlog",
    priority: draft.priority,
    duration: draft.duration,
    dueAt: draft.dueAt || null,
    scheduledAt: draft.scheduledAt || null,
    reminderMinutes: alarmMode === "none" ? null : 0,
    remindedFor: null,
    alarmMode,
    alarmModeLocked: Boolean(draft.scheduledAt),
    snoozedUntil: null,
    backlogAlarmTime: draft.backlogAlarmTime || "09:00",
    backlogAlarmStartsAt: null,
    goalId: null,
    sessionIndex: null,
    sessionCount: null,
    totalGoalMinutes: null,
    plannedFor: draft.scheduledAt || null,
    missedAt: null,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
  };
}

export function draftFromTask(task: Task): TaskDraft {
  return {
    kind: "task",
    title: task.title,
    notes: task.notes,
    priority: task.priority,
    duration: task.duration,
    dueAt: task.dueAt ?? "",
    scheduledAt: task.scheduledAt ?? "",
    reminderMinutes: task.reminderMinutes,
    alarmMode: task.alarmMode ?? (task.reminderMinutes === null ? "none" : "gentle"),
    backlogAlarmTime: task.backlogAlarmTime ?? "09:00",
    availableFrom: (task.scheduledAt ?? task.createdAt).slice(0, 10),
    totalDuration: task.totalGoalMinutes ?? task.duration,
    maxSessionDuration: task.duration,
    roadmapPlanMode: "daily",
    customTasks: "",
    roadmapWorkDays: [0, 1, 2, 3, 4, 5, 6],
    scheduleStyle: "fixed",
    fixedTime: task.scheduledAt?.slice(11, 16) ?? "19:00",
    randomStart: "18:00",
    randomEnd: "21:00",
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

function minutesFromTime(value: string) {
  const { hours, minutes } = timeParts(value);
  return hours * 60 + minutes;
}

function stableNumber(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result);
}

function roadmapTime(draft: TaskDraft, roadmapId: string, day: Date, ordinal: number) {
  const start = draft.scheduleStyle === "fixed" ? minutesFromTime(draft.fixedTime) : minutesFromTime(draft.randomStart);
  const end = draft.scheduleStyle === "fixed" ? start : minutesFromTime(draft.randomEnd);
  const latestStart = Math.max(start, end - draft.duration);
  const span = Math.max(0, latestStart - start);
  const randomOffset = span ? stableNumber(`${roadmapId}:${dateKey(day)}:${ordinal}`) % (span + 1) : 0;
  const requested = draft.scheduleStyle === "random" ? start + randomOffset : start + ordinal * draft.duration;
  const base = Math.min(requested, Math.max(0, 24 * 60 - draft.duration));
  const scheduled = new Date(day);
  scheduled.setHours(Math.floor(base / 60), base % 60, 0, 0);
  return scheduled;
}

/** Creates a first-class roadmap with one session per chosen day, or custom steps spread across the full range. */
export function createRoadmap(draft: TaskDraft) {
  if (!draft.dueAt) return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "Choose an end date first." };
  const start = new Date(`${draft.availableFrom}T00:00:00`);
  const endDate = draft.dueAt.slice(0, 10);
  const deadline = new Date(`${endDate}T23:59:59`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(deadline.getTime()) || deadline < start) {
    return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "The end date must be after the start date." };
  }
  if (!draft.roadmapWorkDays.length) {
    return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "Choose at least one study day." };
  }
  if (draft.scheduleStyle === "random" && minutesFromTime(draft.randomEnd) <= minutesFromTime(draft.randomStart)) {
    return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "The random alarm window needs to end after it starts." };
  }

  const days: Date[] = [];
  const cursor = new Date(start);
  const nowDate = new Date();
  for (let scanned = 0; cursor <= deadline && scanned < 740; scanned += 1) {
    const isToday = dateKey(cursor) === dateKey(nowDate);
    const latestFinish = draft.scheduleStyle === "random" ? minutesFromTime(draft.randomEnd) : minutesFromTime(draft.fixedTime) + draft.duration;
    const currentMinute = nowDate.getHours() * 60 + nowDate.getMinutes();
    if (draft.roadmapWorkDays.includes(cursor.getDay()) && (!isToday || latestFinish > currentMinute)) days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (!days.length) return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "No study days exist in that date range." };

  const customSteps = draft.customTasks.split("\n").map((step) => step.trim()).filter(Boolean);
  if (draft.roadmapPlanMode === "custom" && !customSteps.length) {
    return { roadmap: null as Roadmap | null, tasks: [] as Task[], error: "Add at least one custom roadmap step." };
  }

  const roadmapId = crypto.randomUUID();
  const now = new Date().toISOString();
  const sessionCount = draft.roadmapPlanMode === "daily" ? days.length : customSteps.length;
  const sessionsOnDay = new Map<string, number>();
  const tasks = Array.from({ length: sessionCount }, (_, index): Task => {
    const dayIndex = draft.roadmapPlanMode === "daily"
      ? index
      : sessionCount === 1 ? 0 : Math.round(index * (days.length - 1) / (sessionCount - 1));
    const day = days[dayIndex];
    const key = dateKey(day);
    const ordinal = sessionsOnDay.get(key) ?? 0;
    sessionsOnDay.set(key, ordinal + 1);
    const scheduledAt = toLocalInput(roadmapTime(draft, roadmapId, day, ordinal));
    return {
      id: crypto.randomUUID(),
      title: draft.roadmapPlanMode === "custom" ? customSteps[index] : draft.title.trim(),
      notes: draft.notes.trim(),
      status: "scheduled",
      priority: draft.priority,
      duration: draft.duration,
      dueAt: `${endDate}T23:59`,
      scheduledAt,
      reminderMinutes: draft.alarmMode === "none" ? null : 0,
      remindedFor: null,
      alarmMode: draft.alarmMode,
      alarmModeLocked: true,
      snoozedUntil: null,
      backlogAlarmTime: draft.backlogAlarmTime || "09:00",
      backlogAlarmStartsAt: null,
      goalId: roadmapId,
      sessionIndex: index + 1,
      sessionCount,
      totalGoalMinutes: sessionCount * draft.duration,
      plannedFor: scheduledAt,
      missedAt: null,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
    };
  });

  const roadmap: Roadmap = {
    id: roadmapId,
    title: draft.title.trim(),
    notes: draft.notes.trim(),
    priority: draft.priority,
    startDate: draft.availableFrom,
    endDate,
    sessionDuration: draft.duration,
    workDays: [...draft.roadmapWorkDays],
    planMode: draft.roadmapPlanMode,
    scheduleStyle: draft.scheduleStyle,
    fixedTime: draft.fixedTime,
    randomStart: draft.randomStart,
    randomEnd: draft.randomEnd,
    alarmMode: draft.alarmMode,
    reminderMinutes: draft.alarmMode === "none" ? null : 0,
    createdAt: now,
    updatedAt: now,
  };
  return { roadmap, tasks, error: null as string | null };
}

export function rollOverMissedTasks(tasks: Task[], now = new Date()) {
  let moved = 0;
  const next = tasks.map((task) => {
    if (task.status !== "scheduled" || !task.scheduledAt) return task;
    const sessionEnd = new Date(task.scheduledAt).getTime() + task.duration * 60_000;
    if (sessionEnd > now.getTime()) return task;
    const dayEnd = new Date(task.scheduledAt);
    dayEnd.setHours(23, 59, 59, 999);
    if (now.getTime() <= dayEnd.getTime()) {
      if (task.missedAt) return task;
      moved += 1;
      return {
        ...task,
        plannedFor: task.plannedFor ?? task.scheduledAt,
        missedAt: now.toISOString(),
        updatedAt: now.toISOString(),
      };
    }
    moved += 1;
    return {
      ...task,
      status: "backlog" as const,
      priority: task.alarmMode === "strict" ? "high" as const : task.priority,
      plannedFor: task.plannedFor ?? task.scheduledAt,
      scheduledAt: null,
      backlogAlarmTime: task.backlogAlarmTime || "09:00",
      backlogAlarmStartsAt: task.alarmMode === "none" ? null : nextDayRetryStart(task),
      snoozedUntil: null,
      remindedFor: null,
      missedAt: task.missedAt ?? now.toISOString(),
      updatedAt: now.toISOString(),
    };
  });
  return { tasks: next, moved };
}

export function nextDayRetryStart(task: Pick<Task, "scheduledAt" | "plannedFor" | "backlogAlarmTime">) {
  const source = task.scheduledAt ?? task.plannedFor;
  if (!source) return null;
  const retry = new Date(source);
  retry.setDate(retry.getDate() + 1);
  const [hours, minutes] = (task.backlogAlarmTime || "09:00").split(":").map(Number);
  retry.setHours(Number.isFinite(hours) ? hours : 9, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return retry.toISOString();
}

const HOURLY_REMINDER_MS = 60 * 60 * 1000;

export function taskReminderStart(task: Task) {
  if (task.status === "completed" || task.alarmMode === "none") return null;
  if (task.snoozedUntil) return new Date(task.snoozedUntil).getTime();
  if (task.status === "backlog") return task.backlogAlarmStartsAt ? new Date(task.backlogAlarmStartsAt).getTime() : null;
  if (!task.scheduledAt) return null;
  return new Date(task.scheduledAt).getTime() + task.duration * 60_000;
}

export function currentReminderOccurrence(task: Task, now = Date.now()) {
  const startsAt = taskReminderStart(task);
  if (startsAt === null || Number.isNaN(startsAt) || startsAt > now) return null;
  const occurrence = startsAt + Math.floor((now - startsAt) / HOURLY_REMINDER_MS) * HOURLY_REMINDER_MS;
  return { triggerAt: occurrence, key: `hourly:${occurrence}` };
}

export function nextReminderOccurrence(task: Task, now = Date.now()) {
  const startsAt = taskReminderStart(task);
  if (startsAt === null || Number.isNaN(startsAt)) return null;
  if (startsAt > now) return startsAt;
  return startsAt + (Math.floor((now - startsAt) / HOURLY_REMINDER_MS) + 1) * HOURLY_REMINDER_MS;
}

export interface RoadmapStats {
  total: number;
  completed: number;
  backlog: number;
  upcoming: number;
  totalMinutes: number;
  completedMinutes: number;
  progress: number;
  streak: number;
  nextTask: Task | null;
}

export function getRoadmapStats(tasks: Task[], roadmapId: string, now = new Date()): RoadmapStats {
  const sessions = tasks.filter((task) => task.goalId === roadmapId);
  const completed = sessions.filter((task) => task.status === "completed");
  const totalMinutes = sessions.reduce((sum, task) => sum + task.duration, 0);
  const completedMinutes = completed.reduce((sum, task) => sum + task.duration, 0);
  const groups = new Map<string, Task[]>();
  for (const task of sessions) {
    const value = task.plannedFor ?? task.scheduledAt;
    if (!value || new Date(value) > now) continue;
    const key = dateKey(value);
    groups.set(key, [...(groups.get(key) ?? []), task]);
  }
  const expectedDays = [...groups.entries()].sort(([a], [b]) => b.localeCompare(a));
  const todayKey = dateKey(now);
  if (expectedDays[0]?.[0] === todayKey) {
    const todaySessions = expectedDays[0][1];
    const stillInProgress = todaySessions.some((task) => task.status !== "completed" && task.scheduledAt && new Date(task.scheduledAt).getTime() + task.duration * 60_000 > now.getTime());
    if (stillInProgress && !todaySessions.some((task) => task.status === "backlog")) expectedDays.shift();
  }
  let streak = 0;
  for (const [, daySessions] of expectedDays) {
    if (!daySessions.every((task) => task.status === "completed")) break;
    streak += 1;
  }
  const nextTask = [...sessions]
    .filter((task) => task.status !== "completed")
    .sort((a, b) => {
      if (a.status === "backlog" && b.status !== "backlog") return -1;
      if (b.status === "backlog" && a.status !== "backlog") return 1;
      return (a.scheduledAt ?? a.plannedFor ?? a.createdAt).localeCompare(b.scheduledAt ?? b.plannedFor ?? b.createdAt);
    })[0] ?? null;
  return {
    total: sessions.length,
    completed: completed.length,
    backlog: sessions.filter((task) => task.status === "backlog").length,
    upcoming: sessions.filter((task) => task.status === "scheduled").length,
    totalMinutes,
    completedMinutes,
    progress: totalMinutes ? Math.round(completedMinutes / totalMinutes * 100) : 0,
    streak,
    nextTask,
  };
}

function roundUpToQuarterHour(value: Date) {
  const rounded = new Date(value);
  const minutes = Math.ceil((rounded.getMinutes() + rounded.getSeconds() / 60) / 15) * 15;
  rounded.setMinutes(minutes, 0, 0);
  return rounded;
}

export function nextAvailableSlotForDate(date: Date, tasks: Task[], settings: PlannerSettings, duration = settings.defaultDuration, now = new Date()) {
  const workStart = atTime(date, settings.dayStart);
  const workEnd = atTime(date, settings.dayEnd);
  if (workEnd <= workStart) return null;

  const earliest = dateKey(date) === dateKey(now) ? roundUpToQuarterHour(now) : workStart;
  let cursor = new Date(Math.max(workStart.getTime(), earliest.getTime()));
  const durationMs = duration * 60_000;
  const busy = tasks
    .filter((task) => task.status === "scheduled" && task.scheduledAt && dateKey(task.scheduledAt) === dateKey(date))
    .map((task) => {
      const start = new Date(task.scheduledAt!);
      return { start, end: new Date(start.getTime() + task.duration * 60_000) };
    })
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  for (const interval of busy) {
    if (interval.end <= cursor) continue;
    if (cursor.getTime() + durationMs <= interval.start.getTime() && cursor.getTime() + durationMs <= workEnd.getTime()) return cursor;
    cursor = roundUpToQuarterHour(new Date(Math.max(cursor.getTime(), interval.end.getTime())));
  }

  return cursor.getTime() + durationMs <= workEnd.getTime() ? cursor : null;
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
    const occupied = [
      ...tasks.filter((item) => item.status === "scheduled"),
      ...updates.values(),
    ];
    const options = candidates.flatMap((day) => {
      const slot = nextAvailableSlotForDate(day.date, occupied, settings, task.duration, now);
      return slot ? [{ day, slot }] : [];
    });
    const viable = options.filter(({ slot }) => slot.getTime() + task.duration * 60_000 <= dueTime);
    const pool = viable.length ? viable : options;
    const chosen = [...pool].sort((a, b) => a.day.load - b.day.load || a.slot.getTime() - b.slot.getTime())[0];
    if (!chosen) {
      overflow += 1;
      continue;
    }

    chosen.day.load += task.duration;
    updates.set(task.id, {
      ...task,
      status: "scheduled",
      scheduledAt: toLocalInput(chosen.slot),
      plannedFor: task.plannedFor ?? toLocalInput(chosen.slot),
      backlogAlarmStartsAt: null,
      snoozedUntil: null,
      remindedFor: null,
      missedAt: null,
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
  const slot = nextAvailableSlotForDate(new Date(), tasks, settings, task.duration);
  return slot ? toLocalInput(slot) : null;
}

export function isSameDay(value: string | null, date = new Date()) {
  return Boolean(value && dateKey(value) === dateKey(date));
}

export function dueState(task: Task): "overdue" | "soon" | "later" | "none" {
  if (task.status === "completed") return "none";
  const target = task.status === "scheduled" && task.scheduledAt
    ? new Date(task.scheduledAt).getTime() + task.duration * 60_000
    : task.dueAt ? new Date(task.dueAt).getTime() : null;
  if (target === null) return "none";
  const diff = target - Date.now();
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
