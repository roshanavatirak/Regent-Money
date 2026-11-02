package com.anonymous.regentmoney.crypto

import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test

class FieldCipherTest {
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

    private val testDek = hexToBytes("0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef")
    private val testUserId = "018f3a2b-c852-789a-bcde-0123456789ab"
    private val fixedNonce = hexToBytes("00112233445566778899aabb")

    private val kEnc = FieldCipher.deriveSubkey(testDek, testUserId, "enc")
    private val kIdx = FieldCipher.deriveSubkey(testDek, testUserId, "idx")

    @Test
    fun testSubkeyDerivationAndBlindIndex() {
        assertEquals(
            "28677cba5ae206594d00017c796a25a39c4ebf83bf3aa83d043a2803f18b005a",
            bytesToHex(kEnc)
        )
        assertEquals(
            "d33d9bef9f9637df90db0dfcc43fbb18685fe002736fb9c67679617cfe9a3e57",
            bytesToHex(kIdx)
        )

        // NFKC and whitespace normalization test
        val idx = FieldCipher.blindIndex(kIdx, "   Swiggy   ")
        assertEquals(
            "cdec3149da943eee0c6fdedb1c1fc4f8c620b3d30771cef29eae22023719fb87",
            bytesToHex(idx)
        )

        // Full-width character test: Ｓｗｉｇｇｙ normalizes to swiggy
        val fullWidthIdx = FieldCipher.blindIndex(kIdx, "Ｓｗｉｇｇｙ")
        assertEquals(bytesToHex(idx), bytesToHex(fullWidthIdx))
    }

    @Test
    fun testVector1Amount() {
        val ctx = FieldContext(
            userId = testUserId,
            table = "transactions",
            column = "amount",
            rowId = "tx_manual_1730000000_abc123",
            rowVersion = 1L
        )

        val pt = FieldCipher.encodeAmount(125050L) // ₹1,250.50
        assertEquals(8, pt.size)

        val env = FieldCipher.encryptFieldWithRng(kEnc, 1, pt, ctx) { fixedNonce }
        assertEquals(44, env.size)
        assertEquals(
            "524d03010000000100112233445566778899aabbc2a3178c3239055e83eddd64b32e21c33c242925f1732828",
            bytesToHex(env)
        )

        val decrypted = FieldCipher.decryptField({ kEnc }, env, ctx)
        assertEquals(125050L, FieldCipher.decodeAmount(decrypted))
    }

    @Test
    fun testVector2Merchant() {
        val ctx = FieldContext(
            userId = testUserId,
            table = "transactions",
            column = "merchant",
            rowId = "018f3a2b-c852-789a-bcde-0123456789ef",
            rowVersion = 2L
        )

        val pt = FieldCipher.padText("Swiggy", 32, 256)
        assertEquals(32, pt.size)

        val env = FieldCipher.encryptFieldWithRng(kEnc, 1, pt, ctx) { fixedNonce }
        assertEquals(68, env.size)
        assertEquals(
            "524d03010000000100112233445566778899aabbc2a544fb5b5f8a5df6c6ef2490de24d4cfc0511c1e22cadf4c9aae7aebf91097acab89d065b69acc1b546be7aef644f6",
            bytesToHex(env)
        )

        val decrypted = FieldCipher.decryptField({ kEnc }, env, ctx)
        assertEquals("Swiggy", FieldCipher.unpadText(decrypted))
    }

    @Test
    fun testVector3Note() {
        val ctx = FieldContext(
            userId = testUserId,
            table = "transactions",
            column = "note",
            rowId = "018f3a2b-c852-789a-bcde-0123456789ef",
            rowVersion = 2L
        )

        val pt = FieldCipher.padText("Team dinner at Indiranagar", 64, 2048)
        assertEquals(64, pt.size)

        val env = FieldCipher.encryptFieldWithRng(kEnc, 1, pt, ctx) { fixedNonce }
        assertEquals(100, env.size)
        assertEquals(
            "524d03010000000100112233445566778899aabbc2b943e95355cd409fa88141e2fe45a0ef893f787750abb12dfdcf08ebf910972b4a46a1c9328d138de96ada05d82a26681828d335379dc78b87e3c76614cd3e324e4c0ceb3a7529d2b6ab4c45e906c1",
            bytesToHex(env)
        )

        val decrypted = FieldCipher.decryptField({ kEnc }, env, ctx)
        assertEquals("Team dinner at Indiranagar", FieldCipher.unpadText(decrypted))
    }

    @Test
    fun testNegativeParserAndTampering() {
        val ctx = FieldContext(
            userId = testUserId,
            table = "transactions",
            column = "amount",
            rowId = "tx_manual_1001",
            rowVersion = 5L
        )
        val validEnv = FieldCipher.encryptField(kEnc, 1, FieldCipher.encodeAmount(50000L), ctx)

        // Envelope shorter than 36 bytes
        assertThrows(IllegalArgumentException::class.java) {
            FieldCipher.decryptField({ kEnc }, validEnv.copyOfRange(0, 35), ctx)
        }

        // Unknown format byte
        val badFormat = validEnv.clone()
        badFormat[2] = 0x04.toByte()
        assertThrows(IllegalArgumentException::class.java) {
            FieldCipher.decryptField({ kEnc }, badFormat, ctx)
        }

        // Unknown algorithm byte
        val badAlg = validEnv.clone()
        badAlg[3] = 0x02.toByte()
        assertThrows(IllegalArgumentException::class.java) {
            FieldCipher.decryptField({ kEnc }, badAlg, ctx)
        }

        // Changed key version byte (e.g. keyVersion 2 instead of 1)
        val changedKeyVer = validEnv.clone()
        changedKeyVer[7] = 0x02.toByte()
        assertThrows(Exception::class.java) {
            FieldCipher.decryptField({ kEnc }, changedKeyVer, ctx)
        }

        // Key version with no DEK
        assertThrows(IllegalArgumentException::class.java) {
            FieldCipher.decryptField({ null }, validEnv, ctx)
        }

        // Bit-flip in ciphertext
        val tamperedCt = validEnv.clone()
        tamperedCt[22] = (tamperedCt[22].toInt() xor 0x01).toByte()
        assertThrows(Exception::class.java) {
            FieldCipher.decryptField({ kEnc }, tamperedCt, ctx)
        }

        // Swapped rowId
        val swappedRowCtx = ctx.copy(rowId = "tx_manual_9999")
        assertThrows(Exception::class.java) {
            FieldCipher.decryptField({ kEnc }, validEnv, swappedRowCtx)
        }

        // Row version rollback
        val rollbackCtx = ctx.copy(rowVersion = 4L)
        assertThrows(Exception::class.java) {
            FieldCipher.decryptField({ kEnc }, validEnv, rollbackCtx)
        }
    }
}
