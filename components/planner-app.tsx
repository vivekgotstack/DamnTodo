"use client";

import Image from "next/image";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import {
  AlarmClock,
  ArrowLeft,
  ArrowUpRight,
  AppWindow as Install,
  Archive,
  Bell,
  BellRing,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  CloudOff,
  Download,
  FileUp,
  Flame,
  Home,
  Inbox,
  ListChecks,
  LockKeyhole,
  Map as MapIcon,
  NotebookPen,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Shuffle,
  Target,
  TrendingUp,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import logoMark from "@/public/logo-mark.png";
import { TaskEditor } from "@/components/task-editor";
import { BacklogAlarmDialog, InstallDialog, MotivationMoment, StrictAlarmDialog } from "@/components/system-dialogs";
import { RainbowButton } from "@/components/ui/rainbow-button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DEFAULT_STATE,
  autoSchedule,
  createRoadmap,
  createTask,
  currentReminderOccurrence,
  dueState,
  emptyDraft,
  formatDateTime,
  formatDuration,
  getRoadmapStats,
  isSameDay,
  localDateTime,
  nextAvailableSlotForDate,
  nextReminderOccurrence,
  rollOverMissedTasks,
  scheduleToday,
  type PlannerSettings,
  type PlannerState,
  type Plan,
  type Roadmap,
  type Task,
  type TaskDraft,
} from "@/lib/planner";
import { loadState, saveState, upgradePlannerState } from "@/lib/storage";
import { cancelNativeTaskAlarm, isNativeApp, listenForNativeAlarm, prepareNativeAlarms, scheduleNativeTaskAlarm } from "@/lib/native-alarms";

type View = "dashboard" | "today" | "schedule" | "backlog" | "plans" | "completed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const NAVIGATION: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "schedule", label: "Schedule", icon: Archive },
  { id: "backlog", label: "Backlog", icon: Inbox },
  { id: "plans", label: "Plans", icon: NotebookPen },
  { id: "completed", label: "Completed", icon: CheckCircle2 },
];

const WEEKDAYS = [
  { value: 1, label: "M" },
  { value: 2, label: "T" },
  { value: 3, label: "W" },
  { value: 4, label: "T" },
  { value: 5, label: "F" },
  { value: 6, label: "S" },
  { value: 0, label: "S" },
];

const formatDayHeading = (date: Date) =>
  new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric" }).format(date);

