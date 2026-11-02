package com.anonymous.regentmoney.crypto

import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.nio.charset.StandardCharsets
import java.security.SecureRandom
import java.text.Normalizer
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

data class FieldContext(
    val userId: String,
    val table: String,
    val column: String,
    val rowId: String,
    val rowVersion: Long
)

typealias RandomSource = (Int) -> ByteArray

object FieldCipher {
    const val FORMAT_V3: Byte = 0x03
    const val ALG_AES256GCM: Byte = 0x01
    const val OVERHEAD_BYTES = 36 // 8 header + 12 nonce + 16 auth tag

    const val MERCHANT_BLOCK = 32
    const val MERCHANT_MAX = 256
    const val NOTE_BLOCK = 64
    const val NOTE_MAX = 2048

    fun uuidBytes(uuid: String): ByteArray {
        val clean = uuid.replace("-", "")
        require(clean.length == 32) { "Invalid UUID length: $uuid" }
        val out = ByteArray(16)
        for (i in 0 until 16) {
            val byteStr = clean.substring(i * 2, i * 2 + 2)
            out[i] = byteStr.toInt(16).toByte()
        }
        return out
    }

    fun lp(s: String): ByteArray {
        val b = s.toByteArray(StandardCharsets.UTF_8)
        val out = ByteArray(2 + b.size)
        ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN).putShort(b.size.toShort())
        System.arraycopy(b, 0, out, 2, b.size)
        return out
    }

    fun buildHeader(keyVersion: Int): ByteArray {
        require(keyVersion >= 1) { "Invalid keyVersion: $keyVersion" }
        val h = ByteArray(8)
        h[0] = 0x52.toByte() // 'R'
        h[1] = 0x4D.toByte() // 'M'
        h[2] = FORMAT_V3
        h[3] = ALG_AES256GCM
        ByteBuffer.wrap(h, 4, 4).order(ByteOrder.BIG_ENDIAN).putInt(keyVersion)
        return h
    }

    fun buildAad(h: ByteArray, ctx: FieldContext): ByteArray {
        val rvBytes = ByteArray(8)
        ByteBuffer.wrap(rvBytes).order(ByteOrder.BIG_ENDIAN).putLong(ctx.rowVersion)

        val regentV3 = lp("regent/v3")
        val userBytes = uuidBytes(ctx.userId)
        val tableBytes = lp(ctx.table)
        val colBytes = lp(ctx.column)
        val rowIdBytes = lp(ctx.rowId) // Length-prefixed string for UUIDs & legacy IDs

        val totalLen = h.size + regentV3.size + userBytes.size + tableBytes.size +
                colBytes.size + rowIdBytes.size + rvBytes.size
        val out = ByteArray(totalLen)
        var offset = 0

        fun append(src: ByteArray) {
            System.arraycopy(src, 0, out, offset, src.size)
            offset += src.size
        }

        append(h)
        append(regentV3)
        append(userBytes)
        append(tableBytes)
        append(colBytes)
        append(rowIdBytes)
        append(rvBytes)

        return out
    }

    fun hkdfSha256(ikm: ByteArray, salt: ByteArray?, info: ByteArray, length: Int): ByteArray {
        val actualSalt = if (salt != null && salt.isNotEmpty()) salt else ByteArray(32)
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(actualSalt, "HmacSHA256"))
        val prk = mac.doFinal(ikm)

        var t = ByteArray(0)
        var okm = ByteArray(0)
        var i = 1
        while (okm.size < length) {
            mac.init(SecretKeySpec(prk, "HmacSHA256"))
            mac.update(t)
            mac.update(info)
            mac.update(byteArrayOf(i.toByte()))
            t = mac.doFinal()
            okm += t
            i++
        }
        return okm.copyOf(length)
    }

    fun deriveSubkey(dek: ByteArray, userId: String, purpose: String): ByteArray {
        require(dek.size == 32) { "Invalid DEK length: expected 32 bytes, got ${dek.size}" }
        val info = "regent/v3/$userId/$purpose".toByteArray(StandardCharsets.UTF_8)
        return hkdfSha256(dek, null, info, 32)
    }

    /**
     * Normalises search terms using Unicode NFKC, trim, collapse whitespace, lowercase.
     */
    fun normaliseSearchTerm(s: String): String {
        val nfkc = Normalizer.normalize(s, Normalizer.Form.NFKC)
        return nfkc.trim().lowercase().replace(Regex("\\s+"), " ")
    }

    fun blindIndex(kIdx: ByteArray, term: String): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(kIdx, "HmacSHA256"))
        return mac.doFinal(normaliseSearchTerm(term).toByteArray(StandardCharsets.UTF_8))
    }

    fun encodeAmount(paise: Long): ByteArray {
        val b = ByteArray(8)
        ByteBuffer.wrap(b).order(ByteOrder.BIG_ENDIAN).putLong(paise)
        return b
    }

    fun decodeAmount(b: ByteArray): Long {
        require(b.size == 8) { "Invalid amount buffer length: expected 8 bytes, got ${b.size}" }
        return ByteBuffer.wrap(b).order(ByteOrder.BIG_ENDIAN).long
    }

    fun padText(s: String, block: Int, max: Int): ByteArray {
        val b = s.toByteArray(StandardCharsets.UTF_8)
        val size = Math.ceil((b.size + 2).toDouble() / block).toInt() * block
        if (size > max) throw IllegalArgumentException("field too long")
        val out = ByteArray(size)
        ByteBuffer.wrap(out).order(ByteOrder.BIG_ENDIAN).putShort(b.size.toShort())
        System.arraycopy(b, 0, out, 2, b.size)
        return out
    }

    fun unpadText(b: ByteArray): String {
        require(b.size >= 2) { "Invalid buffer length: too short for length prefix" }
        val len = ByteBuffer.wrap(b).order(ByteOrder.BIG_ENDIAN).short.toInt() and 0xFFFF
        require(len + 2 <= b.size) { "Corrupt padding: length prefix exceeds buffer size" }
        return String(b, 2, len, StandardCharsets.UTF_8)
    }

    /**
     * Production encryption: Nonce is strictly generated by SecureRandom.
     */
    fun encryptField(
        kEnc: ByteArray,
        keyVersion: Int,
        plaintext: ByteArray,
        ctx: FieldContext
    ): ByteArray {
        return encryptFieldWithRng(kEnc, keyVersion, plaintext, ctx) { size ->
            ByteArray(size).also { SecureRandom().nextBytes(it) }
        }
    }

    /**
     * Internal test seam allowing injected RNG for deterministic test vectors.
     */
    fun encryptFieldWithRng(
        kEnc: ByteArray,
        keyVersion: Int,
        plaintext: ByteArray,
        ctx: FieldContext,
        rng: RandomSource
    ): ByteArray {
        require(kEnc.size == 32) { "Invalid encryption key length: expected 32 bytes, got ${kEnc.size}" }
        val h = buildHeader(keyVersion)
        val nonce = rng(12)
        require(nonce.size == 12) { "Invalid nonce length: expected 12 bytes, got ${nonce.size}" }

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, nonce)
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(kEnc, "AES"), spec)
        cipher.updateAAD(buildAad(h, ctx))
        val ctAndTag = cipher.doFinal(plaintext)

        val out = ByteArray(h.size + nonce.size + ctAndTag.size)
        System.arraycopy(h, 0, out, 0, h.size)
        System.arraycopy(nonce, 0, out, h.size, nonce.size)
        System.arraycopy(ctAndTag, 0, out, h.size + nonce.size, ctAndTag.size)
        return out
    }

    fun decryptField(
        getKEnc: (Int) -> ByteArray?,
        env: ByteArray,
        ctx: FieldContext
    ): ByteArray {
        if (env.size < OVERHEAD_BYTES) {
            throw IllegalArgumentException("unsupported envelope: truncated (length ${env.size} < $OVERHEAD_BYTES)")
        }
        if (env[0] != 0x52.toByte() || env[1] != 0x4D.toByte()) {
            throw IllegalArgumentException("unsupported envelope: invalid magic")
        }
        if (env[2] != FORMAT_V3) {
            throw IllegalArgumentException("unsupported envelope: invalid format version")
        }
        if (env[3] != ALG_AES256GCM) {
            throw IllegalArgumentException("unsupported envelope: invalid algorithm")
        }

        val h = env.copyOfRange(0, 8)
        val keyVersion = ByteBuffer.wrap(h, 4, 4).order(ByteOrder.BIG_ENDIAN).int
        val nonce = env.copyOfRange(8, 20)
        val ctAndTag = env.copyOfRange(20, env.size)

        val kEnc = getKEnc(keyVersion) ?: throw IllegalArgumentException("missing DEK for key version $keyVersion")
        require(kEnc.size == 32) { "Invalid key length for key version $keyVersion" }

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        val spec = GCMParameterSpec(128, nonce)
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(kEnc, "AES"), spec)
        cipher.updateAAD(buildAad(h, ctx))
        return cipher.doFinal(ctAndTag)
    }
}
