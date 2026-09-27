package com.anonymous.regentmoney

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log
import com.facebook.react.HeadlessJsTaskService

class SmsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            try {
                val messages = Telephony.Sms.Intents.getMessagesFromIntent(intent)
                for (message in messages) {
                    val sender = message.displayOriginatingAddress ?: ""
                    val body = message.displayMessageBody ?: ""
                    Log.d("SmsReceiver", "Received SMS from $sender: $body")

                    // Start Headless JS Task Service
                    val serviceIntent = Intent(context, SmsTaskService::class.java).apply {
                        putExtra("sender", sender)
                        putExtra("body", body)
                    }

                    try {
                        HeadlessJsTaskService.acquireWakeLockNow(context)
                        context.startService(serviceIntent)
                    } catch (serviceEx: Exception) {
                        Log.w("SmsReceiver", "startService failed, attempting foreground fallback", serviceEx)
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            try {
                                context.startForegroundService(serviceIntent)
                            } catch (fgEx: Exception) {
                                Log.e("SmsReceiver", "startForegroundService also failed", fgEx)
                            }
                        }
                    }
                }
            } catch (e: Exception) {
                Log.e("SmsReceiver", "Error processing SMS", e)
            }
        }
    }
}
