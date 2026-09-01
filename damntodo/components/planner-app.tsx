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
  Map as MapIcon,
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
import skyViktor from "@/public/sky-viktor.webp";
import logoMark from "@/public/logo-mark.png";
import { TaskEditor } from "@/components/task-editor";
import { InstallDialog, MotivationMoment, StrictAlarmDialog } from "@/components/system-dialogs";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Badge } from "@/components/ui/badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import {
  DEFAULT_STATE,
  autoSchedule,
  createRoadmap,
  createTask,
  dueState,
  emptyDraft,
  formatDateTime,
  formatDuration,
  getRoadmapStats,
  isSameDay,
  localDateTime,
  rollOverMissedTasks,
  scheduleToday,
  type PlannerSettings,
  type PlannerState,
  type Roadmap,
  type Task,
  type TaskDraft,
} from "@/lib/planner";
import { loadState, saveState, upgradePlannerState } from "@/lib/storage";
import { cancelNativeTaskAlarm, isNativeApp, listenForNativeAlarm, prepareNativeAlarms, scheduleNativeTaskAlarm } from "@/lib/native-alarms";

type View = "dashboard" | "today" | "schedule" | "backlog" | "completed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const NAVIGATION: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
  { id: "dashboard", label: "Home", icon: Home },
  { id: "today", label: "Today", icon: CalendarDays },
  { id: "schedule", label: "Schedule", icon: Archive },
  { id: "backlog", label: "Backlog", icon: Inbox },
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

const taskSort = (a: Task, b: Task) =>
  (a.scheduledAt ?? a.dueAt ?? a.createdAt).localeCompare(b.scheduledAt ?? b.dueAt ?? b.createdAt);

function countForView(view: View, tasks: Task[]) {
  if (view === "today") return tasks.filter((task) => task.status === "scheduled" && isSameDay(task.scheduledAt)).length;
  if (view === "backlog") return tasks.filter((task) => task.status === "backlog").length;
  if (view === "completed") return tasks.filter((task) => task.status === "completed").length;
  return 0;
}

