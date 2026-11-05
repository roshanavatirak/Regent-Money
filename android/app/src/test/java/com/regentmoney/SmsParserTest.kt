package com.regentmoney

import org.json.JSONObject
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class SmsParserTest {

    // Shared with src/services/smsParser.test.ts and the backend parser spec
    private val cases = JSONObject(
        File("../../src/services/__fixtures__/sms-parity-cases.json").readText()
    ).getJSONArray("cases")

    @Test
    fun matchesTypeScriptParserOnSharedCases() {
        for (i in 0 until cases.length()) {
            val c = cases.getJSONObject(i)
            val sender = c.getString("sender")
            val body = c.getString("body")
            val label = "case $i: $body"

            assertEquals(label, c.getBoolean("otp"), SmsParser.isOtpMessage(body))

            val parsed = SmsParser.parse(sender, body)
            if (c.isNull("expected")) {
                assertNull(label, parsed)
                continue
            }
            val e = c.getJSONObject("expected")
            requireNotNull(parsed) { "$label parsed to null" }
            assertEquals(label, e.getDouble("amount"), parsed.amount, 0.001)
            assertEquals(label, e.getString("type"), parsed.type)
            assertEquals(label, e.getString("merchant"), parsed.merchant)
            assertEquals(label, e.getString("accountSuffix"), parsed.accountSuffix)
            assertEquals(label, e.getString("bankName"), parsed.bankName)
            assertEquals(label, e.getBoolean("isSalary"), parsed.isSalary)
            assertEquals(label, if (e.has("availableBalance")) e.getDouble("availableBalance") else null, parsed.availableBalance)
            assertEquals(label, if (e.has("referenceId")) e.getString("referenceId") else null, parsed.referenceId)
            assertEquals(label, c.getString("smsId"), SmsParser.smsId(body, parsed.referenceId))
            assertEquals(label, c.getString("contentId"), SmsParser.contentId(body))
        }
    }

    @Test
    fun bankOtpMentioningATransactionIsStillAnOtp() {
        assertTrue(SmsParser.isOtpMessage("123456 is your OTP for txn of INR 500.00 at AMAZON on HDFC Bank card XX1234."))
        assertFalse(SmsParser.isOtpMessage("Rs 500 debited from A/c XX1234. Never share your OTP with anyone."))
    }
}
