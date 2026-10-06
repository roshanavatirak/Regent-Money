package com.anonymous.regentmoney

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

object SmsDirectSyncWorker {
    private const val TAG = "SmsDirectSync"
    private const val ALERT_CHANNEL_ID = "regent_transaction_alerts"
    private val executor = Executors.newFixedThreadPool(2)

    private val httpClient: OkHttpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .writeTimeout(10, TimeUnit.SECONDS)
            .build()
    }

    fun syncSms(context: Context, sender: String, body: String, timestamp: Long) {
        executor.execute {
            try {
                val prefs = context.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
                val token = prefs.getString("auth_access_token", null)
                var backendUrl = prefs.getString("backend_url", "https://regent-money.onrender.com") ?: "https://regent-money.onrender.com"
                if (backendUrl.contains("localhost")) {
                    backendUrl = "https://regent-money.onrender.com"
                }

                if (token.isNullOrBlank()) {
                    Log.w(TAG, "No user auth token found in native storage. Skipping native ingestion.")
                    return@execute
                }

                Log.d(TAG, "Initiating direct native HTTP ingestion for SMS from $sender...")

                val jsonPayload = JSONObject().apply {
                    put("sender", sender)
                    put("body", body)
                    put("timestamp", timestamp)
                }

                val mediaType = "application/json; charset=utf-8".toMediaType()
                val requestBody = jsonPayload.toString().toRequestBody(mediaType)

                val request = Request.Builder()
                    .url("$backendUrl/sync/direct-sms")
                    .addHeader("Authorization", "Bearer $token")
                    .addHeader("Content-Type", "application/json")
                    .post(requestBody)
                    .build()

                val startTime = System.currentTimeMillis()
                val response = httpClient.newCall(request).execute()
                val duration = System.currentTimeMillis() - startTime

                val responseBodyStr = response.body?.string() ?: ""
                Log.d(TAG, "Server responded with HTTP ${response.code} in ${duration}ms: $responseBodyStr")

                if (response.isSuccessful) {
                    val resJson = JSONObject(responseBodyStr)
                    val isIngested = resJson.optBoolean("ingested", false)

                    if (isIngested) {
                        val type = resJson.optString("type", "debit")
                        val amount = resJson.optDouble("amount", 0.0)
                        val bankName = resJson.optString("bankName", "Bank")
                        val suffix = resJson.optString("accountSuffix", "")
                        val updatedBal = resJson.optDouble("updatedBalance", 0.0)

                        showTransactionNotification(
                            context = context,
                            type = type,
                            amount = amount,
                            bankName = bankName,
                            suffix = suffix,
                            updatedBal = updatedBal
                        )
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Direct native sync encountered an error:", e)
            }
        }
    }

    private fun showTransactionNotification(
        context: Context,
        type: String,
        amount: Double,
        bankName: String,
        suffix: String,
        updatedBal: Double
    ) {
        try {
            val notificationManager =
                context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val channel = NotificationChannel(
                    ALERT_CHANNEL_ID,
                    "Transaction Alerts",
                    NotificationManager.IMPORTANCE_DEFAULT
                ).apply {
                    description = "Instant notifications for automatically synced transactions"
                }
                notificationManager.createNotificationChannel(channel)
            }

            val isCredit = type.equals("credit", ignoreCase = true)
            val title = if (isCredit) {
                "₹${String.format("%.2f", amount)} Credited to $bankName"
            } else {
                "₹${String.format("%.2f", amount)} Debited from $bankName"
            }

            val body = if (suffix.isNotBlank()) {
                "A/C ••••$suffix | New Balance: ₹${String.format("%.2f", updatedBal)}"
            } else {
                "New Balance: ₹${String.format("%.2f", updatedBal)}"
            }

            val largeIcon = try {
                BitmapFactory.decodeResource(context.resources, R.drawable.ic_notification_large)
            } catch (e: Exception) {
                null
            }

            val notificationBuilder = NotificationCompat.Builder(context, ALERT_CHANNEL_ID)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(0xFF10B981.toInt())
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(body))
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)

            if (largeIcon != null) {
                notificationBuilder.setLargeIcon(largeIcon)
            }

            val notification = notificationBuilder.build()

            val notificationId = (System.currentTimeMillis() % 100000).toInt()
            notificationManager.notify(notificationId, notification)
        } catch (e: Exception) {
            Log.w(TAG, "Could not post transaction alert notification:", e)
        }
    }
}
