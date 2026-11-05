package com.regentmoney

import android.content.Context
import androidx.work.WorkManager
import com.regentmoney.crypto.FieldCipher
import com.regentmoney.crypto.FieldContext
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.Promise

class NativeStorageModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    init {
        KeystoreHelper.init(reactContext)
    }

    override fun getName(): String {
        return "NativeStorage"
    }

    override fun getConstants(): MutableMap<String, Any?> {
        val constants = HashMap<String, Any?>()
        try {
            constants["MMKV_KEY"] = KeystoreHelper.getOrCreateMmkvKey(reactApplicationContext)
            constants["SECURITY_LEVEL"] = KeystoreHelper.getSecurityLevel()
        } catch (e: Exception) {
            constants["MMKV_KEY"] = null
            constants["SECURITY_LEVEL"] = "UNKNOWN"
        }
        return constants
    }

    @ReactMethod
    fun getHardwareSecurityLevel(promise: Promise) {
        promise.resolve(KeystoreHelper.getSecurityLevel())
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
    fun notifyAppReady(promise: Promise) {
        try {
            MainActivity.onReactNativeReady()
            promise.resolve(true)
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }

    private fun hexToBytes(hex: String): ByteArray {
        val clean = hex.replace(" ", "")
        val out = ByteArray(clean.length / 2)
        for (i in out.indices) {
            out[i] = clean.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
        return out
    }

    private fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02x".format(it) }
    }

    @ReactMethod
    fun encryptVaultData(plainText: String, promise: Promise) {
        try {
            val enc = KeystoreHelper.encrypt(plainText)
                ?: throw IllegalStateException("Hardware keystore encryption failed")
            promise.resolve(enc)
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun decryptVaultData(encryptedText: String, promise: Promise) {
        try {
            val dec = KeystoreHelper.decrypt(encryptedText)
                ?: throw IllegalStateException("Hardware keystore decryption failed or tampering detected")
            promise.resolve(dec)
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getOrCreateDeviceDek(promise: Promise) {
        try {
            // Never replaces a DEK that exists but cannot be unwrapped right now: that would
            // make every field encrypted with it unreadable
            promise.resolve(KeystoreHelper.getOrCreateWrappedSecret(reactApplicationContext, "device_wrapped_dek"))
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun encryptFieldV3(
        keyVersion: Int,
        dekHex: String,
        userId: String,
        table: String,
        column: String,
        rowId: String,
        rowVersion: Double,
        plaintextHex: String,
        promise: Promise
    ) {
        try {
            val dek = hexToBytes(dekHex)
            val pt = hexToBytes(plaintextHex)
            val kEnc = FieldCipher.deriveSubkey(dek, userId, "enc")
            val ctx = FieldContext(userId, table, column, rowId, rowVersion.toLong())
            val env = FieldCipher.encryptField(kEnc, keyVersion, pt, ctx)
            promise.resolve(bytesToHex(env))
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun decryptFieldV3(
        dekHex: String,
        userId: String,
        table: String,
        column: String,
        rowId: String,
        rowVersion: Double,
        envHex: String,
        promise: Promise
    ) {
        try {
            val dek = hexToBytes(dekHex)
            val env = hexToBytes(envHex)
            val kEnc = FieldCipher.deriveSubkey(dek, userId, "enc")
            val ctx = FieldContext(userId, table, column, rowId, rowVersion.toLong())
            val pt = FieldCipher.decryptField({ kEnc }, env, ctx)
            promise.resolve(bytesToHex(pt))
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun computeBlindIndexV3(
        dekHex: String,
        userId: String,
        term: String,
        promise: Promise
    ) {
        try {
            val dek = hexToBytes(dekHex)
            val kIdx = FieldCipher.deriveSubkey(dek, userId, "idx")
            val idx = FieldCipher.blindIndex(kIdx, term)
            promise.resolve(bytesToHex(idx))
        } catch (e: Exception) {
            promise.reject("CRYPTO_ERROR", e.message, e)
        }
    }
}
