package com.anonymous.regentmoney

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

object KeystoreHelper {
    private const val ANDROID_KEYSTORE = "AndroidKeyStore"
    private const val KEY_ALIAS = "regent_hardware_master_key"
    private const val AES_GCM_NO_PADDING = "AES/GCM/NoPadding"
    private const val GCM_IV_LENGTH = 12
    private const val GCM_TAG_LENGTH = 128
    private const val PREFIX_V1 = "regent_enc_v1:"

    private fun getOrCreateSecretKey(): SecretKey {
        val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            val entry = keyStore.getEntry(KEY_ALIAS, null) as? KeyStore.SecretKeyEntry
            if (entry != null) {
                return entry.secretKey
            }
        }

        val keyGenerator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, ANDROID_KEYSTORE)
        val spec = KeyGenParameterSpec.Builder(
            KEY_ALIAS,
            KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
        )
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setKeySize(256)
            .build()

        keyGenerator.init(spec)
        return keyGenerator.generateKey()
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
        } catch (e: Exception) {
            null
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
