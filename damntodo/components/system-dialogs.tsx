"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, BellRing, CheckCircle2, Download, LockKeyhole, Smartphone, Volume2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Textarea } from "@/components/ui/textarea";
import { formatDuration, type Task } from "@/lib/planner";

export function MotivationMoment({ mode, taskTitle, onFinish }: {
  mode: "opening" | "alarm";
  taskTitle?: string;
  onFinish: () => void;
}) {
  const [videoReady, setVideoReady] = useState(false);
  const opening = mode === "opening";
  const [muted, setMuted] = useState(opening);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!opening) return;
    const fallback = window.setTimeout(onFinish, 7500);
    return () => window.clearTimeout(fallback);
  }, [onFinish, opening]);

  const startPlayback = async () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = muted;
    try {
      await video.play();
    } catch {
      video.muted = true;
      setMuted(true);
      await video.play().catch(() => undefined);
    }
  };

  const enableSound = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = false;
    setMuted(false);
    void video.play().catch(() => undefined);
  };

  return (
    <section
      className={`motivation-moment ${opening ? "is-opening" : "is-alarm"}`}
      role={opening ? "status" : "dialog"}
      aria-modal={opening ? undefined : true}
      aria-label={opening ? "Opening DamnTodo" : `Alarm for ${taskTitle ?? "your task"}`}
    >
      <video
        ref={videoRef}
        className={`motivation-video ${videoReady ? "is-ready" : ""}`}
        autoPlay
        muted={muted}
        playsInline
        loop={!opening}
        preload="auto"
        aria-label={opening ? "Opening motivation video" : `Motivation video for ${taskTitle ?? "your alarm"}`}
        onCanPlay={() => { setVideoReady(true); void startPlayback(); }}
        onEnded={opening ? onFinish : undefined}
        onError={opening ? onFinish : undefined}
      >
        <source src="/motivation-one.mp4" type="video/mp4" />
      </video>
      <div className="motivation-vignette" />
      {muted && (
        <button className="motivation-sound" onClick={enableSound} type="button">
          <Volume2 size={15} /> Sound on
        </button>
      )}
      {!opening && (
        <div className="motivation-callout">
          <span>One chance. Make it count.</span>
          <h2>{taskTitle}</h2>
          <Button onClick={onFinish} className="h-12 bg-white px-6 text-slate-950 shadow-2xl hover:bg-sky-50">
            I&apos;m ready
          </Button>
        </div>
      )}
    </section>
  );
}

