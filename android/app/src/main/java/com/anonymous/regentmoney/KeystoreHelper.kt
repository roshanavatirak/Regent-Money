package com.anonymous.regentmoney

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object KeystoreHelper {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEK_ALIAS_PREFIX = "regent_hardware_master_key_v"
    private const val KEK_VERSION = 1
    const val CURRENT_KEY_ALIAS = "$KEK_ALIAS_PREFIX$KEK_VERSION"

    private const val AES_GCM_NO_PADDING = "AES/GCM/NoPadding"
    private const val GCM_IV_LENGTH = 12
    private const val GCM_TAG_LENGTH = 128
    private const val PREFIX_V1 = "regent_enc_v1:"

    private var securityLevel: String = "UNKNOWN"
    private var appContext: android.content.Context? = null

    fun init(context: android.content.Context) {
        appContext = context.applicationContext
    }

    fun getSecurityLevel(): String = securityLevel

    private fun generateKey(alias: String, useStrongBox: Boolean): SecretKey {
        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val builder = KeyGenParameterSpec.Builder(
            alias,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .setRandomizedEncryptionRequired(true)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            if (useStrongBox) {
                builder.setIsStrongBoxBacked(true)
            }
            builder.setUnlockedDeviceRequired(true)
        }

        // Bind device KEK to user authentication (Biometric Strong or Device PIN/Pattern)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            builder.setUserAuthenticationParameters(
                300,
                KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
            )
        } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            builder.setUserAuthenticationRequired(true)
            builder.setUserAuthenticationValidityDurationSeconds(300)
        }

        keyGenerator.init(builder.build())
        return keyGenerator.generateKey()
    }

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(CURRENT_KEY_ALIAS)) {
            val entry = keyStore.getEntry(CURRENT_KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (entry != null) {
                return entry.secretKey
            }
        }

        // 1. Try StrongBox first on Android 9+ (API 28+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                val key = generateKey(CURRENT_KEY_ALIAS, useStrongBox = true)
                securityLevel = "STRONGBOX"
                return key
            } catch (e: Exception) {
                // StrongBox unavailable or unsupported on this chipset; fall back to TEE
            }
        }

        // 2. Fall back to standard TEE (Trusted Execution Environment)
        val key = generateKey(CURRENT_KEY_ALIAS, useStrongBox = false)
        securityLevel = "TEE"
        return key
    }

    fun encrypt(plainText: String?): String? {
        if (plainText.isNullOrEmpty()) return null
        return try {
            val key = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(AES_GCM_NO_PADDING)
            cipher.init(Cipher.ENCRYPT_MODE, key)
            val iv = cipher.iv
            val cipherBytes = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
            val combined = ByteArray(iv.size + cipherBytes.size)
            System.arraycopy(iv, 0, combined, 0, iv.size)
            System.arraycopy(cipherBytes, 0, combined, iv.size, cipherBytes.size)
            PREFIX_V1 + Base64.encodeToString(combined, Base64.NO_WRAP)
        } catch (e: KeyPermanentlyInvalidatedException) {
            handleKeyInvalidated()
            null
        } catch (e: Exception) {
            null
        }
    }

    fun decrypt(encryptedText: String?): String? {
        if (encryptedText.isNullOrEmpty()) return null
        if (!encryptedText.startsWith(PREFIX_V1)) {
            return null
        }
        return try {
            val rawBase64 = encryptedText.removePrefix(PREFIX_V1)
            val combined = Base64.decode(rawBase64, Base64.NO_WRAP)
            if (combined.size <= GCM_IV_LENGTH) return null
            val iv = ByteArray(GCM_IV_LENGTH)
            val cipherBytes = ByteArray(combined.size - GCM_IV_LENGTH)
            System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH)
            System.arraycopy(combined, GCM_IV_LENGTH, cipherBytes, 0, cipherBytes.size)

            val key = getOrCreateSecretKey()
            val cipher = Cipher.getInstance(AES_GCM_NO_PADDING)
            val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)
            cipher.init(Cipher.DECRYPT_MODE, key, spec)
            val plainBytes = cipher.doFinal(cipherBytes)
            String(plainBytes, Charsets.UTF_8)
        } catch (e: KeyPermanentlyInvalidatedException) {
            handleKeyInvalidated()
            null
        } catch (e: Exception) {
            null
        }
    }

    private fun handleKeyInvalidated() {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(CURRENT_KEY_ALIAS)) {
                keyStore.deleteEntry(CURRENT_KEY_ALIAS)
            }
        } catch (_: Exception) {}

        // Complete Invalidation Recovery:
        // Delete the wrapped device DEK and local database file so no orphaned, unopenable encrypted store remains.
        appContext?.let { ctx ->
            try {
                ctx.getSharedPreferences("regent_native_prefs", android.content.Context.MODE_PRIVATE)
                    .edit()
                    .remove("device_wrapped_dek")
                    .remove("mmkv_keystore_enc_key")
                    .remove("auth_access_token")
                    .apply()
                // Wipe local SQLCipher database file
                ctx.deleteDatabase("regent_vault.db")
            } catch (_: Exception) {}
        }
    }

    fun getOrCreateMmkvKey(context: android.content.Context): String {
        return try {
            val prefs = context.getSharedPreferences("regent_native_prefs", android.content.Context.MODE_PRIVATE)
            val encryptedKey = prefs.getString("mmkv_keystore_enc_key", null)
            if (!encryptedKey.isNullOrBlank()) {
                val decrypted = decrypt(encryptedKey)
                if (!decrypted.isNullOrBlank()) {
                    return decrypted
                }
            }

            // Generate cryptographically random 256-bit key
            val randomBytes = ByteArray(32)
            java.security.SecureRandom().nextBytes(randomBytes)
            val hexKey = randomBytes.joinToString("") { "%02x".format(it) }

            val newEncrypted = encrypt(hexKey)
            prefs.edit().putString("mmkv_keystore_enc_key", newEncrypted).apply()
            hexKey
        } catch (e: Exception) {
            // Safe fallback if hardware keystore error occurs
            "regent_device_key_" + android.os.Build.FINGERPRINT.hashCode()
        }
    }
}
