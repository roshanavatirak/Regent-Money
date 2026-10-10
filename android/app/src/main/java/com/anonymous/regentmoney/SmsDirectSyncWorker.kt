package com.anonymous.regentmoney

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.ServiceInfo
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.work.*
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit

class SmsDirectSyncWorker(context: Context, workerParams: WorkerParameters) : Worker(context, workerParams) {

    companion object {
        private const val TAG = "SmsDirectSyncWorker"
        private const val ALERT_CHANNEL_ID = "regent_transaction_alerts"
        const val TAG_SMS_SYNC = "sms-sync"
        const val KEY_SENDER = "sender"
        const val KEY_BODY = "body"
        const val KEY_TIMESTAMP = "timestamp"
        const val KEY_USER_ID = "user_id"

        private val httpClient: OkHttpClient by lazy {
            OkHttpClient.Builder()
                .connectTimeout(15, TimeUnit.SECONDS)
                .readTimeout(15, TimeUnit.SECONDS)
                .writeTimeout(15, TimeUnit.SECONDS)
                .build()
        }

        fun enqueue(context: Context, sender: String, body: String, timestamp: Long) {
            val prefs = context.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            val currentUserId = prefs.getString("user_id", null)
            if (currentUserId.isNullOrBlank()) {
                Log.w(TAG, "No user_id stored; skipping real-time sync (catch-up will handle it upon login).")
                return
            }

            val inputData = Data.Builder()
                .putString(KEY_SENDER, sender)
                .putString(KEY_BODY, body)
                .putLong(KEY_TIMESTAMP, timestamp)
                .putString(KEY_USER_ID, currentUserId)
                .build()

            val constraints = Constraints.Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .build()

            val workRequest = OneTimeWorkRequestBuilder<SmsDirectSyncWorker>()
                .addTag(TAG_SMS_SYNC)
                .setExpedited(OutOfQuotaPolicy.RUN_AS_NON_EXPEDITED_WORK_REQUEST)
                .setConstraints(constraints)
                .setInputData(inputData)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    15,
                    TimeUnit.SECONDS
                )
                .build()

            WorkManager.getInstance(context).enqueue(workRequest)
            Log.d(TAG, "Enqueued expedited WorkManager SMS direct sync request for sender $sender (user: $currentUserId)")
        }
    }

    override fun getForegroundInfo(): ForegroundInfo {
        val channelId = "regent_sync"
        val nm = applicationContext.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "Background sync", NotificationManager.IMPORTANCE_MIN)
            )
        }
        val notification = NotificationCompat.Builder(applicationContext, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("Syncing transaction…")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ForegroundInfo(4201, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
        } else {
            ForegroundInfo(4201, notification)
        }
    }

    override fun doWork(): Result {
        // Cap retry attempts so backoff does not extend endlessly into hours
        if (runAttemptCount >= 6) {
            Log.w(TAG, "Max retry attempts reached ($runAttemptCount). Letting catch-up service handle it later.")
            return Result.failure()
        }

        val sender = inputData.getString(KEY_SENDER) ?: return Result.failure()
        val body = inputData.getString(KEY_BODY) ?: return Result.failure()
        val timestamp = inputData.getLong(KEY_TIMESTAMP, System.currentTimeMillis())

        // Read token and active user at execution time
        val prefs = applicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
        val token = prefs.getString("auth_access_token", null)
        val currentUserId = prefs.getString("user_id", null)
        val enqueuedUserId = inputData.getString(KEY_USER_ID)

        // Fail-closed safety check: require explicit match of active and enqueued user IDs
        if (enqueuedUserId.isNullOrBlank() || currentUserId.isNullOrBlank() || enqueuedUserId != currentUserId) {
            Log.w(TAG, "User mismatch or missing (enqueued: $enqueuedUserId, active: $currentUserId); dropping work to prevent cross-account leak.")
            return Result.failure()
        }

        var backendUrl = prefs.getString("backend_url", "https://regent-money.onrender.com") ?: "https://regent-money.onrender.com"
        if (backendUrl.contains("localhost")) {
            backendUrl = "https://regent-money.onrender.com"
        }

        if (token.isNullOrBlank()) {
            Log.w(TAG, "No user auth token found in native storage. Skipping native ingestion.")
            return Result.failure()
        }

        Log.d(TAG, "Executing direct native HTTP ingestion for SMS from $sender (attempt $runAttemptCount)...")

        try {
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
            Log.d(TAG, "Server responded with HTTP ${response.code} in ${duration}ms")

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
                        context = applicationContext,
                        type = type,
                        amount = amount,
                        bankName = bankName,
                        suffix = suffix,
                        updatedBal = updatedBal
                    )
                }
                return Result.success()
            } else if (response.code in 500..599 || response.code == 429) {
                // Server error (e.g. Render spin-up) or throttler (429) -> retry with exponential backoff
                Log.w(TAG, "Server returned HTTP ${response.code}. Retrying with WorkManager backoff...")
                return Result.retry()
            } else {
                // 4xx client errors (e.g. 401 Unauthorized, 400 Bad Request) -> do not retry infinitely
                Log.e(TAG, "Server rejected sync with HTTP ${response.code}: $responseBodyStr")
                return Result.failure()
            }
        } catch (e: IOException) {
            Log.w(TAG, "Network IO exception (phone offline or connection dropped). Retrying with WorkManager backoff...", e)
            return Result.retry()
        } catch (e: Exception) {
            Log.e(TAG, "Unexpected error during direct native sync:", e)
            return Result.failure()
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
