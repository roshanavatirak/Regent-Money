package com.anonymous.regentmoney

import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.Telephony
import android.telephony.SubscriptionManager
import android.telephony.TelephonyManager
import android.util.Log
import com.facebook.react.bridge.Callback
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.json.JSONArray
import org.json.JSONObject

class SmsModule(private val reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    companion object {
        private const val TAG = "SmsModule"
    }

    override fun getName(): String {
        return "Sms"
    }

    @ReactMethod
    fun getSimPhoneNumbers(promise: Promise) {
        try {
            val numbers = JSONArray()
            val subscriptionManager = reactContext.getSystemService(Context.TELEPHONY_SUBSCRIPTION_SERVICE) as? SubscriptionManager
            if (subscriptionManager != null) {
                val activeList = subscriptionManager.activeSubscriptionInfoList
                if (activeList != null) {
                    for (info in activeList) {
                        var number: String? = null
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                            try {
                                number = subscriptionManager.getPhoneNumber(info.subscriptionId)
                            } catch (_: Exception) {}
                        }
                        if (number.isNullOrBlank()) {
                            try {
                                @Suppress("DEPRECATION")
                                number = info.number
                            } catch (_: Exception) {}
                        }
                        if (number.isNullOrBlank()) {
                            try {
                                val tm = reactContext.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                                val subTm = tm?.createForSubscriptionId(info.subscriptionId)
                                @Suppress("DEPRECATION")
                                number = subTm?.line1Number
                            } catch (_: Exception) {}
                        }
                        if (!number.isNullOrBlank()) {
                            val clean = number.replace(Regex("\\D"), "")
                            if (clean.length >= 10) {
                                numbers.put(clean.takeLast(10))
                            }
                        }
                    }
                }
            }
            Log.d(TAG, "Detected active SIM numbers count: ${numbers.length()}")
            promise.resolve(numbers.toString())
        } catch (e: Exception) {
            Log.w(TAG, "Could not query SIM phone numbers (permission or unsupported): ${e.message}")
            promise.resolve("[]")
        }
    }

    @ReactMethod
    fun list(filterJsonStr: String, errorCallback: Callback, successCallback: Callback) {
        try {
            val filter = if (filterJsonStr.isNotBlank()) JSONObject(filterJsonStr) else JSONObject()
            val minDate = filter.optLong("minDate", 0L)
            val maxCount = filter.optInt("maxCount", 100)

            val uri: Uri = Telephony.Sms.Inbox.CONTENT_URI
            val projection = arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.DATE_SENT
            )

            val selection = if (minDate > 0) "${Telephony.Sms.DATE} >= ? OR ${Telephony.Sms.DATE_SENT} >= ?" else null
            val selectionArgs = if (minDate > 0) arrayOf(minDate.toString(), minDate.toString()) else null
            val sortOrder = "${Telephony.Sms.DATE} DESC"

            val cursor = reactContext.contentResolver.query(
                uri,
                projection,
                selection,
                selectionArgs,
                sortOrder
            )

            val smsList = JSONArray()
            cursor?.use {
                val idIdx = it.getColumnIndex(Telephony.Sms._ID)
                val addressIdx = it.getColumnIndex(Telephony.Sms.ADDRESS)
                val bodyIdx = it.getColumnIndex(Telephony.Sms.BODY)
                val dateIdx = it.getColumnIndex(Telephony.Sms.DATE)
                val dateSentIdx = it.getColumnIndex(Telephony.Sms.DATE_SENT)

                var count = 0
                while (it.moveToNext() && count < maxCount) {
                    val id = if (idIdx != -1) it.getString(idIdx) ?: "" else ""
                    val address = if (addressIdx != -1) it.getString(addressIdx) ?: "" else ""
                    val body = if (bodyIdx != -1) it.getString(bodyIdx) ?: "" else ""
                    val date = if (dateIdx != -1) it.getLong(dateIdx) else 0L
                    val dateSent = if (dateSentIdx != -1) it.getLong(dateSentIdx) else 0L

                    // Prioritize bank dispatch time (dateSent) over device reception time (date)
                    val effectiveDate = if (dateSent > 0L) dateSent else date

                    val msgObj = JSONObject().apply {
                        put("id", id)
                        put("address", address)
                        put("body", body)
                        put("date", effectiveDate)
                        put("dateReceived", date)
                        put("dateSent", dateSent)
                    }
                    smsList.put(msgObj)
                    count++
                }
            }

            Log.d(TAG, "Queried ${smsList.length()} SMS messages from inbox.")
            successCallback.invoke(smsList.length(), smsList.toString())
        } catch (e: Exception) {
            Log.e(TAG, "Error querying SMS inbox", e)
            errorCallback.invoke(e.message ?: "Failed to read SMS inbox")
        }
    }
}
