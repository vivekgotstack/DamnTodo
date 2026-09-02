package com.damntodo.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String RED_ALARM_CHANNEL_ID = "damntodo-red-alarm-v2";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        createRedAlarmChannel();
    }

    private void createRedAlarmChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager == null || manager.getNotificationChannel(RED_ALARM_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            RED_ALARM_CHANNEL_ID,
            "Red Mode alarms",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Audible DamnTodo alarms for unfinished focus blocks");
        channel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        channel.enableLights(true);
        channel.setLightColor(0xFFFF718F);
        channel.enableVibration(true);
        channel.setVibrationPattern(new long[] { 0, 420, 180, 420, 180, 800 });

        Uri alarmTone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        if (alarmTone == null) alarmTone = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        AudioAttributes audioAttributes = new AudioAttributes.Builder()
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .setUsage(AudioAttributes.USAGE_ALARM)
            .build();
        channel.setSound(alarmTone, audioAttributes);
        manager.createNotificationChannel(channel);
    }
}
