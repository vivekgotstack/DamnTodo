# DamnTodo project context

This is the short source of truth for future work. Read this file before scanning the codebase.

## Product promise

DamnTodo is a mobile-first, offline-first planner with four core jobs: long-range roadmap scheduling, backlog rescue, persistent local alarms, and visible progress. It uses no AI and no account. A user can enter a goal such as DSA, choose a month, six months, a year, or exact dates, select study days and session length, then receive one organized roadmap with daily sessions across the full horizon. A custom one-step-per-line plan can be distributed across the same range.

## Architecture

- Next.js 16 App Router with static export friendly client UI.
- React 19, TypeScript, Tailwind CSS 4, shadcn/ui with Radix primitives.
- No backend, cloud database, auth, analytics, or remote runtime dependency.
- IndexedDB stores planner state locally through `lib/storage.ts`.
- The service worker in `public/sw.js` caches the app shell and assets for offline use.
- Capacitor Android wraps the same web app for reliable device-local notifications.
- Android local notifications use exact alarms when the user grants Android's Alarms and reminders permission.

## Important files

- `components/planner-app.tsx`: application shell, dashboard, navigation, views, persistence, reminders, and task actions.
- `components/task-editor.tsx`: shadcn task and goal editor.
- `components/system-dialogs.tsx`: install education and strict alarm check-in.
- `lib/planner.ts`: roadmap/task models, daily and custom roadmap generation, missed-session rollover, progress/streak calculation, due state, and deterministic scheduling.
- `lib/storage.ts`: IndexedDB load and save.
- `lib/native-alarms.ts`: Capacitor permissions, channels, scheduling, snooze, and cancellation.
- `app/globals.css`: visual system, responsive layout, and lightweight CSS motion.
- `app/manifest.ts` and `public/sw.js`: installable offline PWA.
- `capacitor.config.ts` and `android/`: Android wrapper.

## Navigation persistence

The selected page is stored as `damntodo:active-view` in localStorage and mirrored in the URL hash. Refreshing keeps Dashboard, Today, Schedule, Backlog, or Completed open. Browser back and the visible Dashboard back button return through the app without silently resetting the selected page.

## Data and privacy

Roadmaps, their sessions, individual tasks, and settings live in IndexedDB on the current device. Planner state is schema version 3 and automatically upgrades version 2 goal sessions into first-class roadmaps. The selected page lives in localStorage. Notifications and scheduled alarms are device-local. Export and restore use a JSON file. Clearing browser storage removes browser data unless the user has a backup. There is intentionally no server synchronization.

## Alarm limits

The PWA can show notifications while the browser and OS allow its service worker to run, but mobile browsers cannot guarantee an exact wake-up after the OS kills them. The Capacitor Android build is the reliable path. Strict mode schedules persistent local notifications and requires an honest written completion check-in inside the app. It should never claim to be impossible to bypass at the operating-system level.

Roadmap alarms can use one fixed time or a deterministic random time inside a chosen window. The Android client keeps a rolling batch of the next 24 alarm-enabled sessions registered, avoiding a year of OS alarm registrations at once. Missed scheduled sessions automatically move to backlog while retaining their original planned time for recovery and streak calculation.

## Design rules

- Dark midnight base with sky blue, violet, mint, and soft coral accents. Never return to honey yellow.
- Geist typography everywhere.
- Prefer existing shadcn primitives over new modal, form, select, tooltip, or card implementations.
- Use CSS transforms and opacity for motion. Respect `prefers-reduced-motion` and avoid heavy animation runtimes.
- Mobile is primary. Controls must remain roomy, readable, and reachable around 390 px width.
- Keep direct language and the product name `DamnTodo` in metadata.

## Commands

- `npm run dev`: local Next.js development.
- `npm run lint`: ESLint.
- `npm run build`: production Next.js build.
- `npm run android:sync`: build web output and sync Capacitor Android.
- `npm run android:open`: open Android Studio.

The current machine needs Android Studio or an Android SDK path before Gradle can produce an APK.