const dateKey = (value: Date | string) => {
  const date = typeof value === "string" ? new Date(value) : value;
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const nextDayAt = (time = "09:00") => {
  const next = new Date();
  next.setDate(next.getDate() + 1);
  const [hours, minutes] = time.split(":").map(Number);
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
};

const taskSort = (a: Task, b: Task) =>
  (a.scheduledAt ?? a.dueAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.dueAt ?? b.createdAt);

function countForView(view: View, tasks: Task[], plans: Plan[]) {
  if (view === "today") return tasks.filter((task) => task.status === "scheduled" && isSameDay(task.scheduledAt)).length;
  if (view === "backlog") return tasks.filter((task) => task.status === "backlog").length;
  if (view === "completed") return tasks.filter((task) => task.status === "completed").length;
  if (view === "plans") return plans.length;
  return 0;
}

const VIEW_KEY = "damntodo:active-view";
const SCROLL_KEY = "damntodo:scroll:";
const isView = (value: string | null): value is View =>
  value === "dashboard" || value === "today" || value === "schedule" || value === "backlog" || value === "plans" || value === "completed";

export default function PlannerApp() {
  const [state, setState] = useState<PlannerState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [showOpening, setShowOpening] = useState(true);
  const [view, setView] = useState<View>("dashboard");
  const [editor, setEditor] = useState<{ task: Task | null; scheduledAt?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installInfoOpen, setInstallInfoOpen] = useState(false);
  const [installForAlarm, setInstallForAlarm] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [runningAsApp, setRunningAsApp] = useState(false);
  const native = useSyncExternalStore(() => () => undefined, isNativeApp, () => false);
  const alarmsAvailable = native || runningAsApp;
  const [activeAlarmId, setActiveAlarmId] = useState<string | null>(null);
  const [alarmMomentIds, setAlarmMomentIds] = useState<string[]>([]);
  const [backlogAlarmTargetId, setBacklogAlarmTargetId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: "task"; task: Task } | { kind: "roadmap"; roadmap: Roadmap } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const nativeAlarmBatch = useRef("");

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  const enqueueAlarmMoment = useCallback((taskId: string) => {
    setAlarmMomentIds((current) => current.includes(taskId) ? current : [...current, taskId]);
  }, []);

  const finishOpening = useCallback(() => setShowOpening(false), []);

  useEffect(() => {
    const installedApp = window.matchMedia("(display-mode: standalone)").matches || isNativeApp();
    if (!installedApp) return;
    const replayOnResume = () => {
      if (document.visibilityState === "visible") setShowOpening(true);
    };
    document.addEventListener("visibilitychange", replayOnResume);
    return () => document.removeEventListener("visibilitychange", replayOnResume);
  }, []);

  useEffect(() => {
    if (!runningAsApp || native) return;
    const blockStandaloneRefresh = (event: KeyboardEvent) => {
      if (event.key === "F5" || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "r")) event.preventDefault();
    };
    window.addEventListener("keydown", blockStandaloneRefresh);
    return () => window.removeEventListener("keydown", blockStandaloneRefresh);
  }, [native, runningAsApp]);

  useEffect(() => {
    let active = true;
    loadState().then((saved) => {
      if (!active) return;
      const hashView = window.location.hash.replace("#", "");
      const restoredView = isView(hashView) ? hashView : localStorage.getItem(VIEW_KEY);
      if (isView(restoredView)) setView(restoredView);
      const rolled = rollOverMissedTasks(saved.tasks);
      setState({ ...saved, tasks: rolled.tasks });
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const restoreFromHistory = () => {
      const hashView = window.location.hash.replace("#", "");
      const restoredView = isView(hashView) ? hashView : "dashboard";
      setView(restoredView);
      localStorage.setItem(VIEW_KEY, restoredView);
    };
    window.addEventListener("popstate", restoreFromHistory);
    return () => window.removeEventListener("popstate", restoreFromHistory);
  }, []);

  useEffect(() => {
    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";
    return () => { window.history.scrollRestoration = previous; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    let scrollFrame = 0;
    const persist = () => localStorage.setItem(`${SCROLL_KEY}${view}`, String(window.scrollY));
    const restoreFrame = window.requestAnimationFrame(() => {
      const saved = Number(localStorage.getItem(`${SCROLL_KEY}${view}`) ?? "0");
      window.scrollTo({ top: Number.isFinite(saved) ? saved : 0, left: 0, behavior: "auto" });
    });
    const rememberScroll = () => {
      if (scrollFrame) return;
      scrollFrame = window.requestAnimationFrame(() => {
        scrollFrame = 0;
        persist();
      });
    };
    window.addEventListener("scroll", rememberScroll, { passive: true });
    window.addEventListener("pagehide", persist);
    return () => {
      window.cancelAnimationFrame(restoreFrame);
      if (scrollFrame) window.cancelAnimationFrame(scrollFrame);
      persist();
      window.removeEventListener("scroll", rememberScroll);
      window.removeEventListener("pagehide", persist);
    };
  }, [ready, view]);

  const openView = useCallback((nextView: View, replace = false) => {
    if (nextView === view && !replace) return;
    localStorage.setItem(`${SCROLL_KEY}${view}`, String(window.scrollY));
    setView(nextView);
    localStorage.setItem(VIEW_KEY, nextView);
    const nextUrl = `${window.location.pathname}${window.location.search}#${nextView}`;
    if (replace) window.history.replaceState({ damnTodoView: nextView }, "", nextUrl);
    else window.history.pushState({ damnTodoView: nextView }, "", nextUrl);
  }, [view]);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      saveState(state).catch(() => announce("Could not save changes. Keep this tab open and try again."));
    }, 180);
    return () => clearTimeout(timer);
  }, [announce, ready, state]);

  useEffect(() => {
    if (!ready) return;
    const moveMissedWork = () => {
      setState((current) => {
        const rolled = rollOverMissedTasks(current.tasks);
        return rolled.moved ? { ...current, tasks: rolled.tasks } : current;
      });
    };
    const timer = setInterval(moveMissedWork, 60_000);
    document.addEventListener("visibilitychange", moveMissedWork);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", moveMissedWork);
    };
  }, [ready]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (process.env.NODE_ENV === "production") navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    else navigator.serviceWorker.getRegistrations().then((registrations) => Promise.all(registrations.map((registration) => registration.unregister()))).catch(() => undefined);
    const onInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setRunningAsApp(window.matchMedia("(display-mode: standalone)").matches || isNativeApp());
      setInstallPrompt(null);
      announce("DamnTodo is installed. Open it from your home screen to enable alarms.");
    };
    const syncPlatformState = () => {
      const standalone = window.matchMedia("(display-mode: standalone)").matches;
      setInstalled(standalone);
      setRunningAsApp(standalone);
      setNotificationPermission("Notification" in window ? Notification.permission : "denied");
    };
    const frame = window.requestAnimationFrame(syncPlatformState);
    window.addEventListener("beforeinstallprompt", onInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.cancelAnimationFrame(frame);
    };
  }, [announce]);

  useEffect(() => {
    let stop: () => void = () => undefined;
    void listenForNativeAlarm(enqueueAlarmMoment).then((dispose) => { stop = dispose; });
    return () => stop();
  }, [enqueueAlarmMoment]);

  useEffect(() => {
    if (!ready || !native) return;
    const upcoming = state.tasks
      .filter((task) => task.status !== "completed" && task.alarmMode !== "none" && nextReminderOccurrence(task) !== null)
      .sort(taskSort)
      .slice(0, 24);
    const batchKey = upcoming.map((task) => `${task.id}:${task.scheduledAt}:${task.backlogAlarmStartsAt}:${task.snoozedUntil}:${task.alarmMode}`).join("|");
    if (!batchKey || batchKey === nativeAlarmBatch.current) return;
    nativeAlarmBatch.current = batchKey;
    void prepareNativeAlarms(false).then((permission) => {
      if (permission.granted) return Promise.all(upcoming.map(scheduleNativeTaskAlarm));
    }).catch(() => undefined);
  }, [native, ready, state.tasks]);

  const playReminderTone = useCallback(() => {
    if (!state.settings.sound) return;
    const AudioContextClass = window.AudioContext;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(660, context.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(880, context.currentTime + 0.18);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.45);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.46);
  }, [state.settings.sound]);

  useEffect(() => {
    if (!ready || !alarmsAvailable) return;
    const checkReminders = async () => {
      const now = Date.now();
      const due = state.tasks.flatMap((task) => {
        const occurrence = currentReminderOccurrence(task, now);
        return occurrence && task.remindedFor !== occurrence.key ? [{ task, occurrence }] : [];
      });
      if (!due.length) return;
      for (const { task } of due) {
        const body = task.status === "backlog"
          ? "High-priority backlog retry · reminders repeat hourly"
          : `${formatDuration(task.duration)} session ended · reminders repeat hourly until resolved`;
        if ("Notification" in window && Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          if (registration) await registration.showNotification(task.title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: task.id });
          else new Notification(task.title, { body, icon: "/icon-192.png", tag: task.id });
        }
        if (task.alarmMode === "strict") {
          playReminderTone();
          enqueueAlarmMoment(task.id);
        }
        announce(`${task.alarmMode === "strict" ? "Red alarm" : "Hourly reminder"}: ${task.title}`);
      }
      const dueKeys = new Map(due.map(({ task, occurrence }) => [task.id, occurrence.key]));
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => dueKeys.has(task.id) ? { ...task, remindedFor: dueKeys.get(task.id)! } : task),
      }));
    };
    void checkReminders();
    const timer = setInterval(checkReminders, 30_000);
    document.addEventListener("visibilitychange", checkReminders);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkReminders);
    };
  }, [alarmsAvailable, announce, enqueueAlarmMoment, playReminderTone, ready, state.tasks]);

  const backlog = useMemo(() => state.tasks.filter((task) => task.status === "backlog").sort(taskSort), [state.tasks]);
  const completed = useMemo(() => state.tasks.filter((task) => task.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [state.tasks]);
  const todayTasks = useMemo(() => state.tasks.filter((task) => task.status === "scheduled" && isSameDay(task.scheduledAt)).sort(taskSort), [state.tasks]);
  const overdue = useMemo(() => state.tasks.filter((task) => dueState(task) === "overdue"), [state.tasks]);
  const todayMinutes = todayTasks.reduce((total, task) => total + task.duration, 0);
  const focusTask = todayTasks[0] ?? overdue[0] ?? null;
  const activeTasks = state.tasks.filter((task) => task.status !== "completed");
  const scheduledTasks = activeTasks.filter((task) => task.status === "scheduled");
  const completionRate = state.tasks.length ? Math.round((completed.length / state.tasks.length) * 100) : 0;
  const activeAlarmMoment = activeAlarmId ? null : state.tasks.find((task) => task.id === alarmMomentIds[0]) ?? null;
  const backlogAlarmTarget = state.tasks.find((task) => task.id === backlogAlarmTargetId) ?? null;

  const finishAlarmMoment = useCallback(() => {
    const taskId = alarmMomentIds[0];
    if (!taskId) return;
    const task = state.tasks.find((item) => item.id === taskId);
    setAlarmMomentIds((current) => current.slice(1));
    if (task?.alarmMode === "strict") setActiveAlarmId(task.id);
  }, [alarmMomentIds, state.tasks]);

  const stopAlarmMoment = useCallback(() => {
    const taskId = alarmMomentIds[0];
    if (!taskId) return;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) { setAlarmMomentIds((current) => current.slice(1)); return; }
    const occurrence = currentReminderOccurrence(task);
    const updated: Task = { ...task, remindedFor: occurrence?.key ?? task.remindedFor, updatedAt: new Date().toISOString() };
    setAlarmMomentIds((current) => current.slice(1));
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === taskId ? updated : item) }));
    void cancelNativeTaskAlarm(taskId).then(() => native ? scheduleNativeTaskAlarm(updated) : undefined);
    setActiveAlarmId((current) => current === taskId ? null : current);
    announce(`Stopped for now: ${task.title}. It returns in one hour.`);
  }, [alarmMomentIds, announce, native, state.tasks]);

  const snoozeAlarmMoment = useCallback(() => {
    const taskId = alarmMomentIds[0];
    if (!taskId) return;
    const task = state.tasks.find((item) => item.id === taskId);
    if (!task) { setAlarmMomentIds((current) => current.slice(1)); return; }
    const updated: Task = { ...task, snoozedUntil: new Date(Date.now() + 60 * 60_000).toISOString(), remindedFor: null, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === taskId ? updated : item) }));
    setAlarmMomentIds((current) => current.slice(1));
    setActiveAlarmId((current) => current === taskId ? null : current);
    if (native) void scheduleNativeTaskAlarm(updated);
    announce("Alarm snoozed for one hour.");
  }, [alarmMomentIds, announce, native, state.tasks]);

  const beginAlarmBacklogMove = useCallback((taskId: string) => {
    setAlarmMomentIds((current) => current.filter((id) => id !== taskId));
    setActiveAlarmId((current) => current === taskId ? null : current);
    setBacklogAlarmTargetId(taskId);
  }, []);

  const moveTaskToBacklog = useCallback((task: Task, time = task.backlogAlarmTime ?? "09:00") => {
    const keepsAlarm = task.alarmMode !== "none";
    const updated: Task = {
      ...task,
      status: "backlog",
      priority: task.alarmMode === "strict" ? "high" : task.priority,
      plannedFor: task.plannedFor ?? task.scheduledAt,
      scheduledAt: null,
      backlogAlarmTime: time || "09:00",
      backlogAlarmStartsAt: keepsAlarm ? nextDayAt(time || "09:00") : null,
      snoozedUntil: null,
      remindedFor: null,
      missedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? updated : item) }));
    void cancelNativeTaskAlarm(task.id).then(() => native && keepsAlarm ? scheduleNativeTaskAlarm(updated) : undefined);
    setAlarmMomentIds((current) => current.filter((id) => id !== task.id));
    setActiveAlarmId((current) => current === task.id ? null : current);
    setBacklogAlarmTargetId(null);
    announce(keepsAlarm ? `Moved to high-priority backlog. Hourly follow-ups start tomorrow at ${time || "09:00"}.` : "Moved to backlog.");
  }, [announce, native]);

  const saveTask = async (draft: TaskDraft) => {
    const safeDraft: TaskDraft = alarmsAvailable ? draft : { ...draft, alarmMode: "none", reminderMinutes: null };
    if (safeDraft.kind === "task" && safeDraft.scheduledAt) {
      const startsAt = new Date(safeDraft.scheduledAt).getTime();
      const endsAt = startsAt + safeDraft.duration * 60_000;
      const conflict = state.tasks.find((task) => {
        if (task.id === editor?.task?.id || task.status !== "scheduled" || !task.scheduledAt) return false;
        const taskStart = new Date(task.scheduledAt).getTime();
        const taskEnd = taskStart + task.duration * 60_000;
        return startsAt < taskEnd && endsAt > taskStart;
      });
      if (conflict) {
        announce(`That time overlaps “${conflict.title}”. Choose another start time.`);
        return;
      }
    }
    if (editor?.task) {
      const previous = editor.task;
      const status = safeDraft.scheduledAt ? "scheduled" : previous.status === "completed" ? "completed" : "backlog";
      const alarmMode = previous.alarmModeLocked
        ? (previous.alarmMode ?? "none")
        : safeDraft.scheduledAt ? safeDraft.alarmMode : "none";
      const backlogAlarmTime = safeDraft.backlogAlarmTime || previous.backlogAlarmTime || "09:00";
      const updated: Task = {
        ...previous,
        title: safeDraft.title.trim(),
        notes: safeDraft.notes.trim(),
        priority: safeDraft.priority,
        duration: safeDraft.duration,
        dueAt: safeDraft.dueAt || null,
        scheduledAt: safeDraft.scheduledAt || null,
        plannedFor: previous.plannedFor ?? (safeDraft.scheduledAt || null),
        missedAt: safeDraft.scheduledAt ? null : previous.missedAt,
        reminderMinutes: alarmMode === "none" ? null : 0,
        alarmMode,
        alarmModeLocked: previous.alarmModeLocked || Boolean(safeDraft.scheduledAt),
        backlogAlarmTime,
        backlogAlarmStartsAt: status === "backlog" && alarmMode !== "none"
          ? (previous.backlogAlarmTime === backlogAlarmTime ? previous.backlogAlarmStartsAt : null) ?? nextDayAt(backlogAlarmTime)
          : null,
        snoozedUntil: null,
        remindedFor: null,
        status,
        updatedAt: new Date().toISOString(),
      };
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === previous.id ? updated : task),
      }));
      await scheduleAlarm(updated);
      announce("Task updated.");
    } else if (safeDraft.kind === "goal") {
      const result = createRoadmap(safeDraft);
      if (result.error) { announce(result.error); return; }
      setState((current) => ({ ...current, roadmaps: [result.roadmap!, ...current.roadmaps], tasks: [...result.tasks, ...current.tasks] }));
      if (result.tasks[0]?.alarmMode !== "none") await scheduleAlarm(result.tasks[0]);
      openView("schedule");
      announce(`Built ${result.tasks.length} sessions inside one ${safeDraft.title.trim()} roadmap.`);
    } else {
      const task = createTask({ ...safeDraft, scheduledAt: safeDraft.scheduledAt || editor?.scheduledAt || "" });
      setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      await scheduleAlarm(task);
      announce(task.scheduledAt ? "Task added to your schedule." : "Task captured in your backlog.");
    }
    setEditor(null);
  };

  const scheduleAlarm = async (task: Task) => {
    try {
      if (!alarmsAvailable) return;
      if (task.status === "completed" || task.alarmMode === "none" || nextReminderOccurrence(task) === null) { await cancelNativeTaskAlarm(task.id); return; }
      if (!isNativeApp()) {
        if (!("Notification" in window)) { announce("This installed browser does not support notification permission."); return; }
        const permission = Notification.permission === "default" ? await Notification.requestPermission() : Notification.permission;
        setNotificationPermission(permission);
        announce(permission === "granted" ? "Notification permission granted. Keep the installed app available for web follow-ups." : "Task saved, but notifications are blocked. Enable them in app settings.");
        return;
      }
      const permission = await prepareNativeAlarms(task.alarmMode === "strict");
      if (!permission.granted) { announce("Task saved, but Android notification permission is off."); return; }
      await scheduleNativeTaskAlarm(task);
      announce(task.alarmMode === "strict" && !permission.exact ? "Notification allowed. Enable Alarms & reminders for exact red alarms." : "Android alarm permission granted and the alarm is scheduled.");
    } catch {
      announce("The task was saved, but Android could not schedule its alarm yet.");
    }
  };

  const toggleComplete = (task: Task) => {
    const completing = task.status !== "completed";
    const canReturnToSchedule = Boolean(task.scheduledAt && new Date(task.scheduledAt).getTime() + task.duration * 60_000 > Date.now());
    const restoredStatus = canReturnToSchedule ? "scheduled" : "backlog";
    const updated: Task = {
      ...task,
      status: completing ? "completed" : restoredStatus,
      completedAt: completing ? new Date().toISOString() : null,
      missedAt: completing ? task.missedAt : canReturnToSchedule ? null : (task.missedAt ?? new Date().toISOString()),
      backlogAlarmStartsAt: completing || canReturnToSchedule || task.alarmMode === "none" ? null : nextDayAt(task.backlogAlarmTime ?? "09:00"),
      snoozedUntil: null,
      remindedFor: null,
      updatedAt: new Date().toISOString(),
    };
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? updated : item),
    }));
    if (completing) void cancelNativeTaskAlarm(task.id);
    else void scheduleAlarm(updated);
    announce(completing ? "Nicely done." : "Task restored.");
  };

  const removeTask = (task: Task) => {
    if (task.status === "scheduled") { announce("Scheduled sessions are protected. Complete them or move them to backlog instead."); return; }
    setDeleteTarget({ kind: "task", task });
  };

  const removeRoadmap = (roadmap: Roadmap) => {
    if (state.tasks.some((task) => task.goalId === roadmap.id && task.status === "scheduled")) { announce("This roadmap still has scheduled sessions, so it cannot be deleted."); return; }
    setDeleteTarget({ kind: "roadmap", roadmap });
  };

  const deleteCompleted = (selectedIds: string[]) => {
    const completedIds = new Set(selectedIds);
    const selected = completed.filter((task) => completedIds.has(task.id));
    if (!selected.length || !window.confirm(`Delete ${selected.length} selected completed task${selected.length === 1 ? "" : "s"}? This cannot be undone.`)) return;
    setState((current) => {
      const tasks = current.tasks.filter((task) => task.status !== "completed" || !completedIds.has(task.id));
      return { ...current, tasks };
    });
    announce(`Deleted ${selected.length} selected completed task${selected.length === 1 ? "" : "s"}.`);
  };

  const confirmDelete = () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "task") {
      const { task } = deleteTarget;
      setState((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
      void cancelNativeTaskAlarm(task.id);
      announce("Session deleted.");
    } else {
      const { roadmap } = deleteTarget;
      const roadmapTasks = state.tasks.filter((task) => task.goalId === roadmap.id);
      setState((current) => ({
        ...current,
        roadmaps: current.roadmaps.filter((item) => item.id !== roadmap.id),
        tasks: current.tasks.filter((task) => task.goalId !== roadmap.id),
      }));
      void Promise.all(roadmapTasks.map((task) => cancelNativeTaskAlarm(task.id)));
      announce(`Deleted ${roadmap.title} and all ${roadmapTasks.length} sessions.`);
    }
    setDeleteTarget(null);
  };

  const planBacklog = () => {
    const result = autoSchedule(state.tasks, state.settings);
    if (!result.scheduled) {
      announce(backlog.length ? "Your available schedule is full. Adjust your hours in Settings." : "Your backlog is already clear.");
      return;
    }
    setState((current) => ({ ...current, tasks: result.tasks }));
    const rescued = result.tasks.filter((task) => state.tasks.find((previous) => previous.id === task.id)?.status === "backlog" && task.status === "scheduled").slice(0, 24);
    void Promise.all(rescued.map(scheduleAlarm));
    openView("schedule");
    announce(result.overflow ? `Scheduled ${result.scheduled} tasks. ${result.overflow} could not fit inside your working hours.` : `Scheduled ${result.scheduled} task${result.scheduled === 1 ? "" : "s"} into available time.`);
  };

  const moveToToday = (task: Task) => {
    const slot = scheduleToday(task, state.tasks, state.settings);
    if (!slot) {
      announce("Today is full. Auto-plan it into the next open day instead.");
      return;
    }
    const updated: Task = { ...task, status: "scheduled", scheduledAt: slot, plannedFor: task.plannedFor ?? slot, backlogAlarmStartsAt: null, snoozedUntil: null, remindedFor: null, missedAt: null, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === task.id ? updated : item) }));
    void scheduleAlarm(updated);
    announce(`Scheduled for ${formatDateTime(slot)}.`);
  };

  const returnToBacklog = (task: Task) => {
    if (task.alarmMode !== "none") { setBacklogAlarmTargetId(task.id); return; }
    moveTaskToBacklog(task);
  };

  const quickAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    const task = createTask({ ...emptyDraft(state.settings.defaultDuration), title: quickTitle });
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setQuickTitle("");
    announce("Captured. You can add details anytime.");
  };

  const createPlan = (title: string) => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const now = new Date().toISOString();
    const plan: Plan = { id: crypto.randomUUID(), title: trimmed, items: [], createdAt: now, updatedAt: now };
    setState((current) => ({ ...current, plans: [plan, ...current.plans] }));
    announce("Plan created.");
  };

  const updatePlan = (updated: Plan) => {
    setState((current) => ({ ...current, plans: current.plans.map((plan) => plan.id === updated.id ? { ...updated, updatedAt: new Date().toISOString() } : plan) }));
  };

  const removePlan = (plan: Plan) => {
    if (!window.confirm(`Delete “${plan.title}”?`)) return;
    setState((current) => ({ ...current, plans: current.plans.filter((item) => item.id !== plan.id) }));
    announce("Plan deleted.");
  };

  const enableNotifications = async () => {
    if (!alarmsAvailable) {
      setInstallForAlarm(true);
      setInstallInfoOpen(true);
      return;
    }
    if (isNativeApp()) {
      const result = await prepareNativeAlarms(true);
      announce(result.granted ? "Android alarms are enabled." : "Allow notifications in Android settings to use alarms.");
      return;
    }
    if (!("Notification" in window)) {
      announce("This browser does not support notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    announce(permission === "granted" ? "Reminders are enabled." : "Notifications remain off. You can change this in browser settings.");
  };

  const installApp = async () => {
    if (installed) {
      announce("DamnTodo is already installed.");
      return;
    }
    if (!installPrompt) {
      announce("Use your browser menu and choose “Install app” or “Add to Home Screen”.");
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "dismissed") announce("Install cancelled. Everything still works in this tab.");
    setInstallPrompt(null);
    setInstallInfoOpen(false);
    setInstallForAlarm(false);
  };

  const completeStrictAlarm = (note: string) => {
    if (!activeAlarmId) return;
    const task = state.tasks.find((item) => item.id === activeAlarmId);
    if (!task) return;
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? {
        ...item,
        notes: `${item.notes}${item.notes ? "\n\n" : ""}Completion check-in: ${note}`,
        status: "completed",
        completedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } : item),
    }));
    void cancelNativeTaskAlarm(task.id);
    setActiveAlarmId(null);
    announce("Checked in and completed. That one counts.");
  };

  const snoozeStrictAlarm = () => {
    if (!activeAlarmId) return;
    const snoozedUntil = new Date(Date.now() + 60 * 60_000).toISOString();
    const task = state.tasks.find((item) => item.id === activeAlarmId);
    if (!task) return;
    const updated = { ...task, snoozedUntil, remindedFor: null, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === activeAlarmId ? updated : item) }));
    void scheduleAlarm(updated);
    setActiveAlarmId(null);
    announce("Red alarm snoozed for one hour.");
  };

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `damntodo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    announce("Backup downloaded.");
  };

  const importBackup = async (file: File) => {
    try {
      const restored = upgradePlannerState(JSON.parse(await file.text()));
      if (!restored) throw new Error("Invalid backup");
      setState(restored);
      announce(`Restored ${restored.tasks.length} tasks.`);
    } catch {
      announce("That file is not a valid DamnTodo backup.");
    }
  };

  const clearAll = () => {
    if (!window.confirm("Delete every task and reset your planner? Download a backup first if you may need it.")) return;
    void Promise.all(state.tasks.map((task) => cancelNativeTaskAlarm(task.id)));
    setState({ ...DEFAULT_STATE, settings: state.settings });
    setSettingsOpen(false);
    announce("Your planner is clear.");
  };

  const currentTitle = view === "dashboard" ? "A calm place to get things done." : view === "today" ? "Your day, clearly." : view === "schedule" ? "Your schedule." : view === "backlog" ? "Everything, captured." : view === "plans" ? "Plans and checklists." : "Progress worth seeing.";
  const currentKicker = view === "dashboard" ? `${formatDayHeading(new Date())} · private and offline` : view === "today" ? "Today, without the noise" : view === "schedule" ? "Upcoming tasks and time blocks" : view === "backlog" ? `${backlog.length} task${backlog.length === 1 ? "" : "s"} waiting for a place` : view === "plans" ? `${state.plans.length} no-alarm plan${state.plans.length === 1 ? "" : "s"}` : `${completed.length} completed task${completed.length === 1 ? "" : "s"}`;

  return (
    <MotionConfig reducedMotion="user">
    <main className="app-frame">
      <div className="sky-image" aria-hidden="true" />
      <div className="sky-shade" />
      <section className={`workspace ${ready ? "is-ready" : ""}`}>
        <aside className="sidebar">
          <button className="brand" onClick={() => openView("dashboard")} aria-label="Open dashboard">
            <span className="brand-orb"><Image src={logoMark} alt="" width={26} height={26} /></span>
            <span className="brand-name">DamnTodo</span>
          </button>
          <nav className="main-nav" aria-label="Planner views">
            {NAVIGATION.map(({ id, label, icon: Icon }) => {
              const count = countForView(id, state.tasks, state.plans);
              return (
                <motion.button key={id} whileTap={{ scale: 0.96 }} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => openView(id)} aria-current={view === id ? "page" : undefined}>
                  <span><Icon size={18} /> <span className="nav-label">{label}</span></span>
                  {count > 0 && <b>{count}</b>}
                </motion.button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <RainbowButton onClick={() => setInstallInfoOpen(true)} className="install-side-cta rounded-xl"><Install size={17} /><span>{native ? "Android app" : installed ? "Installed" : "Install app"}</span></RainbowButton>
            <button className="side-action" onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>Settings</span></button>
            <div className="offline-status"><span className="status-dot" /><span>Private &amp; offline</span></div>
          </div>
        </aside>

        <div className="content-shell">
          <header className="topbar">
            <div className="topbar-heading">
              {view !== "dashboard" && <button className="back-button" onClick={() => openView("dashboard")} aria-label="Back to dashboard"><ArrowLeft size={17} /><span>Dashboard</span></button>}
              <div className="title-block"><span className="eyebrow">{currentKicker}</span><h1>{currentTitle}</h1></div>
            </div>
            <div className="top-actions">
              {!installed && !native && <RainbowButton size="icon" onClick={() => setInstallInfoOpen(true)} className="mobile-install-cta rounded-xl" aria-label="Install DamnTodo"><Download size={17} /></RainbowButton>}
              {backlog.length > 0 && <button className="button button-quiet plan-button" onClick={planBacklog}><Sparkles size={16} /> <span>Plan backlog</span></button>}
              <button className="button button-primary" onClick={() => setEditor({ task: null })}><Plus size={18} /> <span>New task</span></button>
            </div>
          </header>

          <AnimatePresence mode="wait" initial={false}>
          {!ready ? <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><LoadingSurface /></motion.div> : (
            <motion.div
              className="view-stage"
              key={view}
              initial={{ opacity: 0, y: 12, filter: "blur(5px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -8, filter: "blur(4px)" }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {view === "dashboard" && (
                <DashboardView
                  todayTasks={todayTasks}
                  overdue={overdue}
                  backlog={backlog}
                  completed={completed}
                  scheduled={scheduledTasks}
                  roadmaps={state.roadmaps}
                  allTasks={state.tasks}
                  focusTask={focusTask}
                  completionRate={completionRate}
                  onOpen={openView}
                  onAdd={() => setEditor({ task: null })}
                  onPlan={planBacklog}
                  onEdit={(task) => setEditor({ task })}
                  onToggle={toggleComplete}
                  onDelete={removeTask}
                  onDeleteRoadmap={removeRoadmap}
                />
              )}
              {view === "today" && (
                <TodayView
                  tasks={todayTasks}
                  overdue={overdue}
                  focusTask={focusTask}
                  totalMinutes={todayMinutes}
                  backlog={backlog}
                  quickTitle={quickTitle}
                  onQuickTitle={setQuickTitle}
                  onQuickAdd={quickAdd}
                  onAdd={() => setEditor({ task: null })}
                  onEdit={(task) => setEditor({ task })}
                  onToggle={toggleComplete}
                  onDelete={removeTask}
                  onToday={moveToToday}
                  onPlan={planBacklog}
                />
              )}
              {view === "schedule" && (
                <ScheduleView
                  tasks={state.tasks}
                  roadmaps={state.roadmaps}
                  backlog={backlog}
                  settings={state.settings}
                  onEdit={(task) => setEditor({ task })}
                  onToggle={toggleComplete}
                  onDelete={removeTask}
                  onDeleteRoadmap={removeRoadmap}
                  onBacklog={returnToBacklog}
                  onAdd={(scheduledAt) => setEditor({ task: null, scheduledAt })}
                  onPlan={planBacklog}
                />
              )}
              {view === "backlog" && (
                <BacklogView
                  tasks={backlog}
                  roadmaps={state.roadmaps}
                  onAdd={() => setEditor({ task: null })}
                  onEdit={(task) => setEditor({ task })}
                  onToggle={toggleComplete}
                  onDelete={removeTask}
                  onToday={moveToToday}
                  onPlan={planBacklog}
                />
              )}
              {view === "plans" && (
                <PlansView plans={state.plans} onCreate={createPlan} onUpdate={updatePlan} onDelete={removePlan} />
              )}
              {view === "completed" && (
                <CompletedView tasks={completed} onToggle={toggleComplete} onDeleteSelected={deleteCompleted} />
              )}
            </motion.div>
          )}
          </AnimatePresence>
        </div>
      </section>

      {editor && (
        <TaskEditor
          key={editor.task?.id ?? editor.scheduledAt ?? "new"}
          task={editor.task}
          initialScheduledAt={editor.scheduledAt}
          defaultDuration={state.settings.defaultDuration}
          alarmsAvailable={alarmsAvailable}
          onAlarmUnavailable={() => { setInstallForAlarm(true); setInstallInfoOpen(true); }}
          onClose={() => setEditor(null)}
          onSave={saveTask}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={state.settings}
          notificationPermission={notificationPermission}
          installed={installed}
          native={native}
          alarmsAvailable={alarmsAvailable}
          onChange={(settings) => setState((current) => ({ ...current, settings }))}
          onClose={() => setSettingsOpen(false)}
          onEnableNotifications={enableNotifications}
          onAlarmUnavailable={() => { setSettingsOpen(false); setInstallForAlarm(true); setInstallInfoOpen(true); }}
          onInstall={() => { setSettingsOpen(false); setInstallForAlarm(false); setInstallInfoOpen(true); }}
          onExport={exportBackup}
          onImport={importBackup}
          onClear={clearAll}
        />
      )}
      <InstallDialog open={installInfoOpen} installed={installed} native={native} alarmOnly={installForAlarm} onClose={() => { setInstallInfoOpen(false); setInstallForAlarm(false); }} onInstall={() => void installApp()} />
      {showOpening && <MotivationMoment mode="opening" onFinish={finishOpening} />}
      {alarmsAvailable && activeAlarmMoment && <MotivationMoment mode="alarm" taskTitle={activeAlarmMoment.title} onFinish={stopAlarmMoment} onSnooze={snoozeAlarmMoment} onCheckIn={activeAlarmMoment.alarmMode === "strict" ? finishAlarmMoment : undefined} onBacklog={activeAlarmMoment.alarmMode === "strict" ? () => beginAlarmBacklogMove(activeAlarmMoment.id) : undefined} />}
      {alarmsAvailable && activeAlarmId && state.tasks.find((task) => task.id === activeAlarmId) && (
        <StrictAlarmDialog task={state.tasks.find((task) => task.id === activeAlarmId)!} onComplete={completeStrictAlarm} onSnooze={snoozeStrictAlarm} onBacklog={() => beginAlarmBacklogMove(activeAlarmId)} />
      )}
      {backlogAlarmTarget && <BacklogAlarmDialog key={backlogAlarmTarget.id} task={backlogAlarmTarget} onCancel={() => setBacklogAlarmTargetId(null)} onMove={(time) => moveTaskToBacklog(backlogAlarmTarget, time)} />}
      <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent className="border-white/12 bg-[#0a1526] text-white">
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteTarget?.kind === "roadmap" ? `Delete the entire ${deleteTarget.roadmap.title} roadmap?` : `Delete ${deleteTarget?.kind === "task" ? deleteTarget.task.title : "this session"}?`}</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-400">
              {deleteTarget?.kind === "roadmap" ? `Every scheduled, backlog, and completed session in this roadmap will be removed together. This is the clean bulk-delete action.` : "Only this session will be removed. The rest of its roadmap stays intact."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 bg-white/5 text-white hover:bg-white/10 hover:text-white">Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-rose-500 text-white hover:bg-rose-400">Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AnimatePresence>
        {toast && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 18, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 10, scale: 0.98 }} transition={{ duration: 0.22 }}><Check size={16} />{toast}</motion.div>}
      </AnimatePresence>
    </main>
    </MotionConfig>
  );
}

function LoadingSurface() {
  return (
    <section className="loading-surface" aria-label="Loading your offline planner">
      <span className="loading-orb"><Image src={logoMark} alt="" width={30} height={30} /></span>
      <div><strong>Opening your planner</strong><span>Everything stays on this device.</span></div>
    </section>
  );
}

interface TaskActions {
  onEdit?: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete?: (task: Task) => void;
  onToday?: (task: Task) => void;
  onBacklog?: (task: Task) => void;
}

function DashboardView({ todayTasks, overdue, backlog, completed, scheduled, roadmaps, allTasks, focusTask, completionRate, onOpen, onAdd, onPlan, onEdit, onToggle, onDelete, onDeleteRoadmap }: {
  todayTasks: Task[];
  overdue: Task[];
  backlog: Task[];
  completed: Task[];
  scheduled: Task[];
  roadmaps: Roadmap[];
  allTasks: Task[];
  focusTask: Task | null;
  completionRate: number;
  onOpen: (view: View) => void;
  onAdd: () => void;
  onPlan: () => void;
  onEdit: (task: Task) => void;
  onToggle: (task: Task) => void;
  onDelete: (task: Task) => void;
  onDeleteRoadmap: (roadmap: Roadmap) => void;
}) {
  const todayMinutes = todayTasks.reduce((sum, task) => sum + task.duration, 0);
  const nextTasks = scheduled.filter((task) => task.scheduledAt).sort(taskSort).slice(0, 4);
  const metrics = [
    { label: "Today", value: todayTasks.length, note: `${formatDuration(todayMinutes)} planned`, icon: Target, tone: "sky" },
    { label: "Needs care", value: overdue.length, note: overdue.length ? "Ready to rescue" : "Nothing overdue", icon: Flame, tone: overdue.length ? "rose" : "mint" },
    { label: "Backlog", value: backlog.length, note: backlog.length ? "Ready to distribute" : "Beautifully clear", icon: Inbox, tone: "violet" },
    { label: "Completed", value: completed.length, note: `${completionRate}% of all tasks`, icon: TrendingUp, tone: "mint" },
  ];

  return (
    <div className="overview-dashboard">
      <Card className="dashboard-hero">
        <div className="hero-aurora" />
        <CardContent className="dashboard-hero-content">
          <div className="hero-copy">
            <Badge variant="secondary" className="hero-badge"><Sparkles size={13} /> Your offline command center</Badge>
            <h2>{focusTask ? `Start gently with ${focusTask.title}` : "Your time belongs to you."}</h2>
            <p>{focusTask ? `${formatDuration(focusTask.duration)} is already set aside. One honest step is enough to begin.` : "Capture the outcome, choose the total effort, and let DamnTodo make the days feel lighter."}</p>
            <div className="hero-actions">
              <button className="button button-primary hero-primary" onClick={onAdd}><Plus size={17} /> New task or goal</button>
              {backlog.length > 0 ? <button className="button button-quiet" onClick={onPlan}><Sparkles size={16} /> Balance my backlog</button> : <button className="button button-quiet" onClick={() => onOpen("schedule")}><CalendarDays size={16} /> Open schedule</button>}
            </div>
          </div>
          <div className="hero-focus-ring" style={{ background: `conic-gradient(#92c4ff ${completionRate}%, rgba(255, 255, 255, .08) 0)` }} aria-label={`${completionRate}% completion rate`}>
            <span><strong>{completionRate}%</strong><small>overall done</small></span>
          </div>
        </CardContent>
      </Card>

      {roadmaps.length > 0 && (
        <section className="dashboard-roadmaps">
          <div className="section-heading"><div><span className="eyebrow">Active roadmaps</span><h2>One goal, one organized system</h2></div><button className="soft-link" onClick={() => onOpen("schedule")}>Manage all <ArrowUpRight size={15} /></button></div>
          <div className="roadmap-grid roadmap-grid-compact">{roadmaps.slice(0, 2).map((roadmap) => <RoadmapCard key={roadmap.id} roadmap={roadmap} tasks={allTasks} onDelete={onDeleteRoadmap} />)}</div>
        </section>
      )}

      <section className="metric-grid" aria-label="Planner summary">
        {metrics.map(({ label, value, note, icon: Icon, tone }) => (
          <Card className={`overview-metric tone-${tone}`} key={label}>
            <CardHeader><span className="metric-icon"><Icon size={18} /></span><Badge variant="outline">Live</Badge></CardHeader>
            <CardContent><strong>{value}</strong><span>{label}</span><small>{note}</small></CardContent>
          </Card>
        ))}
      </section>

      <section className="dashboard-lower-grid">
        <Card className="dashboard-panel next-panel">
          <CardHeader className="dashboard-panel-heading"><div><span className="eyebrow">Coming up</span><CardTitle>Your next clear steps</CardTitle></div><button className="soft-link" onClick={() => onOpen("schedule")}>Full schedule <ArrowUpRight size={15} /></button></CardHeader>
          <CardContent>
            {nextTasks.length ? <div className="dashboard-task-list">{nextTasks.map((task) => <TaskCard key={task.id} task={task} compact onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />)}</div> : <div className="dashboard-calm-empty"><CalendarDays size={23} /><div><strong>Your horizon is open</strong><span>Add a goal or let the scheduler place your backlog.</span></div></div>}
          </CardContent>
        </Card>

        <Card className="dashboard-panel pulse-panel">
          <CardHeader><span className="eyebrow">Your rhythm</span><CardTitle>Momentum, without pressure</CardTitle></CardHeader>
          <CardContent>
            <div className="progress-copy"><span>All-time completion</span><strong>{completionRate}%</strong></div>
            <Progress value={completionRate} className="dashboard-progress" />
            <div className="dashboard-shortcuts">
              <button onClick={() => onOpen("today")}><span className="shortcut-icon sky"><Target size={18} /></span><span><strong>Shape today</strong><small>{todayTasks.length} planned</small></span><ChevronRight size={16} /></button>
              <button onClick={() => onOpen("backlog")}><span className="shortcut-icon violet"><Inbox size={18} /></span><span><strong>Clear the backlog</strong><small>{backlog.length} waiting</small></span><ChevronRight size={16} /></button>
              <button onClick={() => onOpen("completed")}><span className="shortcut-icon mint"><CheckCircle2 size={18} /></span><span><strong>See your wins</strong><small>{completed.length} completed</small></span><ChevronRight size={16} /></button>
            </div>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function RoadmapCard({ roadmap, tasks, onDelete }: { roadmap: Roadmap; tasks: Task[]; onDelete: (roadmap: Roadmap) => void }) {
  const stats = getRoadmapStats(tasks, roadmap.id);
  const range = `${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(`${roadmap.startDate}T00:00:00`))} – ${new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(`${roadmap.endDate}T00:00:00`))}`;
  return (
    <Card className={`roadmap-card ${roadmap.alarmMode === "strict" ? "strict-roadmap" : ""}`}>
      <CardHeader className="roadmap-card-head">
        <div className="roadmap-title-wrap"><span className="roadmap-icon"><MapIcon size={19} /></span><div><CardTitle>{roadmap.title}</CardTitle><span>{range}</span></div></div>
        <button className="roadmap-delete" onClick={() => onDelete(roadmap)} aria-label={`Delete ${roadmap.title} roadmap and every session`} title="Delete entire roadmap"><Trash2 size={16} /></button>
      </CardHeader>
      <CardContent className="roadmap-card-body">
        <div className="roadmap-progress-copy"><span>{stats.completed} of {stats.total} sessions</span><strong>{stats.progress}%</strong></div>
        <Progress value={stats.progress} className="roadmap-progress" />
        <div className="roadmap-stats">
          <span className="streak-chip"><Flame size={15} /> {stats.streak} day streak</span>
          {stats.backlog > 0 && <span className="backlog-chip"><RotateCcw size={14} /> {stats.backlog} to rescue</span>}
          <span><Clock3 size={14} /> {formatDuration(roadmap.sessionDuration)} / session</span>
        </div>
        <div className="roadmap-next">
          <div><span>Next step</span><strong>{stats.nextTask?.title ?? "Roadmap complete"}</strong></div>
          {stats.nextTask && <small>{stats.nextTask.status === "backlog" ? "Waiting in backlog" : stats.nextTask.scheduledAt ? formatDateTime(stats.nextTask.scheduledAt) : "Ready to schedule"}</small>}
        </div>
        <div className="roadmap-rule">
          {roadmap.scheduleStyle === "random" ? <><Shuffle size={14} /> Random between {roadmap.randomStart}–{roadmap.randomEnd}</> : <><AlarmClock size={14} /> Fixed at {roadmap.fixedTime}</>}
          {roadmap.alarmMode === "strict" && <Badge className="red-mode-badge">Red mode</Badge>}
        </div>
      </CardContent>
    </Card>
  );
}

function TaskCard({ task, compact = false, ...actions }: { task: Task; compact?: boolean } & TaskActions) {
  const due = dueState(task);
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      whileHover={{ x: 2 }}
      transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
      className={`task-card due-${due} ${compact ? "compact" : ""} ${task.status === "completed" ? "is-complete" : ""} ${task.status === "backlog" && task.alarmMode === "strict" ? "is-red-backlog" : ""}`}
    >
      <button className="task-check" onClick={() => actions.onToggle(task)} aria-label={task.status === "completed" ? `Restore ${task.title}` : `Complete ${task.title}`}>
        {task.status === "completed" ? <Check size={14} /> : <Circle size={16} />}
      </button>
      <button className="task-main" onClick={() => actions.onEdit?.(task)} disabled={!actions.onEdit}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <span><Clock3 size={12} />{formatDuration(task.duration)}</span>
          {task.scheduledAt && task.status === "scheduled" && <span>{formatDateTime(task.scheduledAt)}</span>}
          {task.status === "backlog" && task.missedAt && (task.plannedFor ?? task.scheduledAt) && <span className="missed-label">Missed · {formatDateTime((task.plannedFor ?? task.scheduledAt)!)}</span>}
          {task.status === "scheduled" && task.alarmMode !== "none" && <span className={task.alarmMode === "strict" ? "red-reminder-label" : "reminder-label"}><AlarmClock size={12} />Hourly after session</span>}
          {task.status === "backlog" && task.backlogAlarmStartsAt && <span className={task.alarmMode === "strict" ? "red-reminder-label" : "reminder-label"}><AlarmClock size={12} />Retry from {formatDateTime(task.backlogAlarmStartsAt)}</span>}
          {task.goalId && task.sessionIndex && task.sessionCount && <span className="session-label">Session {task.sessionIndex}/{task.sessionCount}</span>}
          {task.dueAt && <span className={`due-label ${due}`}>{due === "overdue" ? "Overdue · " : due === "soon" ? "Due soon · " : "Due · "}{formatDateTime(task.dueAt)}</span>}
        </span>
      </button>
      {!compact && <span className={`priority-mark ${task.priority}`} title={`${task.priority} priority`} />}
      <div className="task-actions">
        {actions.onToday && task.status === "backlog" && <button onClick={() => actions.onToday?.(task)} title="Schedule today" aria-label={`Schedule ${task.title} today`}><CalendarDays size={15} /></button>}
        {actions.onBacklog && task.status === "scheduled" && <button onClick={() => actions.onBacklog?.(task)} title="Move to backlog" aria-label={`Move ${task.title} to backlog`}><RotateCcw size={15} /></button>}
        {actions.onEdit && <button onClick={() => actions.onEdit?.(task)} title="Edit" aria-label={`Edit ${task.title}`}><Pencil size={15} /></button>}
        {actions.onDelete && task.status !== "scheduled" && <button onClick={() => actions.onDelete?.(task)} title="Delete" aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>}
      </div>
    </motion.article>
  );
}

