package com.anonymous.regentmoney

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class SmsTaskService : HeadlessJsTaskService() {
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
}
