package com.anonymous.regentmoney

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Build
import android.provider.Telephony
import android.util.Log

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private val OTP_PATTERN = Regex(
            "(?i)\\b(otp|one[ -]?time (password|pin)|verification code|passcode)\\b[^0-9]{0,25}\\d{4,8}"
        )

        private val OTP_PATTERN_REVERSE = Regex(
            "(?i)\\b\\d{4,8}\\b[^0-9]{0,25}\\b(is (your|the) )?(otp|one[ -]?time (password|pin)|verification code)\\b"
        )

        private val DEFAULT_BANK_SENDERS = setOf(
            "HDFCBK", "HDFCBN", "HDFCLT", "HDFCAL", "HDFCCC", "HDFCSM",
            "SBIPSG", "SBIBNK", "SBIUPI", "SBIINB", "ATMSBI", "SBISMS", "CBSSBI",
            "ICICIB", "ICICIT", "ICICIS", "ICICAC", "ICICIC",
            "AXISBK", "AXISBC", "AXISIN", "AXISAL", "AXISMS",
            "KOTAKB", "KOTAKS", "KOTAKN", "KMBLTD",
            "BOBTXN", "BOBSMS", "BOBALT", "BARB",
            "PNBSMS", "PNBALT", "PUNBNK", "PNBTXN",
            "CNRBK", "CANBNK", "CANARA", "CNRSMS",
            "UBININ", "UBISMS", "UNIONB",
            "IDFCFB", "IDFCBK", "IDFCBN",
            "INDBNK", "INDUSB", "INDUSI",
            "YESBNK", "YESB", "YESALT",
            "FEDBNK", "FEDRAL", "INDIBK", "INDIAN",
            "BOIND", "BOISMS", "BOIALT", "CBIN", "CENTBK",
            "IOBCHN", "IOBBNK", "UCOBNK", "RBLBNK", "RBLSMS",
            "PAYTM", "PAYTMB", "AIRTEL", "AIRBNK"
        )

        private fun isAllowedBankSender(context: Context, sender: String): Boolean {
            val prefs = context.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            val allowed = prefs.getStringSet("bank_sender_ids", null) ?: DEFAULT_BANK_SENDERS
            val upperSender = sender.trim().uppercase()
            // Indian DLT headers look like "AX-HDFCBK" or "VM-HDFCBK-S"; take the 6-char core ID
            val parts = upperSender.split("-")
            val core = if (parts.size >= 2) parts[1] else parts[0]
            return core in allowed || upperSender in allowed
        }
    }

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

                    // Strict on-device filtering: drop OTPs and non-bank messages before anything leaves the device
                    if (!isAllowedBankSender(context, sender) || OTP_PATTERN.containsMatchIn(body) || OTP_PATTERN_REVERSE.containsMatchIn(body)) {
                        continue
                    }

                    // NEVER log the body - protects financial privacy and prevents logcat exposure
                    Log.d("SmsReceiver", "Bank SMS received from $sender")

                    // 1. Direct Native Ingestion via WorkManager
                    val prefs = context.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
                    val token = prefs.getString("auth_access_token", null)
                    val userId = prefs.getString("user_id", null)

                    if (!token.isNullOrBlank() && !userId.isNullOrBlank()) {
                        SmsDirectSyncWorker.enqueue(context, sender, body, timestamp)
                    } else {
                        Log.d("SmsReceiver", "No active user session in native storage; skipping background sync. Catch-up will handle upon login.")
                    }
                }
            } catch (e: Exception) {
                Log.e("SmsReceiver", "Error processing SMS", e)
            }
        }
    }
}
