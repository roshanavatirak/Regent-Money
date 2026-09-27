package com.anonymous.regentmoney

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class SmsTaskService : HeadlessJsTaskService() {

    companion object {
        private const val CHANNEL_ID = "regent_sms_sync_channel"
        private const val NOTIFICATION_ID = 88472
    }

    override fun onCreate() {
        super.onCreate()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Transaction Sync",
                NotificationManager.IMPORTANCE_MIN
            ).apply {
                description = "Silent background transaction synchronization"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)

            val notification: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("Regent Money")
                .setContentText("Syncing transaction...")
                .setSmallIcon(R.mipmap.ic_launcher)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setSilent(true)
                .setOngoing(true)
                .build()

            startForeground(NOTIFICATION_ID, notification)
        }
    }

    override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
        val extras = intent?.extras
        if (extras != null) {
            val sender = extras.getString("sender", "")
            val body = extras.getString("body", "")

            val taskData = Arguments.createMap().apply {
                putString("sender", sender)
                putString("body", body)
            }

            return HeadlessJsTaskConfig(
                "SmsBackgroundSync",
                taskData,
                60000,
                true // Allow running in foreground
            )
        }
        return null
    }

    override fun onDestroy() {
        super.onDestroy()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            stopForeground(STOP_FOREGROUND_REMOVE)
        }
    }
}
