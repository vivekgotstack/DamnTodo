"use client";

import Image from "next/image";
import {
  AlarmClock,
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
  Inbox,
  ListChecks,
  Pencil,
  Plus,
  RotateCcw,
  Settings,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import skyDawn from "@/public/sky-dawn.webp";
import logoMark from "@/public/logo-mark.png";
import { TaskEditor } from "@/components/task-editor";
import { InstallDialog, StrictAlarmDialog } from "@/components/system-dialogs";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import {
  DEFAULT_STATE,
  autoSchedule,
  createTask,
  createDistributedGoal,
  dueState,
  emptyDraft,
  formatDateTime,
  formatDuration,
  isSameDay,
  localDateTime,
  scheduleToday,
  type PlannerSettings,
  type PlannerState,
  type Task,
  type TaskDraft,
} from "@/lib/planner";
import { loadState, saveState } from "@/lib/storage";
import { cancelNativeTaskAlarm, isNativeApp, listenForNativeAlarm, prepareNativeAlarms, scheduleNativeTaskAlarm } from "@/lib/native-alarms";

type View = "today" | "schedule" | "backlog" | "completed";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const NAVIGATION: Array<{ id: View; label: string; icon: typeof CalendarDays }> = [
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

export default function PlannerApp() {
  const [state, setState] = useState<PlannerState>(DEFAULT_STATE);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>("today");
  const [editor, setEditor] = useState<{ task: Task | null; scheduledAt?: string } | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [quickTitle, setQuickTitle] = useState("");
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installInfoOpen, setInstallInfoOpen] = useState(false);
  const [installed, setInstalled] = useState(false);
  const native = useSyncExternalStore(() => () => undefined, isNativeApp, () => false);
  const [activeAlarmId, setActiveAlarmId] = useState<string | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const announce = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3400);
  }, []);

  useEffect(() => {
    let active = true;
    loadState().then((saved) => {
      if (!active) return;
      setState(saved);
      setReady(true);
    });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      saveState(state).catch(() => announce("Could not save changes. Keep this tab open and try again."));
    }, 180);
    return () => clearTimeout(timer);
  }, [announce, ready, state]);

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
    void listenForNativeAlarm((taskId) => setActiveAlarmId(taskId)).then((dispose) => { stop = dispose; });
    return () => stop();
  }, []);

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
        const body = task.dueAt ? `Due ${formatDateTime(task.dueAt)} · ${formatDuration(task.duration)}` : "Task reminder";
        if (Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          if (registration) await registration.showNotification(task.title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: task.id });
          else new Notification(task.title, { body, icon: "/icon-192.png", tag: task.id });
        }
        playReminderTone();
        announce(`Reminder: ${task.title}`);
        if (task.alarmMode === "strict") setActiveAlarmId(task.id);
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
  }, [announce, playReminderTone, ready, state.tasks]);

  const backlog = useMemo(() => state.tasks.filter((task) => task.status === "backlog").sort(taskSort), [state.tasks]);
  const completed = useMemo(() => state.tasks.filter((task) => task.status === "completed").sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")), [state.tasks]);
  const todayTasks = useMemo(() => state.tasks.filter((task) => task.status === "scheduled" && isSameDay(task.scheduledAt)).sort(taskSort), [state.tasks]);
  const overdue = useMemo(() => state.tasks.filter((task) => dueState(task) === "overdue"), [state.tasks]);
  const todayMinutes = todayTasks.reduce((total, task) => total + task.duration, 0);
  const focusTask = todayTasks[0] ?? overdue[0] ?? null;

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
      const result = createDistributedGoal(draft, state.tasks, state.settings);
      if (result.error) { announce(result.error); return; }
      setState((current) => ({ ...current, tasks: [...result.tasks, ...current.tasks] }));
      await Promise.all(result.tasks.map(scheduleAlarm));
      setView("schedule");
      announce(result.overflow
        ? `Created ${result.tasks.length} sessions. ${result.overflow} need more working hours.`
        : `Distributed exactly ${formatDuration(draft.totalDuration)} into ${result.tasks.length} balanced sessions.`);
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
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? {
        ...item,
        status: completing ? "completed" : item.scheduledAt ? "scheduled" : "backlog",
        completedAt: completing ? new Date().toISOString() : null,
        updatedAt: new Date().toISOString(),
      } : item),
    }));
    if (completing) void cancelNativeTaskAlarm(task.id);
    announce(completing ? "Nicely done." : "Task restored.");
  };

  const removeTask = (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    setState((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
    void cancelNativeTaskAlarm(task.id);
    announce("Task deleted.");
  };

  const planBacklog = () => {
    const result = autoSchedule(state.tasks, state.settings);
    if (!result.scheduled) {
      announce(backlog.length ? "Your available schedule is full. Adjust your hours in Settings." : "Your backlog is already clear.");
      return;
    }
    setState((current) => ({ ...current, tasks: result.tasks }));
    setView("schedule");
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
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "scheduled", scheduledAt: slot, updatedAt: new Date().toISOString() } : item),
    }));
    announce(`Scheduled for ${formatDateTime(slot)}.`);
  };

  const returnToBacklog = (task: Task) => {
    setState((current) => ({
      ...current,
      tasks: current.tasks.map((item) => item.id === task.id ? { ...item, status: "backlog", scheduledAt: null, updatedAt: new Date().toISOString() } : item),
    }));
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
    setState((current) => ({ ...current, tasks: current.tasks.map((task) => task.id === activeAlarmId ? { ...task, snoozedUntil, remindedFor: null } : task) }));
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
      const restored = JSON.parse(await file.text()) as PlannerState;
      if (restored.version !== 2 || !Array.isArray(restored.tasks)) throw new Error("Invalid backup");
      setState({ ...DEFAULT_STATE, ...restored, settings: { ...DEFAULT_STATE.settings, ...restored.settings } });
      announce(`Restored ${restored.tasks.length} tasks.`);
    } catch {
      announce("That file is not a valid DamnTodo backup.");
    }
  };

  const clearAll = () => {
    if (!window.confirm("Delete every task and reset your planner? Download a backup first if you may need it.")) return;
    setState({ ...DEFAULT_STATE, settings: state.settings });
    setSettingsOpen(false);
    announce("Your planner is clear.");
  };

  const currentTitle = view === "today" ? "Your day, clearly." : view === "schedule" ? "A week that fits." : view === "backlog" ? "Everything, captured." : "Progress worth seeing.";
  const currentKicker = view === "today" ? formatDayHeading(new Date()) : view === "schedule" ? "Balanced automatically, editable always" : view === "backlog" ? `${backlog.length} task${backlog.length === 1 ? "" : "s"} waiting for a place` : `${completed.length} completed task${completed.length === 1 ? "" : "s"}`;

  return (
    <main className="app-frame">
      <Image className="sky-image" src={skyDawn} alt="" fill priority sizes="100vw" placeholder="blur" />
      <div className="sky-shade" />
      <section className={`workspace ${ready ? "is-ready" : ""}`}>
        <aside className="sidebar">
          <button className="brand" onClick={() => setView("today")} aria-label="Open today">
            <span className="brand-orb"><Image src={logoMark} alt="" width={26} height={26} /></span>
            <span className="brand-name">DamnTodo</span>
          </button>
          <nav className="main-nav" aria-label="Planner views">
            {NAVIGATION.map(({ id, label, icon: Icon }) => {
              const count = countForView(id, state.tasks);
              return (
                <button key={id} className={`nav-item ${view === id ? "active" : ""}`} onClick={() => setView(id)} aria-current={view === id ? "page" : undefined}>
                  <span><Icon size={18} /> <span className="nav-label">{label}</span></span>
                  {count > 0 && <b>{count}</b>}
                </button>
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
            <div className="title-block"><span className="eyebrow">{currentKicker}</span><h1>{currentTitle}</h1></div>
            <div className="top-actions">
              {!installed && !native && <ShimmerButton onClick={() => setInstallInfoOpen(true)} background="rgba(108, 159, 234, .14)" shimmerColor="#d8eaff" borderRadius="12px" className="mobile-install-cta" aria-label="Install DamnTodo"><Download size={17} /></ShimmerButton>}
              {backlog.length > 0 && <button className="button button-quiet plan-button" onClick={planBacklog}><Sparkles size={16} /> <span>Plan backlog</span></button>}
              <button className="button button-primary" onClick={() => setEditor({ task: null })}><Plus size={18} /> <span>New task</span></button>
            </div>
          </header>

          {!ready ? <LoadingSurface /> : (
            <div className="view-stage" key={view}>
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
                  backlog={backlog}
                  settings={state.settings}
                  onEdit={(task) => setEditor({ task })}
                  onToggle={toggleComplete}
                  onDelete={removeTask}
                  onBacklog={returnToBacklog}
                  onAdd={(scheduledAt) => setEditor({ task: null, scheduledAt })}
                  onPlan={planBacklog}
                />
              )}
              {view === "backlog" && (
                <BacklogView
                  tasks={backlog}
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
            </div>
          )}
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
      {activeAlarmId && state.tasks.find((task) => task.id === activeAlarmId) && (
        <StrictAlarmDialog task={state.tasks.find((task) => task.id === activeAlarmId)!} onComplete={completeStrictAlarm} onSnooze={snoozeStrictAlarm} />
      )}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </main>
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

function TaskCard({ task, compact = false, ...actions }: { task: Task; compact?: boolean } & TaskActions) {
  const due = dueState(task);
  return (
    <article className={`task-card due-${due} ${compact ? "compact" : ""} ${task.status === "completed" ? "is-complete" : ""}`}>
      <button className="task-check" onClick={() => actions.onToggle(task)} aria-label={task.status === "completed" ? `Restore ${task.title}` : `Complete ${task.title}`}>
        {task.status === "completed" ? <Check size={14} /> : <Circle size={16} />}
      </button>
      <button className="task-main" onClick={() => actions.onEdit?.(task)} disabled={!actions.onEdit}>
        <span className="task-title">{task.title}</span>
        <span className="task-meta">
          <span><Clock3 size={12} />{formatDuration(task.duration)}</span>
          {task.scheduledAt && <span>{formatDateTime(task.scheduledAt)}</span>}
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
    </article>
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

function ScheduleView({ tasks, backlog, settings, onEdit, onToggle, onDelete, onBacklog, onAdd, onPlan }: {
  tasks: Task[]; backlog: Task[]; settings: PlannerSettings; onEdit: (task: Task) => void; onToggle: (task: Task) => void; onDelete: (task: Task) => void; onBacklog: (task: Task) => void; onAdd: (scheduledAt: string) => void; onPlan: () => void;
}) {
  const days = useMemo(() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const latest = tasks
      .filter((task) => task.status === "scheduled" && task.scheduledAt && new Date(task.scheduledAt) >= start)
      .reduce((max, task) => Math.max(max, new Date(task.scheduledAt!).getTime()), start.getTime());
    const span = Math.min(62, Math.max(7, Math.ceil((latest - start.getTime()) / 86_400_000) + 1));
    return Array.from({ length: span }, (_, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return date;
    });
  }, [tasks]);
  return (
    <div className="schedule-layout">
      <section className="panel week-panel">
        <div className="section-heading"><div><span className="eyebrow">Next {days.length} days</span><h2>Balanced by time, not guesswork</h2></div><span className="soft-pill">{settings.dayStart} to {settings.dayEnd}</span></div>
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

function BacklogView({ tasks, onAdd, onEdit, onToggle, onDelete, onToday, onPlan }: { tasks: Task[]; onAdd: () => void; onEdit: (task: Task) => void; onToggle: (task: Task) => void; onDelete: (task: Task) => void; onToday: (task: Task) => void; onPlan: () => void }) {
  const high = tasks.filter((task) => task.priority === "high").length;
  const total = tasks.reduce((sum, task) => sum + task.duration, 0);
  return (
    <section className="panel list-panel">
      <div className="list-overview"><div><span className="eyebrow">Unscheduled work</span><h2>{tasks.length ? `${tasks.length} things, ${formatDuration(total)} total` : "A beautifully empty backlog"}</h2><p>{high ? `${high} high-priority task${high === 1 ? "" : "s"} will be placed first.` : "Nothing is hidden; everything here is ready to place."}</p></div>{tasks.length > 0 && <button className="button button-plan" onClick={onPlan}><Sparkles size={16} /> Evenly plan everything</button>}</div>
      {tasks.length ? <div className="task-stack roomy">{tasks.map((task) => <TaskCard key={task.id} task={task} onEdit={onEdit} onToggle={onToggle} onDelete={onDelete} onToday={onToday} />)}</div> : <EmptyState icon={Inbox} title="Nothing is hanging over you" body="Capture the next thing in a spacious editor. It stays safely on this device until you schedule it." actionLabel="Capture a task" onAction={onAdd} />}
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
