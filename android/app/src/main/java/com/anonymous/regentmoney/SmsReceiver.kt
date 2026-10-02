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
                if (messages.isNullOrEmpty()) return

                // Group multi-part SMS segments by sender so concatenated messages are reconstructed
                val messagesBySender = messages.groupBy { it.displayOriginatingAddress ?: "" }

                for ((sender, msgList) in messagesBySender) {
                    val body = msgList.joinToString(separator = "") { it.displayMessageBody ?: "" }
                    val timestamp = msgList.firstOrNull()?.timestampMillis ?: System.currentTimeMillis()
                    Log.d("SmsReceiver", "Received SMS from $sender (length: ${body.length}): $body")

                    // 1. Direct Native Ingestion (<50ms, zero JS dependency)
                    var nativeSyncHandled = false
                    try {
                        val prefs = context.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
                        val token = prefs.getString("auth_access_token", null)
                        if (!token.isNullOrBlank()) {
                            SmsDirectSyncWorker.syncSms(context, sender, body, timestamp)
                            nativeSyncHandled = true
                        }
                    } catch (nativeEx: Exception) {
                        Log.e("SmsReceiver", "Native direct sync dispatch failed", nativeEx)
                    }

                    // 2. Headless JS Task Service (ONLY fallback if native token is absent)
                    if (!nativeSyncHandled) {
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
                }
            } catch (e: Exception) {
                Log.e("SmsReceiver", "Error processing SMS", e)
            }
        }
    }
}
