/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.damntodo.app",
  appName: "DamnTodo",
  webDir: "out",
  server: { androidScheme: "https" },
  plugins: {
    LocalNotifications: {
      smallIcon: "ic_stat_damntodo",
      iconColor: "#92BDFF",
      presentationOptions: ["badge", "sound", "banner", "list"],
    },
  },
};

export default config;
