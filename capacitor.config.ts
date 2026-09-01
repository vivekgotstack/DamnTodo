/// <reference types="@capacitor/local-notifications" />
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.damntodo.app",
  appName: "DamnTodo",
  webDir: "out",
  server: { androidScheme: "https" },
  plugins: {
    LocalNotifications: {
      iconColor: "#92BDFF",
    },
  },
};

export default config;
