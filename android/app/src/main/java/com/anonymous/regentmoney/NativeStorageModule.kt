package com.anonymous.regentmoney

import android.content.Context
import androidx.work.WorkManager
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class NativeStorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String {
        return "NativeStorage"
    }

    override fun getConstants(): MutableMap<String, Any?> {
        val constants = HashMap<String, Any?>()
        try {
            constants["MMKV_KEY"] = KeystoreHelper.getOrCreateMmkvKey(reactApplicationContext)
        } catch (e: Exception) {
            constants["MMKV_KEY"] = "regent_fallback_key"
        }
        return constants
    }

    @ReactMethod
    fun setAuthCredentials(token: String, backendUrl: String, userId: String?, promise: Promise) {
        try {
            val encryptedToken = KeystoreHelper.encrypt(token)
                ?: throw IllegalStateException("Hardware keystore encryption failed")
            val prefs = reactApplicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            val editor = prefs.edit()
                .putString("auth_access_token", encryptedToken)
                .putString("backend_url", backendUrl)
            if (!userId.isNullOrBlank()) {
                editor.putString("user_id", userId)
            }
            editor.apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun clearAuthCredentials(promise: Promise) {
        try {
            // Cancel all pending SMS sync jobs queued by the logged-out user to prevent uploading into another account
            WorkManager.getInstance(reactApplicationContext).cancelAllWorkByTag(SmsDirectSyncWorker.TAG_SMS_SYNC)

            val prefs = reactApplicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            prefs.edit()
                .remove("auth_access_token")
                .remove("user_id")
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setBankSenderIds(ids: com.facebook.react.bridge.ReadableArray, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            val set = HashSet<String>()
            for (i in 0 until ids.size()) {
                val idStr = ids.getString(i)
                if (!idStr.isNullOrBlank()) {
                    set.add(idStr.trim().uppercase())
                }
            }
            prefs.edit()
                .putStringSet("bank_sender_ids", set)
                .apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun setSmsTrackingDisabled(disabled: Boolean, promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            prefs.edit().putBoolean("sms_tracking_disabled", disabled).apply()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("STORAGE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun isSmsTrackingDisabled(promise: Promise) {
        try {
            val prefs = reactApplicationContext.getSharedPreferences("regent_native_prefs", Context.MODE_PRIVATE)
            val disabled = prefs.getBoolean("sms_tracking_disabled", false)
            promise.resolve(disabled)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
