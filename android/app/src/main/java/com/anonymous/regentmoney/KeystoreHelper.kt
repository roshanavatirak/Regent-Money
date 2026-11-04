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
    private const val LEGACY_KEY_ALIAS = "regent_hardware_master_key"
    private const val KEK_ALIAS_PREFIX = "regent_hardware_master_key_v"
    // v2 drops setUnlockedDeviceRequired so background SMS sync can read the token while the
    // phone is locked. v1 values are still readable and get re-wrapped under v2 on first use.
    private const val KEK_VERSION = 2
    const val CURRENT_KEY_ALIAS = "$KEK_ALIAS_PREFIX$KEK_VERSION"
    private const val PREVIOUS_KEY_ALIAS = "${KEK_ALIAS_PREFIX}1"
    private const val PREFS = "regent_native_prefs"

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
        }

        // Storage master key MUST NOT require interactive biometric authentication at cold boot.
        // Screen-level biometric lock is handled safely by BiometricLockOverlay.

        keyGenerator.init(builder.build())
        return keyGenerator.generateKey()
    }

    private fun getExistingSecretKey(alias: String): SecretKey? {
        return try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(alias)) {
                (keyStore.getEntry(alias, null) as? KeyStore.SecretKeyEntry)?.secretKey
            } else {
                null
            }
        } catch (_: Exception) {
            null
        }
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

    fun decrypt(encryptedText: String?): String? = decryptDetailed(encryptedText)?.first

    /** Returns the plaintext and whether it was wrapped by an older key and should be re-wrapped. */
    private fun decryptDetailed(encryptedText: String?): Pair<String, Boolean>? {
        if (encryptedText.isNullOrEmpty()) return null
        if (!encryptedText.startsWith(PREFIX_V1)) {
            return null
        }
        val rawBase64 = encryptedText.removePrefix(PREFIX_V1)
        val combined = try {
            Base64.decode(rawBase64, Base64.NO_WRAP)
        } catch (_: Exception) {
            return null
        }
        if (combined.size <= GCM_IV_LENGTH) return null
        val iv = ByteArray(GCM_IV_LENGTH)
        val cipherBytes = ByteArray(combined.size - GCM_IV_LENGTH)
        System.arraycopy(combined, 0, iv, 0, GCM_IV_LENGTH)
        System.arraycopy(combined, GCM_IV_LENGTH, cipherBytes, 0, cipherBytes.size)
        val spec = GCMParameterSpec(GCM_TAG_LENGTH, iv)

        // Try the current key first, then older ones (v1 needs the phone unlocked; legacy is pre-1.0.53).
        // GCM's auth tag tells us which key a value was wrapped with.
        for (alias in listOf(CURRENT_KEY_ALIAS, PREVIOUS_KEY_ALIAS, LEGACY_KEY_ALIAS)) {
            val key = getExistingSecretKey(alias) ?: continue
            try {
                val cipher = Cipher.getInstance(AES_GCM_NO_PADDING)
                cipher.init(Cipher.DECRYPT_MODE, key, spec)
                val plain = String(cipher.doFinal(cipherBytes), Charsets.UTF_8)
                return Pair(plain, alias != CURRENT_KEY_ALIAS)
            } catch (e: KeyPermanentlyInvalidatedException) {
                if (alias == CURRENT_KEY_ALIAS) {
                    handleKeyInvalidated()
                    return null
                }
            } catch (_: Exception) {
                // Wrong key or locked device; try the next alias
            }
        }
        return null
    }

    /** True when any wrapping key still exists, i.e. a failed unwrap may be temporary. */
    private fun hasAnyWrappingKey(): Boolean {
        return listOf(CURRENT_KEY_ALIAS, PREVIOUS_KEY_ALIAS, LEGACY_KEY_ALIAS).any { getExistingSecretKey(it) != null }
    }

    /**
     * Reads and unwraps the value stored under [prefKey], re-wrapping it with the current key
     * when it was written under an older one. Returns null when it is missing or cannot be
     * unwrapped right now.
     */
    fun readWrapped(context: android.content.Context, prefKey: String): String? {
        val prefs = context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        val (plain, needsRewrap) = decryptDetailed(prefs.getString(prefKey, null)) ?: return null
        if (needsRewrap) {
            encrypt(plain)?.let { prefs.edit().putString(prefKey, it).apply() }
        }
        return plain
    }

    /**
     * Unwraps the random secret stored under [prefKey], creating one if none exists yet.
     * Throws if a stored secret exists but cannot be unwrapped while its key is still present:
     * replacing it would make everything encrypted with it unreadable for good.
     */
    fun getOrCreateWrappedSecret(context: android.content.Context, prefKey: String): String {
        val prefs = context.getSharedPreferences(PREFS, android.content.Context.MODE_PRIVATE)
        readWrapped(context, prefKey)?.let { if (it.isNotBlank()) return it }
        if (!prefs.getString(prefKey, null).isNullOrBlank() && hasAnyWrappingKey()) {
            throw IllegalStateException("Stored secret could not be unwrapped; keeping it for the next attempt")
        }

        val randomBytes = ByteArray(32)
        java.security.SecureRandom().nextBytes(randomBytes)
        val hex = randomBytes.joinToString("") { "%02x".format(it) }
        val wrapped = encrypt(hex) ?: throw IllegalStateException("Hardware keystore encryption failed")
        prefs.edit().putString(prefKey, wrapped).commit()
        return hex
    }

    private fun handleKeyInvalidated() {
        try {
            val keyStore = KeyStore.getInstance(ANDROID_KEYSTORE).apply { load(null) }
            if (keyStore.containsAlias(CURRENT_KEY_ALIAS)) {
                keyStore.deleteEntry(CURRENT_KEY_ALIAS)
            }
        } catch (_: Exception) {}

        // Invalidation Recovery:
        // Clear stored tokens so the user is safely prompted to sign in and re-download fresh state
        appContext?.let { ctx ->
            try {
                ctx.getSharedPreferences("regent_native_prefs", android.content.Context.MODE_PRIVATE)
                    .edit()
                    .remove("device_wrapped_dek")
                    .remove("auth_access_token")
                    .remove("mmkv_keystore_enc_key")
                    .apply()
                ctx.deleteDatabase("regent_vault.db")
                // The local MMKV store was encrypted with the lost key and can never be read again;
                // drop it so a fresh one is created (data comes back from the cloud on sign-in)
                java.io.File(ctx.filesDir, "mmkv").listFiles()
                    ?.filter { it.name.startsWith("regent-money-settings") }
                    ?.forEach { it.delete() }
            } catch (_: Exception) {}
        }
    }

    /** Null when the key cannot be unwrapped this launch; JS then keeps data in memory only. */
    fun getOrCreateMmkvKey(context: android.content.Context): String? {
        return try {
            getOrCreateWrappedSecret(context, "mmkv_keystore_enc_key")
        } catch (_: Exception) {
            null
        }
    }
}