const VIEW_KEY = "damntodo:active-view";
const isView = (value: string | null): value is View =>
  value === "dashboard" || value === "today" || value === "schedule" || value === "backlog" || value === "completed";

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
  const [installed, setInstalled] = useState(false);
  const native = useSyncExternalStore(() => () => undefined, isNativeApp, () => false);
  const [activeAlarmId, setActiveAlarmId] = useState<string | null>(null);
  const [alarmMomentIds, setAlarmMomentIds] = useState<string[]>([]);
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

  const openView = useCallback((nextView: View, replace = false) => {
    if (nextView === view && !replace) return;
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
      setInstallPrompt(null);
      announce("DamnTodo is installed and ready offline.");
    };
    const syncPlatformState = () => {
      setInstalled(window.matchMedia("(display-mode: standalone)").matches);
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
      .filter((task) => task.status === "scheduled" && task.alarmMode !== "none" && task.scheduledAt && new Date(task.scheduledAt) > new Date())
      .sort(taskSort)
      .slice(0, 24);
    const batchKey = upcoming.map((task) => `${task.id}:${task.scheduledAt}:${task.alarmMode}`).join("|");
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
    if (!activeAlarmId) return;
    playReminderTone();
    const repeat = setInterval(playReminderTone, 12_000);
    return () => clearInterval(repeat);
  }, [activeAlarmId, playReminderTone]);

  useEffect(() => {
    if (!ready) return;
    const checkReminders = async () => {
      const now = Date.now();
      const due = state.tasks.filter((task) => {
        const alarmAt = task.goalId && task.scheduledAt ? task.scheduledAt : task.dueAt;
        if (task.status === "completed" || !alarmAt || task.reminderMinutes === null || task.alarmMode === "none") return false;
        const reminderKey = `${alarmAt}:${task.reminderMinutes}:${task.snoozedUntil ?? ""}`;
        const triggerAt = task.snoozedUntil ? new Date(task.snoozedUntil).getTime() : new Date(alarmAt).getTime() - task.reminderMinutes * 60_000;
        return triggerAt <= now && task.remindedFor !== reminderKey;
      });
      if (!due.length) return;
      for (const task of due) {
        const body = task.goalId && task.scheduledAt
          ? `Roadmap session · ${formatDuration(task.duration)} · scheduled ${formatDateTime(task.scheduledAt)}`
          : task.dueAt ? `Due ${formatDateTime(task.dueAt)} · ${formatDuration(task.duration)}` : "Task reminder";
        if (Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          if (registration) await registration.showNotification(task.title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: task.id });
          else new Notification(task.title, { body, icon: "/icon-192.png", tag: task.id });
        }
        playReminderTone();
        announce(`Reminder: ${task.title}`);
        enqueueAlarmMoment(task.id);
      }
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => {
          const fired = due.find((item) => item.id === task.id);
          const alarmAt = fired?.goalId && fired.scheduledAt ? fired.scheduledAt : fired?.dueAt;
          return fired ? { ...task, remindedFor: `${alarmAt}:${fired.reminderMinutes}:${fired.snoozedUntil ?? ""}` } : task;
        }),
      }));
    };
    void checkReminders();
    const timer = setInterval(checkReminders, 30_000);
    document.addEventListener("visibilitychange", checkReminders);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", checkReminders);
    };
  }, [announce, enqueueAlarmMoment, playReminderTone, ready, state.tasks]);

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

  const finishAlarmMoment = useCallback(() => {
    const taskId = alarmMomentIds[0];
    if (!taskId) return;
    const task = state.tasks.find((item) => item.id === taskId);
    setAlarmMomentIds((current) => current.slice(1));
    if (task?.alarmMode === "strict") setActiveAlarmId(task.id);
  }, [alarmMomentIds, state.tasks]);

  const saveTask = async (draft: TaskDraft) => {
    if (editor?.task) {
      const previous = editor.task;
      const updated: Task = {
        ...previous,
        title: draft.title.trim(),
        notes: draft.notes.trim(),
        priority: draft.priority,
        duration: draft.duration,
        dueAt: draft.dueAt || null,
        scheduledAt: draft.scheduledAt || null,
        plannedFor: previous.plannedFor ?? (draft.scheduledAt || null),
        missedAt: draft.scheduledAt ? null : previous.missedAt,
        reminderMinutes: draft.dueAt ? draft.reminderMinutes : null,
        alarmMode: draft.dueAt ? draft.alarmMode : "none",
        remindedFor: previous.dueAt === draft.dueAt && previous.reminderMinutes === draft.reminderMinutes ? previous.remindedFor : null,
        status: draft.scheduledAt ? "scheduled" : previous.status === "completed" ? "completed" : "backlog",
        updatedAt: new Date().toISOString(),
      };
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === previous.id ? updated : task),
      }));
      await scheduleAlarm(updated);
      announce("Task updated.");
    } else if (draft.kind === "goal") {
      const result = createRoadmap(draft);
      if (result.error) { announce(result.error); return; }
      setState((current) => ({ ...current, roadmaps: [result.roadmap!, ...current.roadmaps], tasks: [...result.tasks, ...current.tasks] }));
      openView("schedule");
      announce(`Built ${result.tasks.length} sessions inside one ${draft.title.trim()} roadmap.`);
    } else {
      const task = createTask({ ...draft, scheduledAt: draft.scheduledAt || editor?.scheduledAt || "" });
      setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      await scheduleAlarm(task);
      announce(task.scheduledAt ? "Task added to your schedule." : "Task captured in your backlog.");
    }
    setEditor(null);
  };

  const scheduleAlarm = async (task: Task) => {
    try {
      if (!task.dueAt || task.alarmMode === "none") { await cancelNativeTaskAlarm(task.id); return; }
      if (isNativeApp()) {
        const permission = await prepareNativeAlarms(task.alarmMode === "strict");
        if (!permission.granted) { announce("Alarm permission is still off in Android settings."); return; }
        await scheduleNativeTaskAlarm(task);
        if (task.alarmMode === "strict" && !permission.exact) announce("Android will use an inexact alarm until Alarms & reminders is allowed.");
      }
    } catch {
      announce("The task was saved, but Android could not schedule its alarm yet.");
    }
  };

  const toggleComplete = (task: Task) => {
    const completing = task.status !== "completed";
    const canReturnToSchedule = Boolean(task.scheduledAt && new Date(task.scheduledAt).getTime() + task.duration * 60_000 > Date.now());
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? {
        ...item,
        status: completing ? "completed" : canReturnToSchedule ? "scheduled" : "backlog",
        completedAt: completing ? new Date().toISOString() : null,
        missedAt: completing ? item.missedAt : canReturnToSchedule ? null : (item.missedAt ?? new Date().toISOString()),
        updatedAt: new Date().toISOString(),
      } : item),
    }));
    if (completing) void cancelNativeTaskAlarm(task.id);
    announce(completing ? "Nicely done." : "Task restored.");
  };

  const removeTask = (task: Task) => {
    setDeleteTarget({ kind: "task", task });
  };

  const removeRoadmap = (roadmap: Roadmap) => {
    setDeleteTarget({ kind: "roadmap", roadmap });
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
    announce(result.overflow ? `Planned ${result.scheduled} tasks. ${result.overflow} still need more room.` : `Evenly planned ${result.scheduled} task${result.scheduled === 1 ? "" : "s"}.`);
  };

  const moveToToday = (task: Task) => {
    const slot = scheduleToday(task, state.tasks, state.settings);
    if (!slot) {
      announce("Today is full. Auto-plan it into the next open day instead.");
      return;
    }
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "scheduled", scheduledAt: slot, plannedFor: item.plannedFor ?? slot, missedAt: null, updatedAt: new Date().toISOString() } : item),
    }));
    announce(`Scheduled for ${formatDateTime(slot)}.`);
  };

  const returnToBacklog = (task: Task) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "backlog", plannedFor: item.plannedFor ?? item.scheduledAt, scheduledAt: item.goalId ? item.scheduledAt : null, updatedAt: new Date().toISOString() } : item),
    }));
    void cancelNativeTaskAlarm(task.id);
    announce("Moved back to the backlog.");
  };

  const quickAdd = (event: FormEvent) => {
    event.preventDefault();
    if (!quickTitle.trim()) return;
    const task = createTask({ ...emptyDraft(state.settings.defaultDuration), title: quickTitle });
    setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
    setQuickTitle("");
    announce("Captured. You can add details anytime.");
  };

  const enableNotifications = async () => {
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
    const snoozedUntil = new Date(Date.now() + 10 * 60_000).toISOString();
    const task = state.tasks.find((item) => item.id === activeAlarmId);
    if (!task) return;
    const updated = { ...task, snoozedUntil, remindedFor: null, updatedAt: new Date().toISOString() };
    setState((current) => ({ ...current, tasks: current.tasks.map((item) => item.id === activeAlarmId ? updated : item) }));
    void scheduleAlarm(updated);
    setActiveAlarmId(null);
    announce("Strict alarm snoozed for 10 minutes.");
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

  const currentTitle = view === "dashboard" ? "A calm place to get things done." : view === "today" ? "Your day, clearly." : view === "schedule" ? "A plan that actually fits." : view === "backlog" ? "Everything, captured." : "Progress worth seeing.";
  const currentKicker = view === "dashboard" ? `${formatDayHeading(new Date())} · private and offline` : view === "today" ? "Today, without the noise" : view === "schedule" ? "Balanced automatically, editable always" : view === "backlog" ? `${backlog.length} task${backlog.length === 1 ? "" : "s"} waiting for a place` : `${completed.length} completed task${completed.length === 1 ? "" : "s"}`;

  return (
    <MotionConfig reducedMotion="user">
    <main className="app-frame">
      <Image className="sky-image" src={skyViktor} alt="" fill priority sizes="100vw" placeholder="blur" />
      <div className="sky-shade" />
      <section className={`workspace ${ready ? "is-ready" : ""}`}>
        <aside className="sidebar">
          <button className="brand" onClick={() => openView("dashboard")} aria-label="Open dashboard">
            <span className="brand-orb"><Image src={logoMark} alt="" width={26} height={26} /></span>
            <span className="brand-name">DamnTodo</span>
          </button>
          <nav className="main-nav" aria-label="Planner views">
            {NAVIGATION.map(({ id, label, icon: Icon }) => {
              const count = countForView(id, state.tasks);
              return (
                <motion.button key={id} whileTap={{ scale: 0.96 }} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => openView(id)} aria-current={view === id ? "page" : undefined}>
                  <span><Icon size={18} /> <span className="nav-label">{label}</span></span>
                  {count > 0 && <b>{count}</b>}
                </motion.button>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <ShimmerButton onClick={() => setInstallInfoOpen(true)} background="rgba(108, 159, 234, .12)" shimmerColor="#d8eaff" borderRadius="12px" className="install-side-cta"><Install size={17} /><span>{native ? "Android app" : installed ? "Installed" : "Install app"}</span></ShimmerButton>
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
              {!installed && !native && <ShimmerButton onClick={() => setInstallInfoOpen(true)} background="rgba(108, 159, 234, .14)" shimmerColor="#d8eaff" borderRadius="12px" className="mobile-install-cta" aria-label="Install DamnTodo"><Download size={17} /></ShimmerButton>}
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
              {view === "completed" && (
                <CompletedView tasks={completed} onToggle={toggleComplete} onDelete={removeTask} />
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
          onChange={(settings) => setState((current) => ({ ...current, settings }))}
          onClose={() => setSettingsOpen(false)}
          onEnableNotifications={enableNotifications}
          onInstall={() => { setSettingsOpen(false); setInstallInfoOpen(true); }}
          onExport={exportBackup}
          onImport={importBackup}
          onClear={clearAll}
        />
      )}
      <InstallDialog open={installInfoOpen} installed={installed} native={native} onClose={() => setInstallInfoOpen(false)} onInstall={() => void installApp()} />
      {showOpening && <MotivationMoment mode="opening" onFinish={finishOpening} />}
      {activeAlarmMoment && <MotivationMoment mode="alarm" taskTitle={activeAlarmMoment.title} onFinish={finishAlarmMoment} />}
      {activeAlarmId && state.tasks.find((task) => task.id === activeAlarmId) && (
        <StrictAlarmDialog task={state.tasks.find((task) => task.id === activeAlarmId)!} onComplete={completeStrictAlarm} onSnooze={snoozeStrictAlarm} />
      )}
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
  onDelete: (task: Task) => void;
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
      className={`task-card due-${due} ${compact ? "compact" : ""} ${task.status === "completed" ? "is-complete" : ""}`}
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
          {task.goalId && task.sessionIndex && task.sessionCount && <span className="session-label">Session {task.sessionIndex}/{task.sessionCount}</span>}
          {task.dueAt && <span className={`due-label ${due}`}>{due === "overdue" ? "Overdue · " : due === "soon" ? "Due soon · " : "Due · "}{formatDateTime(task.dueAt)}</span>}
        </span>
      </button>
      {!compact && <span className={`priority-mark ${task.priority}`} title={`${task.priority} priority`} />}
      <div className="task-actions">
        {actions.onToday && task.status === "backlog" && <button onClick={() => actions.onToday?.(task)} title="Schedule today" aria-label={`Schedule ${task.title} today`}><CalendarDays size={15} /></button>}
        {actions.onBacklog && task.status === "scheduled" && <button onClick={() => actions.onBacklog?.(task)} title="Move to backlog" aria-label={`Move ${task.title} to backlog`}><RotateCcw size={15} /></button>}
        {actions.onEdit && <button onClick={() => actions.onEdit?.(task)} title="Edit" aria-label={`Edit ${task.title}`}><Pencil size={15} /></button>}
        <button onClick={() => actions.onDelete(task)} title="Delete" aria-label={`Delete ${task.title}`}><Trash2 size={15} /></button>
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
            <EmptyState icon={CalendarDays} title="Make today intentional" body="Add one task directly or evenly place everything waiting in your backlog." actionLabel="Add a task" onAction={onAdd} secondaryLabel={backlog.length ? `Plan ${backlog.length} from backlog` : undefined} onSecondary={backlog.length ? onPlan : undefined} />
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
        {backlog.length > 0 && <button className="button button-plan wide" onClick={onPlan}><Sparkles size={16} /> Evenly plan {backlog.length} task{backlog.length === 1 ? "" : "s"}</button>}
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
        <div className="section-heading"><div><span className="eyebrow">Long-range systems</span><h2>{roadmaps.length ? `${roadmaps.length} active roadmap${roadmaps.length === 1 ? "" : "s"}` : "No roadmap yet"}</h2></div><span className="soft-pill"><MapIcon size={14} /> grouped, never scattered</span></div>
        {roadmaps.length ? <div className="roadmap-grid">{roadmaps.map((roadmap) => <RoadmapCard key={roadmap.id} roadmap={roadmap} tasks={tasks} onDelete={onDeleteRoadmap} />)}</div> : <EmptyState icon={MapIcon} title="Turn a long goal into a daily rhythm" body="Enter DSA, choose six months or a year, and get one clean roadmap with evenly placed sessions." />}
      </section>
      <section className="panel week-panel">
        <div className="section-heading"><div><span className="eyebrow">Next 14 days only</span><h2>Your near-term path, without the year-long wall</h2></div><span className="soft-pill">{settings.dayStart} to {settings.dayEnd}</span></div>
        <div className="week-grid">
          {days.map((date, index) => {
            const dayTasks = tasks.filter((task) => task.status === "scheduled" && task.scheduledAt && dateKey(task.scheduledAt) === dateKey(date)).sort(taskSort);
            const minutes = dayTasks.reduce((sum, task) => sum + task.duration, 0);
            const inputDate = new Date(date);
            const [hours, mins] = settings.dayStart.split(":").map(Number);
            inputDate.setHours(hours, mins, 0, 0);
            return (
              <article className={`day-column ${index === 0 ? "today" : ""}`} key={date.toISOString()}>
                <header><div><span>{index === 0 ? "Today" : new Intl.DateTimeFormat("en-US", { weekday: "short" }).format(date)}</span><strong>{date.getDate()}</strong></div><small>{minutes ? formatDuration(minutes) : "Open"}</small></header>
                <div className="day-tasks">
                  {dayTasks.map((task) => <TaskCard key={task.id} task={task} compact onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onBacklog={onBacklog} />)}
                  <button className="add-slot" onClick={() => onAdd(localDateTime(inputDate))}><Plus size={15} /> Add task</button>
                </div>
              </article>
            );
          })}
        </div>
      </section>
      {backlog.length > 0 && <section className="schedule-helper"><div><span className="helper-icon"><Sparkles size={20} /></span><div><strong>{backlog.length} task{backlog.length === 1 ? "" : "s"} still waiting</strong><p>Place them across your lightest days, while respecting due dates and work hours.</p></div></div><button className="button button-primary" onClick={onPlan}>Plan them now <ChevronRight size={16} /></button></section>}
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
      <div className="list-overview"><div><span className="eyebrow">Unscheduled work</span><h2>{tasks.length ? `${tasks.length} things, ${formatDuration(total)} total` : "A beautifully empty backlog"}</h2><p>{high ? `${high} high-priority task${high === 1 ? "" : "s"} will be placed first.` : "Nothing is hidden; everything here is ready to place."}</p></div>{tasks.length > 0 && <button className="button button-plan" onClick={onPlan}><Sparkles size={16} /> Evenly plan everything</button>}</div>
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

function CompletedView({ tasks, onToggle, onDelete }: { tasks: Task[]; onToggle: (task: Task) => void; onDelete: (task: Task) => void }) {
  return (
    <section className="panel list-panel">
      <div className="list-overview"><div><span className="eyebrow">Done and dusted</span><h2>{tasks.length ? `${tasks.length} completed` : "No completed tasks yet"}</h2><p>Your wins stay visible without cluttering the work ahead.</p></div></div>
      {tasks.length ? <div className="task-stack roomy">{tasks.map((task) => <TaskCard key={task.id} task={task} onToggle={onToggle} onDelete={onDelete} />)}</div> : <EmptyState icon={ListChecks} title="Your progress will collect here" body="Complete a task and it will move here automatically. You can restore it anytime." />}
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

function SettingsPanel({ settings, notificationPermission, installed, native, onChange, onClose, onEnableNotifications, onInstall, onExport, onImport, onClear }: { settings: PlannerSettings; notificationPermission: NotificationPermission; installed: boolean; native: boolean; onChange: (settings: PlannerSettings) => void; onClose: () => void; onEnableNotifications: () => void; onInstall: () => void; onExport: () => void; onImport: (file: File) => void; onClear: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleWorkDay = (day: number) => onChange({ ...settings, workDays: settings.workDays.includes(day) ? settings.workDays.filter((item) => item !== day) : [...settings.workDays, day] });
  return (
    <ModalShell titleId="settings-title" onClose={onClose} wide>
      <div className="settings-panel">
        <header className="modal-header"><div><span className="eyebrow">Your system</span><h2 id="settings-title">Settings</h2></div><button className="close-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button></header>
        <div className="settings-body">
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><CalendarDays size={18} /></span><div><h3>Auto-schedule window</h3><p>Tasks are divided evenly across these days and hours.</p></div></div><div className="weekday-picker">{WEEKDAYS.map((day, index) => <button key={`${day.value}-${index}`} className={settings.workDays.includes(day.value) ? "active" : ""} onClick={() => toggleWorkDay(day.value)} aria-label={`Toggle ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.value]}`}>{day.label}</button>)}</div><div className="form-grid three compact-grid"><label className="field"><span>Start</span><input type="time" value={settings.dayStart} onChange={(event) => onChange({ ...settings, dayStart: event.target.value })} /></label><label className="field"><span>Finish</span><input type="time" value={settings.dayEnd} onChange={(event) => onChange({ ...settings, dayEnd: event.target.value })} /></label><label className="field"><span>Plan ahead</span><select value={settings.planningDays} onChange={(event) => onChange({ ...settings, planningDays: Number(event.target.value) })}><option value={5}>5 workdays</option><option value={7}>7 workdays</option><option value={10}>10 workdays</option><option value={14}>14 workdays</option></select></label></div></section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><BellRing size={18} /></span><div><h3>Reminders</h3><p>Local alarms with no account or server.</p></div></div><div className="settings-row"><div><strong>{native ? "Android alarm system" : notificationPermission === "granted" ? "Notifications enabled" : "Notifications are off"}</strong><span>{native ? "Can notify outside the app after Android permissions are granted." : notificationPermission === "granted" ? "Due reminders can appear while the app is active." : "Allow notifications to receive due reminders."}</span></div>{(native || notificationPermission !== "granted") && <button className="button button-quiet" onClick={onEnableNotifications}><Bell size={15} /> {native ? "Configure" : "Enable"}</button>}</div><label className="toggle-row"><div><strong>Reminder sound</strong><span>Play a tone when an in-app reminder fires.</span></div><input type="checkbox" checked={settings.sound} onChange={(event) => onChange({ ...settings, sound: event.target.checked })} /><i /></label><div className="honest-note"><CloudOff size={17} /><p><strong>{native ? "Android path:" : "Browser limit:"}</strong> {native ? "Persistent exact local notifications work after the app is killed when Notifications and Alarms & reminders are allowed." : "A PWA cannot guarantee an exact alarm after the OS kills it. Missed reminders fire when DamnTodo opens again; use the included Android build for killed-app alarms."}</p></div></section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><Install size={18} /></span><div><h3>App &amp; data</h3><p>Your tasks live only in this browser&apos;s private offline database.</p></div></div><div className="action-grid"><button className="settings-action" onClick={onInstall}><Install size={18} /><span><strong>{installed ? "App installed" : "Install DamnTodo"}</strong><small>{installed ? "Ready from your home screen" : "Use it like a native app"}</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={onExport}><Download size={18} /><span><strong>Download backup</strong><small>Save every task and setting</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={() => fileRef.current?.click()}><FileUp size={18} /><span><strong>Restore backup</strong><small>Import a DamnTodo JSON file</small></span><ChevronRight size={16} /></button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file); event.target.value = ""; }} /><button className="danger-button" onClick={onClear}><Trash2 size={15} /> Clear every task</button></section>
        </div>
        <footer className="modal-footer"><span className="privacy-note"><span className="status-dot" /> No account · No cloud · No tracking</span><button className="button button-primary" onClick={onClose}>Done</button></footer>
      </div>
    </ModalShell>
  );
}
