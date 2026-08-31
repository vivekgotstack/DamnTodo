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
import { type FormEvent, type MouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import skyDawn from "@/public/sky-dawn.png";
import {
  DEFAULT_STATE,
  autoSchedule,
  createTask,
  draftFromTask,
  dueState,
  emptyDraft,
  formatDateTime,
  formatDuration,
  isSameDay,
  localDateTime,
  scheduleToday,
  type PlannerSettings,
  type PlannerState,
  type Priority,
  type Task,
  type TaskDraft,
} from "@/lib/planner";
import { loadState, saveState } from "@/lib/storage";

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
  const [installed, setInstalled] = useState(false);
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
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
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
    if (!ready) return;
    const checkReminders = async () => {
      const now = Date.now();
      const due = state.tasks.filter((task) => {
        if (task.status === "completed" || !task.dueAt || task.reminderMinutes === null) return false;
        const reminderKey = `${task.dueAt}:${task.reminderMinutes}`;
        const triggerAt = new Date(task.dueAt).getTime() - task.reminderMinutes * 60_000;
        return triggerAt <= now && task.remindedFor !== reminderKey;
      });
      if (!due.length) return;
      for (const task of due) {
        const body = task.dueAt ? `Due ${formatDateTime(task.dueAt)} · ${formatDuration(task.duration)}` : "Task reminder";
        if (Notification.permission === "granted") {
          const registration = await navigator.serviceWorker?.ready;
          if (registration) await registration.showNotification(task.title, { body, icon: "/icon.svg", badge: "/icon.svg", tag: task.id });
          else new Notification(task.title, { body, icon: "/icon.svg", tag: task.id });
        }
        playReminderTone();
        announce(`Reminder: ${task.title}`);
      }
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => {
          const fired = due.find((item) => item.id === task.id);
          return fired ? { ...task, remindedFor: `${fired.dueAt}:${fired.reminderMinutes}` } : task;
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

  const saveTask = (draft: TaskDraft) => {
    if (editor?.task) {
      setState((current) => ({
        ...current,
        tasks: current.tasks.map((task) => task.id === editor.task!.id ? {
          ...task,
          ...draft,
          dueAt: draft.dueAt || null,
          scheduledAt: draft.scheduledAt || null,
          reminderMinutes: draft.dueAt ? draft.reminderMinutes : null,
          remindedFor: task.dueAt === draft.dueAt && task.reminderMinutes === draft.reminderMinutes ? task.remindedFor : null,
          status: draft.scheduledAt ? "scheduled" : task.status === "completed" ? "completed" : "backlog",
          updatedAt: new Date().toISOString(),
        } : task),
      }));
      announce("Task updated.");
    } else {
      const task = createTask({ ...draft, scheduledAt: draft.scheduledAt || editor?.scheduledAt || "" });
      setState((current) => ({ ...current, tasks: [task, ...current.tasks] }));
      announce(task.scheduledAt ? "Task added to your schedule." : "Task captured in your backlog.");
    }
    setEditor(null);
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
    announce(completing ? "Nicely done." : "Task restored.");
  };

  const removeTask = (task: Task) => {
    if (!window.confirm(`Delete “${task.title}”? This cannot be undone.`)) return;
    setState((current) => ({ ...current, tasks: current.tasks.filter((item) => item.id !== task.id) }));
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
    if (choice.outcome === "dismissed") announce("Install cancelled — everything still works in this tab.");
    setInstallPrompt(null);
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
  const currentKicker = view === "today" ? formatDayHeading(new Date()) : view === "schedule" ? "Balanced automatically — editable always" : view === "backlog" ? `${backlog.length} task${backlog.length === 1 ? "" : "s"} waiting for a place` : `${completed.length} completed task${completed.length === 1 ? "" : "s"}`;

  return (
    <main className="app-frame">
      <Image className="sky-image" src={skyDawn} alt="" fill priority sizes="100vw" placeholder="blur" />
      <div className="sky-shade" />
      <section className={`workspace ${ready ? "is-ready" : ""}`}>
        <aside className="sidebar">
          <button className="brand" onClick={() => setView("today")} aria-label="Open today">
            <span className="brand-orb"><Sparkles size={16} /></span>
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
            <button className="side-action" onClick={installApp}><Install size={17} /><span>{installed ? "Installed" : "Install app"}</span></button>
            <button className="side-action" onClick={() => setSettingsOpen(true)}><Settings size={17} /><span>Settings</span></button>
            <div className="offline-status"><span className="status-dot" /><span>Private &amp; offline</span></div>
          </div>
        </aside>

        <div className="content-shell">
          <header className="topbar">
            <div className="title-block"><span className="eyebrow">{currentKicker}</span><h1>{currentTitle}</h1></div>
            <div className="top-actions">
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
          onChange={(settings) => setState((current) => ({ ...current, settings }))}
          onClose={() => setSettingsOpen(false)}
          onEnableNotifications={enableNotifications}
          onInstall={installApp}
          onExport={exportBackup}
          onImport={importBackup}
          onClear={clearAll}
        />
      )}
      {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
    </main>
  );
}

function LoadingSurface() {
  return (
    <section className="loading-surface" aria-label="Loading your offline planner">
      <span className="loading-orb"><Sparkles size={20} /></span>
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
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    date.setDate(date.getDate() + index);
    return date;
  }), []);
  return (
    <div className="schedule-layout">
      <section className="panel week-panel">
        <div className="section-heading"><div><span className="eyebrow">Next seven days</span><h2>Balanced by time, not guesswork</h2></div><span className="soft-pill">{settings.dayStart}–{settings.dayEnd}</span></div>
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

function TaskEditor({ task, initialScheduledAt, defaultDuration, onClose, onSave }: { task: Task | null; initialScheduledAt?: string; defaultDuration: number; onClose: () => void; onSave: (draft: TaskDraft) => void }) {
  const [draft, setDraft] = useState<TaskDraft>(() => task ? draftFromTask(task) : { ...emptyDraft(defaultDuration), scheduledAt: initialScheduledAt ?? "" });
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => { event.preventDefault(); if (draft.title.trim()) onSave(draft); };
  return (
    <ModalShell titleId="task-editor-title" onClose={onClose} wide>
      <form className="editor-form" onSubmit={submit}>
        <header className="modal-header"><div><span className="eyebrow">{task ? "Edit task" : "Clear capture"}</span><h2 id="task-editor-title">{task ? "Make the task fit." : "What needs doing?"}</h2></div><button type="button" className="close-button" onClick={onClose} aria-label="Close editor"><X size={20} /></button></header>
        <div className="editor-body">
          <label className="field title-field"><span>Task</span><textarea autoFocus rows={2} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder="A clear, specific next step…" required maxLength={180} /></label>
          <label className="field"><span>Notes <em>optional</em></span><textarea rows={5} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Context, links, or the definition of done…" /></label>
          <div className="form-grid three">
            <label className="field"><span>Duration</span><select value={draft.duration} onChange={(event) => update("duration", Number(event.target.value))}>{[15, 25, 30, 45, 60, 90, 120, 180].map((minutes) => <option key={minutes} value={minutes}>{formatDuration(minutes)}</option>)}</select></label>
            <fieldset className="field segmented-field"><legend>Priority</legend><div className="segmented">{(["low", "medium", "high"] as Priority[]).map((priority) => <button type="button" key={priority} className={draft.priority === priority ? "active" : ""} onClick={() => update("priority", priority)}>{priority}</button>)}</div></fieldset>
            <label className="field"><span>Due</span><input type="datetime-local" value={draft.dueAt} min={task ? undefined : localDateTime()} onChange={(event) => update("dueAt", event.target.value)} /></label>
          </div>
          <div className="form-grid two">
            <label className="field"><span>Schedule <em>optional</em></span><input type="datetime-local" value={draft.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} /></label>
            <label className={`field ${!draft.dueAt ? "disabled-field" : ""}`}><span>Reminder</span><select disabled={!draft.dueAt} value={draft.reminderMinutes ?? "none"} onChange={(event) => update("reminderMinutes", event.target.value === "none" ? null : Number(event.target.value))}><option value="none">No reminder</option><option value={0}>At due time</option><option value={10}>10 minutes before</option><option value={30}>30 minutes before</option><option value={60}>1 hour before</option><option value={1440}>1 day before</option></select></label>
          </div>
          <div className="editor-hint"><Sparkles size={16} /><span>Leave Schedule empty to keep this in your backlog. Auto-plan can place it later.</span></div>
        </div>
        <footer className="modal-footer"><button type="button" className="button button-quiet" onClick={onClose}>Cancel</button><button type="submit" className="button button-primary" disabled={!draft.title.trim()}>{task ? "Save changes" : draft.scheduledAt ? "Add to schedule" : "Add to backlog"}<ChevronRight size={16} /></button></footer>
      </form>
    </ModalShell>
  );
}

function SettingsPanel({ settings, notificationPermission, installed, onChange, onClose, onEnableNotifications, onInstall, onExport, onImport, onClear }: { settings: PlannerSettings; notificationPermission: NotificationPermission; installed: boolean; onChange: (settings: PlannerSettings) => void; onClose: () => void; onEnableNotifications: () => void; onInstall: () => void; onExport: () => void; onImport: (file: File) => void; onClear: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const toggleWorkDay = (day: number) => onChange({ ...settings, workDays: settings.workDays.includes(day) ? settings.workDays.filter((item) => item !== day) : [...settings.workDays, day] });
  return (
    <ModalShell titleId="settings-title" onClose={onClose} wide>
      <div className="settings-panel">
        <header className="modal-header"><div><span className="eyebrow">Your system</span><h2 id="settings-title">Settings</h2></div><button className="close-button" onClick={onClose} aria-label="Close settings"><X size={20} /></button></header>
        <div className="settings-body">
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><CalendarDays size={18} /></span><div><h3>Auto-schedule window</h3><p>Tasks are divided evenly across these days and hours.</p></div></div><div className="weekday-picker">{WEEKDAYS.map((day, index) => <button key={`${day.value}-${index}`} className={settings.workDays.includes(day.value) ? "active" : ""} onClick={() => toggleWorkDay(day.value)} aria-label={`Toggle ${["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][day.value]}`}>{day.label}</button>)}</div><div className="form-grid three compact-grid"><label className="field"><span>Start</span><input type="time" value={settings.dayStart} onChange={(event) => onChange({ ...settings, dayStart: event.target.value })} /></label><label className="field"><span>Finish</span><input type="time" value={settings.dayEnd} onChange={(event) => onChange({ ...settings, dayEnd: event.target.value })} /></label><label className="field"><span>Plan ahead</span><select value={settings.planningDays} onChange={(event) => onChange({ ...settings, planningDays: Number(event.target.value) })}><option value={5}>5 workdays</option><option value={7}>7 workdays</option><option value={10}>10 workdays</option><option value={14}>14 workdays</option></select></label></div></section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><BellRing size={18} /></span><div><h3>Reminders</h3><p>Simple local alarms with no account or server.</p></div></div><div className="settings-row"><div><strong>{notificationPermission === "granted" ? "Notifications enabled" : "Notifications are off"}</strong><span>{notificationPermission === "granted" ? "Due reminders can appear while the app is running." : "Allow notifications to receive due reminders."}</span></div>{notificationPermission !== "granted" && <button className="button button-quiet" onClick={onEnableNotifications}><Bell size={15} /> Enable</button>}</div><label className="toggle-row"><div><strong>Reminder sound</strong><span>Play a gentle tone when a reminder fires.</span></div><input type="checkbox" checked={settings.sound} onChange={(event) => onChange({ ...settings, sound: event.target.checked })} /><i /></label><div className="honest-note"><CloudOff size={17} /><p><strong>Honest limitation:</strong> browser alarms cannot wake a fully closed app at an exact minute. DamnTodo checks missed reminders immediately when reopened. Keeping the installed app running gives the most reliable alerts.</p></div></section>
          <section className="settings-section"><div className="settings-heading"><span className="settings-icon"><Install size={18} /></span><div><h3>App &amp; data</h3><p>Your tasks live only in this browser&apos;s private offline database.</p></div></div><div className="action-grid"><button className="settings-action" onClick={onInstall}><Install size={18} /><span><strong>{installed ? "App installed" : "Install DamnTodo"}</strong><small>{installed ? "Ready from your home screen" : "Use it like a native app"}</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={onExport}><Download size={18} /><span><strong>Download backup</strong><small>Save every task and setting</small></span><ChevronRight size={16} /></button><button className="settings-action" onClick={() => fileRef.current?.click()}><FileUp size={18} /><span><strong>Restore backup</strong><small>Import a DamnTodo JSON file</small></span><ChevronRight size={16} /></button></div><input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(event) => { const file = event.target.files?.[0]; if (file) void onImport(file); event.target.value = ""; }} /><button className="danger-button" onClick={onClear}><Trash2 size={15} /> Clear every task</button></section>
        </div>
        <footer className="modal-footer"><span className="privacy-note"><span className="status-dot" /> No account · No cloud · No tracking</span><button className="button button-primary" onClick={onClose}>Done</button></footer>
      </div>
    </ModalShell>
  );
}
