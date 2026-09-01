"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlarmClock, CalendarRange, ChevronRight, Clock3, ListChecks, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { draftFromTask, emptyDraft, formatDuration, localDateTime, type AlarmMode, type DraftKind, type Priority, type RoadmapPlanMode, type ScheduleStyle, type Task, type TaskDraft } from "@/lib/planner";

const DURATIONS = [15, 25, 30, 45, 60, 90, 120, 180];
const WEEKDAYS = [
  { value: 1, short: "M", label: "Monday" },
  { value: 2, short: "T", label: "Tuesday" },
  { value: 3, short: "W", label: "Wednesday" },
  { value: 4, short: "T", label: "Thursday" },
  { value: 5, short: "F", label: "Friday" },
  { value: 6, short: "S", label: "Saturday" },
  { value: 0, short: "S", label: "Sunday" },
];

function endDateAfterMonths(months: number, from = localDateTime().slice(0, 10)) {
  const date = new Date(`${from}T00:00:00`);
  date.setMonth(date.getMonth() + months);
  return `${localDateTime(date).slice(0, 10)}T23:59`;
}

function roadmapSessionCount(draft: TaskDraft) {
  if (draft.roadmapPlanMode === "custom") return draft.customTasks.split("\n").filter((line) => line.trim()).length;
  if (!draft.availableFrom || !draft.dueAt || !draft.roadmapWorkDays.length) return 0;
  const end = new Date(`${draft.dueAt.slice(0, 10)}T23:59:59`);
  const cursor = new Date(`${draft.availableFrom}T00:00:00`);
  if (Number.isNaN(cursor.getTime()) || end < cursor) return 0;
  let count = 0;
  for (let scanned = 0; cursor <= end && scanned < 740; scanned += 1) {
    if (draft.roadmapWorkDays.includes(cursor.getDay())) count += 1;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

export function TaskEditor({ task, initialScheduledAt, defaultDuration, onClose, onSave }: {
  task: Task | null;
  initialScheduledAt?: string;
  defaultDuration: number;
  onClose: () => void;
  onSave: (draft: TaskDraft) => void;
}) {
  const [draft, setDraft] = useState<TaskDraft>(() => task
    ? draftFromTask(task)
    : { ...emptyDraft(defaultDuration), scheduledAt: initialScheduledAt ?? "" });
  const [error, setError] = useState("");
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => {
    setError("");
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const sessions = useMemo(() => roadmapSessionCount(draft), [draft]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim()) { setError("Give this a clear name first."); return; }
    if (draft.kind === "goal" && !draft.dueAt) { setError("Choose how long this roadmap should run."); return; }
    if (draft.kind === "goal" && !sessions) { setError(draft.roadmapPlanMode === "custom" ? "Add at least one custom step." : "Choose at least one study day."); return; }
    onSave(draft);
  };
  const setKind = (kind: DraftKind) => setDraft((current) => ({
    ...current,
    kind,
    duration: kind === "goal" && current.duration === defaultDuration ? 60 : current.duration,
    dueAt: kind === "goal" && !current.dueAt ? endDateAfterMonths(6, current.availableFrom) : current.dueAt,
    scheduledAt: kind === "goal" ? "" : current.scheduledAt,
    alarmMode: kind === "goal" ? "strict" : current.alarmMode,
    reminderMinutes: kind === "goal" ? 0 : current.reminderMinutes,
  }));
  const toggleDay = (day: number) => update("roadmapWorkDays", draft.roadmapWorkDays.includes(day)
    ? draft.roadmapWorkDays.filter((value) => value !== day)
    : [...draft.roadmapWorkDays, day]);

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="task-editor-dialog max-h-[94svh] overflow-hidden border-white/12 bg-[#0a1526]/98 p-0 text-slate-50 shadow-2xl sm:max-w-[800px]">
        <form onSubmit={submit} className="flex max-h-[94svh] flex-col">
          <DialogHeader className="border-b border-white/10 px-5 py-5 text-left sm:px-7">
            <Badge variant="outline" className="mb-2 w-fit border-sky-300/15 bg-sky-300/5 text-[10px] tracking-[.14em] text-sky-100 uppercase">
              {task ? "Edit session" : draft.kind === "goal" ? "Roadmap builder" : "Quick capture"}
            </Badge>
            <DialogTitle className="text-2xl tracking-[-.04em] text-white sm:text-3xl">
              {task ? "Make this session fit." : draft.kind === "goal" ? "Build the whole rhythm once." : "What needs doing?"}
            </DialogTitle>
            <DialogDescription className="mt-2 text-xs text-slate-400">
              {draft.kind === "goal" ? "Choose the horizon and study days. DamnTodo creates one organized roadmap, not a wall of todos." : "Capture one clear next action."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 overflow-y-auto px-5 py-5 sm:px-7">
            {!task && (
              <Tabs value={draft.kind} onValueChange={(value) => setKind(value as DraftKind)}>
                <TabsList className="grid h-12 w-full grid-cols-2 border border-white/10 bg-white/4 p-1">
                  <TabsTrigger value="task" className="gap-2 data-active:bg-sky-300/12 data-active:text-white"><Clock3 className="size-4" />Single task</TabsTrigger>
                  <TabsTrigger value="goal" className="gap-2 data-active:bg-violet-300/12 data-active:text-white"><CalendarRange className="size-4" />Long roadmap</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="grid gap-2">
              <Label htmlFor="task-title">{draft.kind === "goal" ? "What are you learning?" : "Task"}</Label>
              <Input id="task-title" autoFocus value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder={draft.kind === "goal" ? "DSA, system design, German…" : "A clear, specific next step"} required maxLength={180} className="h-13 border-white/12 bg-white/4 px-4 text-lg font-medium text-white placeholder:text-slate-600 focus-visible:border-sky-300/40 focus-visible:ring-sky-300/10" />
            </div>

            {draft.kind === "goal" ? (
              <>
                <div className="roadmap-horizon">
                  <div className="goal-builder-head"><span className="goal-builder-icon"><Sparkles className="size-4" /></span><div><strong>How long should it run?</strong><p>Pick a shortcut or set exact dates. Sessions are spread across the full range.</p></div></div>
                  <div className="horizon-presets" aria-label="Roadmap duration presets">
                    {[{ label: "1 month", months: 1 }, { label: "3 months", months: 3 }, { label: "6 months", months: 6 }, { label: "1 year", months: 12 }].map((preset) => <Button key={preset.months} type="button" variant="outline" onClick={() => update("dueAt", endDateAfterMonths(preset.months, draft.availableFrom))}>{preset.label}</Button>)}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label htmlFor="goal-start">Start date</Label><Input id="goal-start" type="date" value={draft.availableFrom} min={localDateTime().slice(0, 10)} onChange={(event) => update("availableFrom", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div><div className="grid gap-2"><Label htmlFor="goal-end">End date</Label><Input id="goal-end" type="date" value={draft.dueAt.slice(0, 10)} min={draft.availableFrom} onChange={(event) => update("dueAt", `${event.target.value}T23:59`)} required className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div></div>
                </div>

                <div className="goal-builder">
                  <div className="goal-builder-head"><span className="goal-builder-icon"><CalendarRange className="size-4" /></span><div><strong>Your daily rhythm</strong><p>{sessions ? `${sessions} session${sessions === 1 ? "" : "s"} across the roadmap` : "Choose your study days"} · {formatDuration(draft.duration)} each.</p></div></div>
                  <div className="weekday-picker roadmap-days">{WEEKDAYS.map((day) => <button type="button" key={day.value} className={draft.roadmapWorkDays.includes(day.value) ? "active" : ""} onClick={() => toggleDay(day.value)} aria-label={`Toggle ${day.label}`}>{day.short}</button>)}</div>
                  <div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Session length</Label><Select value={String(draft.duration)} onValueChange={(value) => update("duration", Number(value))}><SelectTrigger aria-label="Session length" className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{DURATIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatDuration(minutes)}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority} onValueChange={(value) => update("priority", value as Priority)}><SelectTrigger aria-label="Priority" className="h-11 w-full border-white/12 bg-[#0b192c] text-white capitalize"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{(["low", "medium", "high"] as Priority[]).map((priority) => <SelectItem key={priority} value={priority} className="capitalize">{priority}</SelectItem>)}</SelectContent></Select></div></div>
                </div>

                <div className="goal-builder">
                  <div className="goal-builder-head"><span className="goal-builder-icon"><ListChecks className="size-4" /></span><div><strong>What goes into the roadmap?</strong><p>Repeat the main goal each study day, or spread your own steps evenly.</p></div></div>
                  <Tabs value={draft.roadmapPlanMode} onValueChange={(value) => update("roadmapPlanMode", value as RoadmapPlanMode)}><TabsList className="grid h-11 w-full grid-cols-2 border border-white/10 bg-black/10 p-1"><TabsTrigger value="daily">Daily practice</TabsTrigger><TabsTrigger value="custom">Custom steps</TabsTrigger></TabsList></Tabs>
                  {draft.roadmapPlanMode === "custom" && <div className="mt-4 grid gap-2"><Label htmlFor="custom-steps">One step per line</Label><Textarea id="custom-steps" rows={6} value={draft.customTasks} onChange={(event) => update("customTasks", event.target.value)} placeholder={"Arrays & strings\nLinked lists\nStacks & queues\nTrees\nGraphs\nDynamic programming"} className="resize-y border-white/12 bg-[#0b192c] text-white placeholder:text-slate-600" /></div>}
                </div>

                <div className={`alarm-builder ${draft.alarmMode === "strict" ? "is-strict" : ""}`}>
                  <div className="goal-builder-head"><span className="goal-builder-icon"><AlarmClock className="size-4" /></span><div><strong>Alarm behavior</strong><p>Use one fixed study time or a deterministic surprise time inside your chosen window.</p></div></div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="grid gap-2"><Label>Session time</Label><Select value={draft.scheduleStyle} onValueChange={(value) => update("scheduleStyle", value as ScheduleStyle)}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="fixed">Fixed every day</SelectItem><SelectItem value="random">Random inside a window</SelectItem></SelectContent></Select></div>
                    <div className="grid gap-2"><Label>Alarm mode</Label><Select value={draft.alarmMode} onValueChange={(value) => { const mode = value as AlarmMode; update("alarmMode", mode); update("reminderMinutes", mode === "none" ? null : (draft.reminderMinutes ?? 0)); }}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="none">No alarm</SelectItem><SelectItem value="gentle">Gentle reminder</SelectItem><SelectItem value="strict">Red mode · keep chasing me</SelectItem></SelectContent></Select></div>
                    {draft.scheduleStyle === "fixed" ? <div className="grid gap-2 sm:col-span-2"><Label htmlFor="fixed-time">Fixed time</Label><Input id="fixed-time" type="time" value={draft.fixedTime} onChange={(event) => update("fixedTime", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div> : <><div className="grid gap-2"><Label htmlFor="random-start">Random from</Label><Input id="random-start" type="time" value={draft.randomStart} onChange={(event) => update("randomStart", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div><div className="grid gap-2"><Label htmlFor="random-end">Random until</Label><Input id="random-end" type="time" value={draft.randomEnd} onChange={(event) => update("randomEnd", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div></>}
                    {draft.alarmMode !== "none" && <div className="grid gap-2 sm:col-span-2"><Label>Notify me</Label><Select value={String(draft.reminderMinutes ?? 0)} onValueChange={(value) => update("reminderMinutes", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="0">At session time</SelectItem><SelectItem value="10">10 minutes before</SelectItem><SelectItem value="30">30 minutes before</SelectItem><SelectItem value="60">1 hour before</SelectItem></SelectContent></Select></div>}
                  </div>
                  {draft.alarmMode === "strict" && <p className="strict-explainer"><AlarmClock className="size-4" />Red mode posts repeated alarms and requires a written completion check-in. The Android build is the reliable killed-app path.</p>}
                </div>
              </>
            ) : (
              <>
                <div className="grid gap-2"><Label htmlFor="task-notes">Notes <span className="font-normal text-slate-500">optional</span></Label><Textarea id="task-notes" rows={3} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Context, links, or your definition of done" className="resize-y border-white/12 bg-white/4 text-white placeholder:text-slate-600" /></div>
                <div className="grid gap-4 sm:grid-cols-3"><div className="grid gap-2"><Label>Duration</Label><Select value={String(draft.duration)} onValueChange={(value) => update("duration", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{DURATIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatDuration(minutes)}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority} onValueChange={(value) => update("priority", value as Priority)}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white capitalize"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{(["low", "medium", "high"] as Priority[]).map((priority) => <SelectItem key={priority} value={priority} className="capitalize">{priority}</SelectItem>)}</SelectContent></Select></div><div className="grid gap-2"><Label htmlFor="task-due">Due</Label><Input id="task-due" type="datetime-local" value={draft.dueAt} min={task ? undefined : localDateTime()} onChange={(event) => update("dueAt", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div><div className="grid gap-2 sm:col-span-2"><Label htmlFor="task-schedule">Schedule <span className="font-normal text-slate-500">optional</span></Label><Input id="task-schedule" type="datetime-local" value={draft.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div></div>
                <div className={`alarm-builder ${draft.alarmMode === "strict" ? "is-strict" : ""}`}><div className="grid gap-4 sm:grid-cols-2"><div className="grid gap-2"><Label>Alarm mode</Label><Select disabled={!draft.dueAt} value={draft.dueAt ? draft.alarmMode : "none"} onValueChange={(value) => { const mode = value as AlarmMode; update("alarmMode", mode); update("reminderMinutes", mode === "none" ? null : (draft.reminderMinutes ?? 0)); }}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="none">No alarm</SelectItem><SelectItem value="gentle">Gentle reminder</SelectItem><SelectItem value="strict">Red mode · strict</SelectItem></SelectContent></Select></div><div className="grid gap-2"><Label>When</Label><Select disabled={!draft.dueAt || draft.alarmMode === "none"} value={String(draft.reminderMinutes ?? 0)} onValueChange={(value) => update("reminderMinutes", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="0">At due time</SelectItem><SelectItem value="10">10 minutes before</SelectItem><SelectItem value="30">30 minutes before</SelectItem><SelectItem value="60">1 hour before</SelectItem></SelectContent></Select></div></div></div>
              </>
            )}
            {error && <p className="editor-error" role="alert">{error}</p>}
          </div>

          <DialogFooter className="mx-0 mb-0 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-7">
            <Button type="button" variant="ghost" onClick={onClose} className="text-slate-300 hover:bg-white/7 hover:text-white">Cancel</Button>
            <Button type="submit" className="editor-submit h-11 bg-sky-200 px-5 shadow-lg shadow-sky-500/10 hover:bg-sky-100">
              {task ? "Save changes" : draft.kind === "goal" ? `Build ${sessions || "the"} sessions` : draft.scheduledAt ? "Add to schedule" : "Add to backlog"}<ChevronRight className="size-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
