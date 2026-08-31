import { Capacitor } from "@capacitor/core";
import type { Task } from "./planner";

const CHANNEL_ID = "damntodo-strict";
const FOLLOW_UPS = 6;

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 16777619);
  }
  return Math.abs(result % 1_900_000_000) + 1;
}

function notificationIds(taskId: string) {
  return Array.from({ length: FOLLOW_UPS }, (_, index) => hash(`${taskId}:${index}`));
}

export function isNativeApp() {
  return Capacitor.isNativePlatform();
}

export async function prepareNativeAlarms(requestExact = false) {
  if (!isNativeApp()) return { native: false, exact: false, granted: false };
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  let permission = await LocalNotifications.checkPermissions();
  if (permission.display !== "granted") permission = await LocalNotifications.requestPermissions();
  await LocalNotifications.createChannel({
    id: CHANNEL_ID,
    name: "Strict alarms",
    description: "Persistent DamnTodo work alarms",
    importance: 5,
    visibility: 1,
    vibration: true,
    lights: true,
  });
  let exact = true;
  if (Capacitor.getPlatform() === "android") {
    const setting = await LocalNotifications.checkExactNotificationSetting();
    exact = setting.exact_alarm === "granted";
    if (!exact && requestExact) {
      const changed = await LocalNotifications.changeExactNotificationSetting();
      exact = changed.exact_alarm === "granted";
    }
  }
  return { native: true, exact, granted: permission.display === "granted" };
}

export async function scheduleNativeTaskAlarm(task: Task) {
  if (!isNativeApp() || !task.dueAt || task.alarmMode === "none" || task.reminderMinutes === null) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  await cancelNativeTaskAlarm(task.id);
  const alarmAt = task.goalId && task.scheduledAt ? task.scheduledAt : task.dueAt;
  const trigger = new Date(alarmAt).getTime() - task.reminderMinutes * 60_000;
  if (trigger <= Date.now()) return;
  const strict = task.alarmMode === "strict";
  const count = strict ? FOLLOW_UPS : 1;
  await LocalNotifications.schedule({
    notifications: Array.from({ length: count }, (_, index) => ({
      id: notificationIds(task.id)[index],
      title: strict ? "DamnTodo strict alarm" : "DamnTodo reminder",
      body: strict ? `${task.title}. Open the app and check in when it is actually done.` : task.title,
      largeBody: strict ? `This alarm stays active until you open DamnTodo and complete: ${task.title}` : undefined,
      channelId: CHANNEL_ID,
      schedule: { at: new Date(trigger + index * 10 * 60_000), allowWhileIdle: true },
      ongoing: strict,
      autoCancel: !strict,
      isExactNotification: true,
      extra: { taskId: task.id, strict },
    })),
  });
}

export async function cancelNativeTaskAlarm(taskId: string) {
  if (!isNativeApp()) return;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const ids = notificationIds(taskId);
  await LocalNotifications.cancel({ notifications: ids.map((id) => ({ id })) });
  await LocalNotifications.removeDeliveredNotificationsById({ ids });
}

export async function listenForNativeAlarm(onOpen: (taskId: string) => void) {
  if (!isNativeApp()) return () => undefined;
  const { LocalNotifications } = await import("@capacitor/local-notifications");
  const handle = await LocalNotifications.addListener("localNotificationActionPerformed", ({ notification }) => {
    const taskId = notification.extra?.taskId;
    if (typeof taskId === "string") onOpen(taskId);
  });
  return () => { void handle.remove(); };
}
