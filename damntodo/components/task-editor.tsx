"use client";

import { type FormEvent, useMemo, useState } from "react";
import { AlarmClock, CalendarRange, ChevronRight, Clock3, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { draftFromTask, emptyDraft, formatDuration, localDateTime, type AlarmMode, type DraftKind, type Priority, type Task, type TaskDraft } from "@/lib/planner";

const DURATIONS = [15, 25, 30, 45, 60, 90, 120, 180];
const SESSION_LIMITS = [15, 25, 30, 45, 60, 90, 120, 180, 240];

function defaultDeadline() {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  date.setHours(18, 0, 0, 0);
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 16);
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
  const update = <K extends keyof TaskDraft>(key: K, value: TaskDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const sessions = useMemo(() => Math.max(1, Math.ceil(draft.totalDuration / draft.maxSessionDuration)), [draft.maxSessionDuration, draft.totalDuration]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft.title.trim() || (draft.kind === "goal" && !draft.dueAt)) return;
    onSave(draft);
  };
  const setKind = (kind: DraftKind) => setDraft((current) => ({
    ...current,
    kind,
    dueAt: kind === "goal" && !current.dueAt ? defaultDeadline() : current.dueAt,
    scheduledAt: kind === "goal" ? "" : current.scheduledAt,
  }));

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="task-editor-dialog max-h-[94svh] overflow-hidden border-white/12 bg-[#0a1526]/98 p-0 text-slate-50 shadow-2xl sm:max-w-[780px]">
        <form onSubmit={submit} className="flex max-h-[94svh] flex-col">
          <DialogHeader className="border-b border-white/10 px-5 py-5 text-left sm:px-7">
            <div className="flex items-start justify-between gap-4 pr-8">
              <div>
                <Badge variant="outline" className="mb-2 border-sky-300/15 bg-sky-300/5 text-[10px] tracking-[.14em] text-sky-100 uppercase">
                  {task ? "Edit session" : "Clear capture"}
                </Badge>
                <DialogTitle className="text-2xl tracking-[-.04em] text-white sm:text-3xl">{task ? "Make the task fit." : "What needs doing?"}</DialogTitle>
                <DialogDescription className="mt-2 text-xs text-slate-400">One task, or one larger goal split exactly across your calendar.</DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="grid gap-5 overflow-y-auto px-5 py-5 sm:px-7">
            {!task && (
              <Tabs value={draft.kind} onValueChange={(value) => setKind(value as DraftKind)}>
                <TabsList className="grid h-12 w-full grid-cols-2 border border-white/10 bg-white/4 p-1">
                  <TabsTrigger value="task" className="gap-2 data-[state=active]:bg-sky-300/12 data-[state=active]:text-white"><Clock3 className="size-4" />Single task</TabsTrigger>
                  <TabsTrigger value="goal" className="gap-2 data-[state=active]:bg-violet-300/12 data-[state=active]:text-white"><CalendarRange className="size-4" />Multi-day goal</TabsTrigger>
                </TabsList>
              </Tabs>
            )}

            <div className="grid gap-2">
              <Label htmlFor="task-title">{draft.kind === "goal" ? "Goal" : "Task"}</Label>
              <Textarea id="task-title" autoFocus rows={2} value={draft.title} onChange={(event) => update("title", event.target.value)} placeholder={draft.kind === "goal" ? "Ship the portfolio redesign" : "A clear, specific next step"} required maxLength={180} className="min-h-20 resize-y border-white/12 bg-white/4 text-lg font-medium text-white placeholder:text-slate-600 focus-visible:border-sky-300/40 focus-visible:ring-sky-300/10" />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="task-notes">Notes <span className="font-normal text-slate-500">optional</span></Label>
              <Textarea id="task-notes" rows={3} value={draft.notes} onChange={(event) => update("notes", event.target.value)} placeholder="Context, links, or your definition of done" className="resize-y border-white/12 bg-white/4 text-white placeholder:text-slate-600 focus-visible:border-sky-300/40 focus-visible:ring-sky-300/10" />
            </div>

            {draft.kind === "goal" ? (
              <div className="goal-builder">
                <div className="goal-builder-head">
                  <span className="goal-builder-icon"><Sparkles className="size-4" /></span>
                  <div><strong>Exact-total distribution</strong><p>{sessions} balanced session{sessions === 1 ? "" : "s"}. The total stays exactly {formatDuration(draft.totalDuration)} and no session exceeds {formatDuration(draft.maxSessionDuration)}.</p></div>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2"><Label htmlFor="total-hours">Total effort in hours</Label><Input id="total-hours" type="number" inputMode="decimal" min="0.25" max="1000" step="0.25" value={draft.totalDuration / 60} onChange={(event) => update("totalDuration", Math.max(15, Math.round(Number(event.target.value || 0) * 60)))} className="h-11 border-white/12 bg-[#0b192c] text-white" /></div>
                  <div className="grid gap-2"><Label>Maximum session</Label><Select value={String(draft.maxSessionDuration)} onValueChange={(value) => update("maxSessionDuration", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{SESSION_LIMITS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatDuration(minutes)}</SelectItem>)}</SelectContent></Select></div>
                  <div className="grid gap-2"><Label htmlFor="goal-start">Start date</Label><Input id="goal-start" type="date" value={draft.availableFrom} min={localDateTime().slice(0, 10)} onChange={(event) => update("availableFrom", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div>
                  <div className="grid gap-2"><Label htmlFor="goal-deadline">Deadline</Label><Input id="goal-deadline" type="datetime-local" value={draft.dueAt} min={localDateTime()} onChange={(event) => update("dueAt", event.target.value)} required className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="grid gap-2"><Label>Duration</Label><Select value={String(draft.duration)} onValueChange={(value) => update("duration", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{DURATIONS.map((minutes) => <SelectItem key={minutes} value={String(minutes)}>{formatDuration(minutes)}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-2"><Label>Priority</Label><Select value={draft.priority} onValueChange={(value) => update("priority", value as Priority)}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white capitalize"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100">{(["low", "medium", "high"] as Priority[]).map((priority) => <SelectItem key={priority} value={priority} className="capitalize">{priority}</SelectItem>)}</SelectContent></Select></div>
                <div className="grid gap-2"><Label htmlFor="task-due">Due</Label><Input id="task-due" type="datetime-local" value={draft.dueAt} min={task ? undefined : localDateTime()} onChange={(event) => update("dueAt", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div>
                <div className="grid gap-2 sm:col-span-2"><Label htmlFor="task-schedule">Schedule <span className="font-normal text-slate-500">optional</span></Label><Input id="task-schedule" type="datetime-local" value={draft.scheduledAt} onChange={(event) => update("scheduledAt", event.target.value)} className="h-11 border-white/12 bg-[#0b192c] text-white [color-scheme:dark]" /></div>
              </div>
            )}

            <div className="grid gap-4 rounded-2xl border border-rose-300/10 bg-rose-300/[.035] p-4 sm:grid-cols-2">
              <div className="grid gap-2"><Label>Alarm mode</Label><Select disabled={!draft.dueAt} value={draft.dueAt ? draft.alarmMode : "none"} onValueChange={(value) => { const mode = value as AlarmMode; update("alarmMode", mode); update("reminderMinutes", mode === "none" ? null : (draft.reminderMinutes ?? 0)); }}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="none">No alarm</SelectItem><SelectItem value="gentle">Gentle reminder</SelectItem><SelectItem value="strict">Strict until done</SelectItem></SelectContent></Select></div>
              <div className="grid gap-2"><Label>When</Label><Select disabled={!draft.dueAt || draft.alarmMode === "none"} value={String(draft.reminderMinutes ?? 0)} onValueChange={(value) => update("reminderMinutes", Number(value))}><SelectTrigger className="h-11 w-full border-white/12 bg-[#0b192c] text-white"><SelectValue /></SelectTrigger><SelectContent className="border-white/12 bg-[#0b192c] text-slate-100"><SelectItem value="0">At due time</SelectItem><SelectItem value="10">10 minutes before</SelectItem><SelectItem value="30">30 minutes before</SelectItem><SelectItem value="60">1 hour before</SelectItem><SelectItem value="1440">1 day before</SelectItem></SelectContent></Select></div>
              {draft.alarmMode === "strict" && <p className="flex gap-2 text-[11px] leading-5 text-rose-100/75 sm:col-span-2"><AlarmClock className="mt-0.5 size-4 shrink-0 text-rose-300" />Strict mode stays in your face until you complete a written check-in. The Android app also posts persistent OS alarms when the app is closed.</p>}
            </div>
          </div>

          <DialogFooter className="mx-0 mb-0 border-t border-white/10 bg-black/10 px-5 py-4 sm:px-7">
            <Button type="button" variant="ghost" onClick={onClose} className="text-slate-300 hover:bg-white/7 hover:text-white">Cancel</Button>
            <Button type="submit" disabled={!draft.title.trim() || (draft.kind === "goal" && !draft.dueAt)} className="h-11 bg-sky-200 px-5 text-slate-950 shadow-lg shadow-sky-500/10 hover:bg-sky-100">
              {task ? "Save changes" : draft.kind === "goal" ? `Create ${sessions} sessions` : draft.scheduledAt ? "Add to schedule" : "Add to backlog"}<ChevronRight className="size-4" />
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