function TodayView({ tasks, overdue, focusTask, totalMinutes, backlog, quickTitle, onQuickTitle, onQuickAdd, onAdd, onEdit, onToggle, onDelete, onToday, onPlan }: {
  tasks: Task[]; overdue: Task[]; focusTask: Task | null; totalMinutes: number; backlog: Task[]; quickTitle: string;
  onQuickTitle: (value: string) => void; onQuickAdd: (event: FormEvent) => void; onAdd: () => void; onPlan: () => void;
  onEdit: (task: Task) => void; onToggle: (task: Task) => void; onDelete: (task: Task) => void; onToday: (task: Task) => void;
}) {
  return (
    <div className="dashboard-grid">
      <div className="primary-column">
        <section className="focus-strip">
          <div className="focus-copy"><span className="eyebrow">Focus signal</span><h2>{focusTask ? focusTask.title : "Your day has room to breathe."}</h2><p>{focusTask ? `${formatDuration(focusTask.duration)} · ${focusTask.dueAt ? `Due ${formatDateTime(focusTask.dueAt)}` : "Ready when you are"}` : "Capture a task or let the scheduler shape your backlog."}</p></div>
          <div className="focus-stats"><strong>{tasks.length}</strong><span>today</span><i /><strong>{formatDuration(totalMinutes)}</strong><span>planned</span></div>
        </section>

        {overdue.length > 0 && (
          <section className="attention-block">
            <div className="section-heading"><div><span className="eyebrow danger-text">Needs attention</span><h2>{overdue.length} overdue</h2></div><AlarmClock size={19} /></div>
            <div className="task-stack">{overdue.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onToday={task.status === "backlog" ? onToday : undefined} />)}</div>
          </section>
        )}

        <section className="panel day-panel">
          <div className="section-heading"><div><span className="eyebrow">Today&apos;s path</span><h2>{tasks.length ? `${tasks.length} focused step${tasks.length === 1 ? "" : "s"}` : "Nothing scheduled yet"}</h2></div><span className="soft-pill">{formatDuration(totalMinutes)} planned</span></div>
          {tasks.length ? (
            <div className="timeline">
              {tasks.map((task) => (
                <div className="timeline-row" key={task.id}>
                  <time>{new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(new Date(task.scheduledAt!))}</time>
                  <span className="timeline-dot" />
                  <TaskCard task={task} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} />
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={CalendarDays} title="Nothing scheduled today" body="Add a task at a specific time or schedule work from your backlog into open slots." actionLabel="Add a task" onAction={onAdd} secondaryLabel={backlog.length ? `Schedule ${backlog.length} from backlog` : undefined} onSecondary={backlog.length ? onPlan : undefined} />
          )}
        </section>
      </div>

      <aside className="panel backlog-rail">
        <div className="section-heading"><div><span className="eyebrow">Backlog</span><h2>Ready when you are</h2></div><button className="icon-button" onClick={onAdd} aria-label="Add task"><Plus size={18} /></button></div>
        <form className="quick-capture" onSubmit={onQuickAdd}><Plus size={16} /><input value={quickTitle} onChange={(event) => onQuickTitle(event.target.value)} placeholder="Capture something…" aria-label="Quick task title" /><kbd>↵</kbd></form>
        <div className="rail-list">
          {backlog.slice(0, 6).map((task) => <TaskCard key={task.id} task={task} compact onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onToday={onToday} />)}
          {!backlog.length && <div className="mini-empty"><CheckCircle2 size={22} /><span>Nothing waiting.<br />That&apos;s a good feeling.</span></div>}
        </div>
        {backlog.length > 0 && <button className="button button-plan wide" onClick={onPlan}><Sparkles size={16} /> Schedule {backlog.length} task{backlog.length === 1 ? "" : "s"}</button>}
      </aside>
    </div>
  );
}

function ScheduleView({ tasks, roadmaps, backlog, settings, onEdit, onToggle, onDelete, onDeleteRoadmap, onBacklog, onAdd, onPlan }: {
  tasks: Task[]; roadmaps: Roadmap[]; backlog: Task[]; settings: PlannerSettings; onEdit: (task: Task) => void; onToggle: (task: Task) => void; onDelete: (task: Task) => void; onDeleteRoadmap: (roadmap: Roadmap) => void; onBacklog: (task: Task) => void; onAdd: (scheduledAt: string) => void; onPlan: () => void;
}) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    return Array.from({ length: 14 }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, []);
  return (
    <div className="schedule-layout">
      <section className="roadmap-overview">
          <div className="section-heading"><div><span className="eyebrow">Roadmaps</span><h2>{roadmaps.length ? `${roadmaps.length} active roadmap${roadmaps.length === 1 ? "" : "s"}` : "No roadmap yet"}</h2></div><span className="soft-pill"><Flame size={14} /> Independent streaks</span></div>
        {roadmaps.length ? <div className="roadmap-grid">{roadmaps.map((roadmap) => <RoadmapCard key={roadmap.id} roadmap={roadmap} tasks={tasks} onDelete={onDeleteRoadmap} />)}</div> : <EmptyState icon={MapIcon} title="Create a structured roadmap" body="Choose a date range, working days, session length, and the steps you want to schedule." />}
      </section>
      <section className="panel week-panel">
        <div className="section-heading"><div><span className="eyebrow">Next 14 days</span><h2>Upcoming schedule</h2></div><span className="soft-pill">Working hours · {settings.dayStart}–{settings.dayEnd}</span></div>
        <div className="week-grid">
          {days.map((date, index) => {
            const dayTasks = tasks.filter((task) => task.status === "scheduled" && task.scheduledAt && dateKey(task.scheduledAt) === dateKey(date)).sort(taskSort);
            const minutes = dayTasks.reduce((sum, task) => sum + task.duration, 0);
            const nextSlot = nextAvailableSlotForDate(date, tasks, settings);
            const slotLabel = nextSlot ? new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(nextSlot) : "Day full";
            return (
              <article className={`day-column ${index === 0 ? "today" : ""}`} key={date.toISOString()}>
                <header><div><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong></div><small>{minutes ? formatDuration(minutes) : "Open"}</small></header>
                <div className="day-tasks">
                  {dayTasks.map((task) => <TaskCard key={task.id} task={task} compact onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onBacklog={onBacklog} />)}
                  <button className="add-slot" disabled={!nextSlot} onClick={() => { if (nextSlot) onAdd(localDateTime(nextSlot)); }}><Plus size={15} /> {nextSlot ? `Add at ${slotLabel}` : slotLabel}</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {backlog.length > 0 && <section className="schedule-helper"><div><span className="helper-icon"><Sparkles size={20} /></span><div><strong>{backlog.length} unscheduled task{backlog.length === 1 ? "" : "s"}</strong><p>Schedule them into open time without overlapping existing tasks.</p></div></div><button className="button button-primary" onClick={onPlan}>Auto-schedule <ChevronRight size={16} /></button></section>}
    </div>
  );
}

function BacklogView({ tasks, roadmaps, onAdd, onEdit, onToggle, onDelete, onToday, onPlan }: { tasks: Task[]; roadmaps: Roadmap[]; onAdd: () => void; onEdit: (task: Task) => void; onToggle: (task: Task) => void; onDelete: (task: Task) => void; onToday: (task: Task) => void; onPlan: () => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const high = tasks.filter((task) => task.priority === "high").length;
  const total = tasks.reduce((sum, task) => sum + task.duration, 0);
  const roadmapGroups = roadmaps.map((roadmap) => ({ roadmap, tasks: tasks.filter((task) => task.goalId === roadmap.id) })).filter((group) => group.tasks.length);
  const knownRoadmaps = new Set(roadmaps.map((roadmap) => roadmap.id));
  const looseTasks = tasks.filter((task) => !task.goalId || !knownRoadmaps.has(task.goalId));
  const toggleExpanded = (id: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  return (
    <section className="panel list-panel">
      <div className="list-overview"><div><span className="eyebrow">Unscheduled work</span><h2>{tasks.length ? `${tasks.length} tasks, ${formatDuration(total)} total` : "No unscheduled tasks"}</h2><p>{high ? `${high} high-priority task${high === 1 ? "" : "s"} will be scheduled first.` : "Tasks here are ready to place on your calendar."}</p></div>{tasks.length > 0 && <button className="button button-plan" onClick={onPlan}><Sparkles size={16} /> Auto-schedule all</button>}</div>
      {tasks.length ? <div className="backlog-groups">
        {roadmapGroups.map(({ roadmap, tasks: sessions }) => {
          const isExpanded = expanded.has(roadmap.id);
          const visible = isExpanded ? sessions : sessions.slice(0, 4);
          return <section className="backlog-roadmap-group" key={roadmap.id}>
            <header><div><span className="roadmap-icon"><MapIcon size={17} /></span><div><strong>{roadmap.title}</strong><small>{sessions.length} missed session{sessions.length === 1 ? "" : "s"} grouped here</small></div></div>{sessions.length > 4 && <button onClick={() => toggleExpanded(roadmap.id)}>{isExpanded ? "Show less" : `Show all ${sessions.length}`}</button>}</header>
            <div className="task-stack">{visible.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onToday={onToday} />)}</div>
          </section>;
        })}
        {looseTasks.length > 0 && <section className="backlog-loose"><div className="section-heading"><div><span className="eyebrow">Individual tasks</span><h2>Not part of a roadmap</h2></div></div><div className="task-stack">{looseTasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onToday={onToday} />)}</div></section>}
      </div> : <EmptyState icon={Inbox} title="Nothing is hanging over you" body="Capture the next thing in a spacious editor. It stays safely on this device until you schedule it." actionLabel="Capture a task" onAction={onAdd} />}
    </section>
  );
}

function PlansView({ plans, onCreate, onUpdate, onDelete }: { plans: Plan[]; onCreate: (title: string) => void; onUpdate: (plan: Plan) => void; onDelete: (plan: Plan) => void }) {
  const [title, setTitle] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onCreate(title.trim() || "Untitled checklist");
    setTitle("");
  };
  return (
    <div className="plans-view">
      <form className="plan-create panel" onSubmit={submit}>
        <NotebookPen size={19} />
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Create a plan or checklist…" aria-label="New plan title" maxLength={140} />
        <button className="button button-primary" type="submit"><Plus size={16} />Create checklist</button>
      </form>
      <div className="plans-heading"><div><span className="eyebrow">Simple lists</span><h2>No schedules, alarms, or streak pressure</h2></div><span className="soft-pill"><LockKeyhole size={13} />Private on this device</span></div>
      {plans.length ? <div className="plans-grid">{plans.map((plan) => <PlanCard key={plan.id} plan={plan} onUpdate={onUpdate} onDelete={onDelete} />)}</div> : <EmptyState icon={NotebookPen} title="Create your first plan" body="Use plans for shopping lists, ideas, packing lists, or anything that should never trigger an alarm." />}
    </div>
  );
}

function PlanCard({ plan, onUpdate, onDelete }: { plan: Plan; onUpdate: (plan: Plan) => void; onDelete: (plan: Plan) => void }) {
  const [itemText, setItemText] = useState("");
  const addItem = (event: FormEvent) => {
    event.preventDefault();
    const text = itemText.trim();
    if (!text) return;
    onUpdate({ ...plan, items: [...plan.items, { id: crypto.randomUUID(), text, completed: false }] });
    setItemText("");
  };
  return (
    <article className="plan-card">
      <header><input className="plan-title-input" value={plan.title} onChange={(event) => onUpdate({ ...plan, title: event.target.value })} aria-label="Plan title" maxLength={140} /><button type="button" onClick={() => onDelete(plan)} aria-label={`Delete ${plan.title}`} title="Delete plan"><Trash2 size={15} /></button></header>
      <div className="plan-items">
        {plan.items.map((item) => <div className={`plan-item ${item.completed ? "is-complete" : ""}`} key={item.id}><button type="button" className="plan-item-check" onClick={() => onUpdate({ ...plan, items: plan.items.map((entry) => entry.id === item.id ? { ...entry, completed: !entry.completed } : entry) })} aria-pressed={item.completed} aria-label={`${item.completed ? "Restore" : "Complete"} ${item.text}`}>{item.completed ? <Check size={13} /> : <Circle size={14} />}</button><span>{item.text}</span><button type="button" className="plan-item-delete" onClick={() => onUpdate({ ...plan, items: plan.items.filter((entry) => entry.id !== item.id) })} aria-label={`Delete ${item.text}`}><X size={13} /></button></div>)}
        {!plan.items.length && <p className="plan-empty">Add the first checklist item.</p>}
      </div>
      <form className="plan-add-item" onSubmit={addItem}><Plus size={14} /><input value={itemText} onChange={(event) => setItemText(event.target.value)} placeholder="Add a checklist item" aria-label={`Add item to ${plan.title}`} maxLength={180} /><button type="submit" disabled={!itemText.trim()}>Add</button></form>
    </article>
  );
}

function CompletedView({ tasks, onToggle, onDeleteSelected }: { tasks: Task[]; onToggle: (task: Task) => void; onDeleteSelected: (ids: string[]) => void }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const selectedCount = tasks.filter((task) => selected.has(task.id)).length;
  const toggleSelection = (id: string) => setSelected((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const selectAll = () => setSelected((current) => current.size === tasks.length ? new Set() : new Set(tasks.map((task) => task.id)));
  const removeSelected = () => {
    const ids = tasks.filter((task) => selected.has(task.id)).map((task) => task.id);
    onDeleteSelected(ids);
    setSelected(new Set());
  };
  return (
    <section className="panel list-panel">
      <div className="list-overview"><div><span className="eyebrow">Completed</span><h2>{tasks.length ? `${tasks.length} completed` : "No completed tasks yet"}</h2><p>Select only the finished tasks you want to remove. Scheduled work is protected.</p></div>{tasks.length > 0 && <div className="completed-bulk-actions"><button className="button button-quiet" onClick={selectAll}>{selectedCount === tasks.length ? "Clear selection" : "Select all"}</button><button className="danger-outline-button" onClick={removeSelected} disabled={!selectedCount}><Trash2 size={15} />Delete selected{selectedCount ? ` (${selectedCount})` : ""}</button></div>}</div>
      {tasks.length ? <div className="task-stack roomy">{tasks.map((task) => <div className={`completed-select-row ${selected.has(task.id) ? "is-selected" : ""}`} key={task.id}><button className="completed-selector" onClick={() => toggleSelection(task.id)} aria-pressed={selected.has(task.id)} aria-label={`${selected.has(task.id) ? "Deselect" : "Select"} ${task.title} for deletion`}>{selected.has(task.id) ? <Check size={14} /> : <Circle size={15} />}</button><TaskCard task={task} onToggle={(item) => { setSelected((current) => { const next = new Set(current); next.delete(item.id); return next; }); onToggle(item); }} /></div>)}</div> : <EmptyState icon={ListChecks} title="Your progress will collect here" body="Complete a task and it will move here automatically. You can restore it anytime." />}
    </section>
  );
}

function EmptyState({ icon: Icon, title, body, actionLabel, onAction, secondaryLabel, onSecondary }: { icon: typeof Inbox; title: string; body: string; actionLabel?: string; onAction?: () => void; secondaryLabel?: string; onSecondary?: () => void }) {
  return (
    <div className="empty-state"><span className="empty-icon"><Icon size={25} /></span><h3>{title}</h3><p>{body}</p>{actionLabel && <div className="empty-actions"><button className="button button-primary" onClick={onAction}><Plus size={16} />{actionLabel}</button>{secondaryLabel && <button className="button button-quiet" onClick={onSecondary}><Sparkles size={16} />{secondaryLabel}</button>}</div>}</div>
  );
}

function ModalShell({ children, titleId, onClose, wide = false }: { children: React.ReactNode; titleId: string; onClose: () => void; wide?: boolean }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", closeOnEscape);
    document.body.classList.add("modal-open");
    panelRef.current?.focus();
    return () => { document.removeEventListener("keydown", closeOnEscape); document.body.classList.remove("modal-open"); };
  }, [onClose]);
  const onBackdrop = (event: MouseEvent<HTMLDivElement>) => { if (event.target === event.currentTarget) onClose(); };
  return <div className="modal-backdrop" onMouseDown={onBackdrop}><div ref={panelRef} className={`modal-panel ${wide ? "wide" : ""}`} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}>{children}</div></div>;
}

function SettingsPanel({ settings, notificationPermission, installed, native, alarmsAvailable, onChange, onClose, onEnableNotifications, onAlarmUnavailable, onInstall, onExport, onImport, onClear }: { settings: PlannerSettings; notificationPermission: NotificationPermission; installed: boolean; native: boolean; alarmsAvailable: boolean; onChange: (settings: PlannerSettings) => void; onClose: () => void; onEnableNotifications: () => void; onAlarmUnavailable: () => void; onInstall: () => void; onExport: () => void; onImport: (file: File) => void; onClear: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleWorkDay = (day: number) => onChange({ ...settings, workDays: settings.workDays.includes(day) ? settings.workDays.filter((item) => item !== day) : [...settings.workDays, day] });
  return (
    <ModalShell titleId="settings-title" onClose={onClose} wide>
      <div className="settings-panel">
        <header className="modal-header"><div><span className="eyebrow">Your system</span><h2 id="settings-title">Settings</h2></div><button className="close-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button></header>
        <div className="settings-body">
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><CalendarDays size={18} /></span><div><h3>Auto-schedule window</h3><p>Tasks use real open slots inside these working days and hours.</p></div></div><div className="weekday-picker">{WEEKDAYS.map((day, index) => <button key={`${day.value}-${index}`} className={settings.workDays.includes(day.value) ? "active" : ""} onClick={() => toggleWorkDay(day.value)} aria-label={`Toggle ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.value]}`}>{day.label}</button>)}</div><div className="form-grid three compact-grid"><label className="field"><span>Start</span><input type="time" value={settings.dayStart} onChange={(event) => onChange({ ...settings, dayStart: event.target.value })} /></label><label className="field"><span>Finish</span><input type="time" value={settings.dayEnd} onChange={(event) => onChange({ ...settings, dayEnd: event.target.value })} /></label><label className="field"><span>Plan ahead</span><select value={settings.planningDays} onChange={(event) => onChange({ ...settings, planningDays: Number(event.target.value) })}><option value={5}>5 workdays</option><option value={7}>7 workdays</option><option value={10}>10 workdays</option><option value={14}>14 workdays</option></select></label></div></section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><BellRing size={18} /></span><div><h3>Hourly follow-ups</h3><p>{alarmsAvailable ? "Quiet during sessions, persistent after they end." : "Unavailable in a regular browser."}</p></div></div>{alarmsAvailable ? <><div className="settings-row"><div><strong>{native ? "Android alarm system" : notificationPermission === "granted" ? "Notifications enabled" : "Notifications are off"}</strong><span>{native ? "Can continue the hourly retry cycle outside the app after Android permissions are granted." : notificationPermission === "granted" ? "Hourly follow-ups can appear while the installed app is available." : "Allow notifications to receive hourly follow-ups."}</span></div>{(native || notificationPermission !== "granted") && <button className="button button-quiet" onClick={onEnableNotifications}><Bell size={15} /> {native ? "Configure" : "Enable"}</button>}</div><label className="toggle-row"><div><strong>Reminder sound</strong><span>Gentle stays silent; red mode plays a tone with its hourly alarm.</span></div><input type="checkbox" checked={settings.sound} onChange={(event) => onChange({ ...settings, sound: event.target.checked })} /><i /></label><div className="honest-note"><CloudOff size={17} /><p><strong>{native ? "Android path:" : "Installed app:"}</strong> {native ? "A rolling exact-notification queue is refreshed whenever the app opens. Grant Notifications and Alarms & reminders for killed-app delivery." : "Keep the installed app available so hourly follow-ups can appear with Stop, Snooze, and Backlog controls."}</p></div></> : <button className="alarm-settings-lock" onClick={onAlarmUnavailable}><LockKeyhole size={18} /><span><strong>Install DamnTodo for alarms</strong><small>Browser alarms are blocked because they cannot be trusted.</small></span><ChevronRight size={16} /></button>}</section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><Install size={18} /></span><div><h3>App &amp; data</h3><p>Your tasks live only in this browser&apos;s private offline database.</p></div></div><div className="action-grid"><button className="settings-action" onClick={onInstall}><Install size={18} /><span><strong>{installed ? "App installed" : "Install DamnTodo"}</strong><small>{installed ? "Ready from your home screen" : "Use it like a native app"}</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={onExport}><Download size={18} /><span><strong>Download backup</strong><small>Save every task and setting</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={() => fileRef.current?.click()}><FileUp size={18} /><span><strong>Restore backup</strong><small>Import a DamnTodo JSON file</small></span><ChevronRight size={16} /></button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file); event.target.value = ""; }} /><button className="danger-button" onClick={onClear}><Trash2 size={15} /> Clear every task</button></section>
        </div>
        <footer className="modal-footer"><span className="privacy-note"><span className="status-dot" /> No account · No cloud · No tracking</span><button className="button button-primary" onClick={onClose}>Done</button></footer>
      </div>
    </ModalShell>
  );
}