export function InstallDialog({ open, installed, native, onClose, onInstall }: {
  open: boolean;
  installed: boolean;
  native: boolean;
  onClose: () => void;
  onInstall: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <DialogContent className="max-h-[92svh] overflow-y-auto border-sky-200/15 bg-[#091526]/98 p-0 text-white sm:max-w-[560px]">
        <div className="install-glow" />
        <DialogHeader className="relative px-6 pt-7 text-left">
          <Badge className="mb-3 w-fit border border-sky-200/15 bg-sky-200/8 text-sky-100"><Smartphone className="mr-1 size-3" />Mobile first</Badge>
          <DialogTitle className="text-3xl tracking-[-.045em]">Install the system, not another tab.</DialogTitle>
          <DialogDescription className="mt-2 max-w-md text-sm leading-6 text-slate-400">DamnTodo stays offline. Installation gives it a home-screen presence and unlocks the strongest alarm path your platform allows.</DialogDescription>
        </DialogHeader>
        <div className="relative grid gap-3 px-6 py-6 sm:grid-cols-3">
          {[
            { icon: Download, title: "Offline", body: "Open it without a connection." },
            { icon: BellRing, title: "Alarms", body: "Persistent alarms in Android." },
            { icon: LockKeyhole, title: "Private", body: "No account, API, or backend." },
          ].map(({ icon: Icon, title, body }) => <Card key={title} className="border-white/10 bg-white/[.035] text-white"><CardContent className="p-4"><Icon className="mb-3 size-5 text-sky-200" /><strong className="block text-sm">{title}</strong><p className="mt-1 text-[11px] leading-5 text-slate-400">{body}</p></CardContent></Card>)}
        </div>
        <div className="relative mx-6 rounded-xl border border-amber-200/10 bg-amber-200/[.035] p-3 text-[11px] leading-5 text-amber-50/65">
          {native ? "You are in the native Android build. Grant Notifications and Alarms & reminders for killed-app alerts." : "The installed PWA improves access and offline use, but a browser cannot guarantee an exact alarm after the OS kills it. The included Android wrapper can."}
        </div>
        <DialogFooter className="relative mx-0 mt-5 mb-0 border-t border-white/10 bg-black/10 px-6 py-5">
          <Button variant="ghost" onClick={onClose} className="text-slate-400 hover:bg-white/5 hover:text-white">Maybe later</Button>
          <ShimmerButton onClick={onInstall} disabled={installed || native} background="rgba(120, 171, 246, .16)" shimmerColor="#cce5ff" borderRadius="12px" className="min-h-11 px-5 font-semibold text-sky-50 shadow-xl shadow-sky-500/10 disabled:opacity-55">
            <Download className="mr-2 size-4" />{native ? "Android app active" : installed ? "Already installed" : "Install DamnTodo"}
          </ShimmerButton>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function StrictAlarmDialog({ task, onComplete, onSnooze }: {
  task: Task;
  onComplete: (note: string) => void;
  onSnooze: () => void;
}) {
  const [checkingIn, setCheckingIn] = useState(false);
  const [note, setNote] = useState("");
  const enough = note.trim().length >= 12;
  return (
    <Dialog open>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        className="strict-alarm-panel overflow-hidden border-rose-300/20 bg-[#160b18]/98 p-0 text-white sm:max-w-[600px]"
      >
        <div className="strict-rings" />
        <DialogHeader className="relative px-6 pt-8 text-left sm:px-8">
          <span className="strict-alarm-icon"><AlarmClock className="size-7" /></span>
          <Badge className="mt-5 w-fit bg-rose-300/12 text-rose-100">Strict alarm</Badge>
          <DialogTitle className="mt-2 text-3xl tracking-[-.045em] sm:text-4xl">{task.title}</DialogTitle>
          <DialogDescription className="mt-2 text-sm leading-6 text-rose-50/55">You asked DamnTodo not to let this disappear with one dishonest tap.</DialogDescription>
        </DialogHeader>
        <div className="relative px-6 py-6 sm:px-8">
          <div className="mb-5 grid grid-cols-2 gap-3">
            <Card className="border-white/10 bg-white/4 text-white"><CardContent className="p-4"><span className="text-[10px] uppercase tracking-widest text-rose-100/45">Work block</span><strong className="mt-1 block">{formatDuration(task.duration)}</strong></CardContent></Card>
            <Card className="border-white/10 bg-white/4 text-white"><CardContent className="p-4"><span className="text-[10px] uppercase tracking-widest text-rose-100/45">Proof rule</span><strong className="mt-1 block">12 characters</strong></CardContent></Card>
          </div>
          {!checkingIn ? (
            <Button onClick={() => setCheckingIn(true)} className="h-12 w-full bg-rose-200 text-rose-950 hover:bg-rose-100"><CheckCircle2 className="size-4" />I actually finished it</Button>
          ) : (
            <div className="grid gap-3">
              <label className="text-xs font-medium text-rose-50/75" htmlFor="strict-proof">What did you finish?</label>
              <Textarea id="strict-proof" autoFocus value={note} onChange={(event) => setNote(event.target.value)} placeholder="Write one concrete result. No empty checkbox escape." className="min-h-28 border-white/12 bg-black/20 text-white placeholder:text-rose-50/25 focus-visible:border-rose-200/30 focus-visible:ring-rose-200/10" />
              <Progress value={Math.min(100, note.trim().length / 12 * 100)} className="h-1.5 bg-white/8" />
              <Button disabled={!enough} onClick={() => onComplete(note.trim())} className="h-12 bg-rose-200 text-rose-950 hover:bg-rose-100">Confirm completed</Button>
            </div>
          )}
        </div>
        <DialogFooter className="relative mx-0 mb-0 border-t border-white/10 bg-black/10 px-6 py-4 sm:px-8">
          <Button variant="ghost" onClick={onSnooze} className="text-rose-50/60 hover:bg-white/5 hover:text-white">I need 10 more minutes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
