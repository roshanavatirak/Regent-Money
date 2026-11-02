package com.anonymous.regentmoney

import kotlin.math.abs

/**
 * On-device port of src/services/smsParser.ts. Real-time bank SMS are parsed here so only the
 * extracted transaction fields leave the phone, never the message text.
 *
 * Keep in step with the TypeScript parser: src/services/__fixtures__/sms-parity-cases.json is
 * checked by SmsParserTest, the app's JS tests and the backend tests.
 */
object SmsParser {

    data class ParsedSms(
        val amount: Double,
        val type: String,
        val merchant: String,
        val accountSuffix: String,
        val bankName: String,
        val isSalary: Boolean,
        val availableBalance: Double?,
        val referenceId: String?,
    )

    private val I = RegexOption.IGNORE_CASE

    // JavaScript's \s, so whitespace collapsing (and the smsId hash) matches the JS side exactly
    private val JS_WHITESPACE = Regex("[\\t\\n\\u000B\\f\\r \\u00A0\\u1680\\u2000-\\u200A\\u2028\\u2029\\u202F\\u205F\\u3000\\uFEFF]+")

    private fun collapse(text: String): String = text.replace(JS_WHITESPACE, " ").trim(' ')

    // OTP rule, kept identical in src/services/smsParser.ts and backend/src/sync/sms-parser.util.ts.
    private val OTP_FUTURE_TX = Regex("\\bwill\\s*be\\s*(?:debited|credited|refunded)\\b")
    private val OTP_COMPLETED_TX = Regex("\\b(?:debited|credited|withdrawn|deposited|refunded|spent)\\b")
    private val OTP_DISCLAIMER = Regex("\\b(?:never|do\\s*not|don't|not\\s*to|will\\s*never)\\s+(?:share|disclose|tell|ask|asks|call)\\b[^.]*")
    private val OTP_PHRASE = Regex("\\b(?:is\\s*your\\s*otp|your\\s*otp\\s*is|use\\s*otp|enter\\s*otp|otp\\s*to\\s*verify|otp\\s*for|secret\\s*(?:otp|code)|verification\\s*code\\s*is|is\\s*the\\s*verification\\s*code|one\\s*time\\s*password\\s*is)\\b")
    private val OTP_CODE_AFTER = Regex("\\b(?:otp|one\\s*time\\s*password|verification\\s*code|security\\s*code|authentication\\s*code)\\b[^.]{0,30}?\\b\\d{4,8}\\b")
    private val OTP_CODE_BEFORE = Regex("\\b\\d{4,8}\\b[^.]{0,20}?\\b(?:otp|one\\s*time\\s*password|verification\\s*code)\\b")

    /**
     * True when the SMS carries a one-time password. A completed debit/credit alert that only
     * warns "never share your OTP" is not an OTP; a bank OTP mentioning "txn of Rs 500" is.
     */
    fun isOtpMessage(body: String?): Boolean {
        if (body.isNullOrEmpty()) return false
        val lower = collapse(body).lowercase().replace(OTP_FUTURE_TX, " ")
        if (OTP_COMPLETED_TX.containsMatchIn(lower)) return false
        val text = lower.replace(OTP_DISCLAIMER, " ")
        return OTP_PHRASE.containsMatchIn(text) || OTP_CODE_AFTER.containsMatchIn(text) || OTP_CODE_BEFORE.containsMatchIn(text)
    }

    private val NOT_COMPLETED = Regex("\\b(?:will be credited|will be debited|will be refunded|will be initiated|will be reversed|is scheduled|request has been placed|subject to clearing|declined|failed|unsuccessful|bounced|rejected|cancelled|canceled)\\b", I)
    private val SPAM = Regex("\\b(?:pre-approved\\s*loan|apply\\s*now|claim\\s*your\\s*reward|congratulations!?\\s*you\\s*are\\s*eligible)\\b", I)
    private val CARD_WORD = Regex("\\b(?:credit|debit)\\s*card\\b")
    private val CREDIT_WORDS = Regex("\\b(?:credited|received|refunded|deposited|transferred\\s*from|trf\\s*from|\\bcr\\b|inward\\s*remittance|cashback\\s*received|money\\s*received|added\\s*to\\s*(?:your\\s*)?(?:a\\/c|account))\\b", I)
    private val DEBIT_WORDS = Regex("\\b(?:debited|debit|sent|paid|spent|withdrawn|used\\s*for|used\\s*at|purchase\\s*of|transferred\\s*to|trf\\s*to|\\bdr\\b|txn\\s*of|transaction\\s*of|transaction\\s*on|txn\\s*on|done\\s*at|done\\s*on|done\\s*for|charged|payment\\s*of|payment\\s*to|vpa\\s*debited|deducted|auto-debit|auto-debited|money\\s*sent)\\b", I)
    private val BALANCE = Regex("(?:avl\\s*bal(?:ance)?|available\\s*balance|avail\\s*bal|clear\\s*bal|total\\s*bal|closing\\s*bal|ledger\\s*bal|\\bbal(?:ance)?\\s*(?:is)?)\\s*[:\\-]?\\s*(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)", I)
    private val BALANCE_MASK = Regex("(?:avl\\s*bal|available\\s*balance|avail\\s*bal|bal|balance|clear\\s*bal|total\\s*bal|closing\\s*bal|ledger\\s*bal|limit)[:\\s]*(?:rs\\.?|inr|₹)?\\s*[\\d,]+(?:\\.\\d{1,2})?", I)
    private val AMOUNT_REGEXES = listOf(
        Regex("(?:debited|credited|paid|sent|withdrawn|spent|used\\s*for|charge|towards|payment\\s*of|txn\\s*of|transaction\\s*of|deducted)\\s*(?:by|for|with|of)?\\s*[:\\-\\s]*(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)", I),
        Regex("(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)", I),
        Regex("(?:debited|credited|deducted)\\s*[:\\-\\s]+([\\d,]+(?:\\.\\d{1,2})?)", I),
        Regex("([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:rs\\.?|inr|₹)", I),
    )
    private val STRONG_CREDIT = Regex("\\b(?:credited|received|deposited|refunded)\\b")
    private val STRONG_DEBIT = Regex("\\b(?:debited|withdrawn|spent|deducted|sent|paid|charged|auto-debited)\\b")
    private val REVERSAL = Regex("\\b(?:refund|refunded|reversed|reversal)\\b")
    private const val BOUNDARY = "(?=(?:[,.]|\\s+from|\\s+to|\\s+ref|\\s+refno|\\s+upi|\\s+on|\\s+dated|\\s+if|\\s+avail|\\s+bal|\\s+not|\\s+has\\b|\\s+was\\b|\\s+credited\\b|\\s+debited\\b|\\s*[-–]|https?:|\\.\\s*|\\binfo:|$))"
    private val MERCHANT_DEBIT = Regex("(?:trf\\s*to|transfer\\s*to|transferred\\s*to|paid\\s*to|sent\\s*to|\\bto\\b|\\bat\\b|towards)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)$BOUNDARY", I)
    // Explicit "from" wins over "by", which often precedes the amount or rail ("by Rs.500", "by NEFT")
    private val MERCHANT_CREDIT_FROM = Regex("(?:transfer\\s*from|trf\\s*from|transferred\\s*from|received\\s*from|\\bfrom\\b)\\s+([A-Za-z0-9\\s&.*-]{2,40}?)$BOUNDARY", I)
    private val MERCHANT_CREDIT_BY = Regex("\\bby\\b\\s+([A-Za-z0-9\\s&.*-]{2,40}?)$BOUNDARY", I)
    private val VPA_TO = Regex("\\bto\\s+(?:vpa\\s+)?([a-z0-9][a-z0-9._-]{1,40})@[a-z0-9.-]{2,}", I)
    private val VPA_FROM = Regex("\\b(?:from|by)\\s+(?:vpa\\s+)?([a-z0-9][a-z0-9._-]{1,40})@[a-z0-9.-]{2,}", I)
    private val VPA_SEPARATORS = Regex("[._-]+")
    private val PAYEE_CREDITED = Regex(";\\s*([A-Za-z][A-Za-z0-9\\s&.*-]{1,40}?)\\s+credited\\b", I)
    private val TO_ACCOUNT = Regex("\\bto\\s+(?:a\\/c|acct|account|ac)\\s*(?:no\\.?\\s*)?[x*.]*(\\d{3,18})\\b", I)
    private val ON_MERCHANT = Regex("\\bon\\s+([A-Za-z][A-Za-z0-9\\s&*-]{1,40}?)(?=\\s*[.,;]|\\s+on\\b|\\s+avl|\\s+avail|\\s+if\\b|$)", I)
    private val HONORIFIC = Regex("^(?:mr|mrs|ms|dr)\\.?\\s+", I)
    private val TIME_START = Regex("^\\d{1,2}:\\d{2}")
    private val DATE_START = Regex("^\\d{1,2}[-/.]\\d{1,2}")
    private val BARE_AMOUNT = Regex("^(?:rs\\.?|inr|₹)?\\s*[\\d,]+(?:\\.\\d+)?$", I)
    private val CURRENCY_START = Regex("^(?:rs\\.?|inr|₹)(?:[\\s\\d.]|$)", I)
    private val RAIL_WORD = Regex("^(?:neft|imps|rtgs|upi|nach|ach|vpa)$", I)
    private val VPA_START = Regex("^vpa\\b", I)
    private val BANK_WORD = Regex("^(?:kotak\\s*bank|sbi|hdfc|icici|axis|pnb|a\\/c|account)$", I)
    private val ACCOUNT_WORDS = Regex("\\b(?:card|bank|a\\/c|acct|account)\\b", I)
    private val YES_BANK_TEXT = Regex("\\b(?:YES\\s*BANK|YESBANK)\\b", I)
    private val REFERENCE = Regex("(?:upi\\s*ref(?:\\s*no\\.?)?|rrn|ref\\s*no\\.?|reference(?:\\s*no\\.?)?|txn\\s*(?:id|no)|imps\\s*ref)\\s*[:\\-]?\\s*([A-Za-z0-9]{8,22})", I)
    // Bare 12-digit UPI RRN: "UPI:432198765432", "(UPI 433398765432)"
    private val UPI_RRN = Regex("\\bupi\\s*[:\\-]?\\s*(\\d{12})\\b", I)

    /** Cleans a merchant candidate, or returns null for dates, amounts, payment rails and account words. */
    private fun usableMerchant(raw: String): String? {
        val r = raw.trim().replace(HONORIFIC, "")
        val rejected = r.length < 2 ||
            TIME_START.containsMatchIn(r) ||
            DATE_START.containsMatchIn(r) ||
            BARE_AMOUNT.matches(r) ||
            CURRENCY_START.containsMatchIn(r) ||
            RAIL_WORD.matches(r) ||
            VPA_START.containsMatchIn(r) ||
            BANK_WORD.matches(r) ||
            ACCOUNT_WORDS.containsMatchIn(r)
        return if (rejected) null else r
    }

    fun parse(sender: String, body: String?): ParsedSms? {
        if (body.isNullOrEmpty()) return null

        val clean = collapse(body)
        val lower = clean.lowercase()

        // 1. Exclude future, scheduled, or reversed transactions
        if (NOT_COMPLETED.containsMatchIn(lower)) return null

        // 2. Exclude OTP messages and marketing spam
        if (isOtpMessage(clean)) return null
        if (SPAM.containsMatchIn(lower)) return null

        // 3. Detect type; mask 'credit card' / 'debit card' so it does not decide the type
        val textWithoutCard = lower.replace(CARD_WORD, "card")
        // Strong verbs decide first. When both appear, the earlier one describes the user's account:
        // "Acct XX6090 debited for Rs 89; NETFLIX credited" is a debit. Refunds/reversals are credits.
        val creditAt = STRONG_CREDIT.find(textWithoutCard)?.range?.first ?: -1
        val debitAt = STRONG_DEBIT.find(textWithoutCard)?.range?.first ?: -1
        val type = when {
            creditAt != -1 && REVERSAL.containsMatchIn(textWithoutCard) -> "credit"
            creditAt != -1 && debitAt != -1 -> if (debitAt < creditAt) "debit" else "credit"
            creditAt != -1 -> "credit"
            debitAt != -1 -> "debit"
            CREDIT_WORDS.containsMatchIn(textWithoutCard) -> "credit"
            DEBIT_WORDS.containsMatchIn(textWithoutCard) -> "debit"
            else -> return null
        }

        // 3.5. Available / closing balance when stated
        var availableBalance: Double? = null
        BALANCE.find(clean)?.groupValues?.get(1)?.let { raw ->
            val bal = raw.replace(",", "").toDoubleOrNull()
            if (bal != null && bal >= 0) availableBalance = bal
        }

        // 4. Amount, with balance figures masked out
        val maskedForBalance = clean.replace(BALANCE_MASK, "[BALANCE_MASK]")
        var amount: Double? = null
        var amountMatchIndex = -1
        for (rx in AMOUNT_REGEXES) {
            val match = rx.find(maskedForBalance) ?: continue
            val value = match.groupValues[1].replace(",", "").toDoubleOrNull()
            if (value != null && value > 0) {
                amount = value
                amountMatchIndex = match.range.first
                break
            }
        }
        if (amount == null) return null

        // 5. Account suffix
        val accountSuffix = extractAccountSuffix(clean)

        // 6. Merchant / counterparty. A refund names the original merchant the way a debit does.
        val isReversal = type == "credit" && REVERSAL.containsMatchIn(textWithoutCard)
        val candidates = when {
            type == "debit" -> listOf(MERCHANT_DEBIT)
            isReversal -> listOf(MERCHANT_DEBIT, MERCHANT_CREDIT_FROM, MERCHANT_CREDIT_BY)
            else -> listOf(MERCHANT_CREDIT_FROM, MERCHANT_CREDIT_BY)
        }

        // A UPI handle is the most precise counterparty: "to VPA swiggy@icici", "from priya.k@ybl"
        var merchant = (if (type == "debit") VPA_TO else VPA_FROM).find(clean)
            ?.let { usableMerchant(it.groupValues[1].replace(VPA_SEPARATORS, " ")) } ?: ""

        // Then the text after the amount, then the whole message
        val scopes = mutableListOf<String>()
        if (amountMatchIndex != -1 && amountMatchIndex < clean.length) scopes.add(clean.substring(amountMatchIndex))
        scopes.add(clean)
        scopeLoop@ for (scope in scopes) {
            if (merchant.isNotEmpty()) break
            for (rx in candidates) {
                val usable = rx.find(scope)?.let { usableMerchant(it.groupValues[1]) }
                if (usable != null) {
                    merchant = usable
                    break@scopeLoop
                }
            }
        }

        // Fallbacks for formats without a "to/at/from" phrase
        if (merchant.isEmpty() && type == "debit") {
            // ICICI: "Acct XX6090 debited for Rs 89.00 on 02-Nov-26; NETFLIX credited"
            merchant = PAYEE_CREDITED.find(clean)?.let { usableMerchant(it.groupValues[1]) } ?: ""
        }
        if (merchant.isEmpty() && type == "debit") {
            // Card spends: "spent using Card XX6090 on 02-Nov-26 on AMAZON PAY IN."
            merchant = ON_MERCHANT.findAll(clean).firstNotNullOfOrNull { usableMerchant(it.groupValues[1]) } ?: ""
        }

        merchant = sanitizeMerchantName(merchant)
        if (merchant.length < 2 && type == "debit") {
            // Account-to-account transfer: "to A/c **9988" -> "Transfer XX9988"
            TO_ACCOUNT.find(clean)?.let { merchant = "Transfer XX${it.groupValues[1].takeLast(4)}" }
        }
        if (merchant.length < 2) merchant = if (type == "debit") "Spends" else "Credits"

        // 7. Bank: sender header first, message text only when the header is unknown
        var bankName = detectBankFromSender(sender) ?: "Bank"
        if (bankName == "Bank") {
            val u = clean.uppercase()
            bankName = when {
                u.contains("SBI") || u.contains("STATE BANK") -> "SBI"
                u.contains("KOTAK") || u.contains("KKBK") -> "Kotak"
                u.contains("HDFC") -> "HDFC"
                u.contains("ICICI") -> "ICICI"
                u.contains("AXIS") -> "Axis"
                u.contains("PNB") || u.contains("PUNJAB") -> "PNB"
                u.contains("BOB") || u.contains("BANK OF BARODA") || u.contains("BARODA") -> "Bank of Baroda"
                u.contains("CANARA") || u.contains("CANBNK") -> "Canara Bank"
                u.contains("UNION BANK") || u.contains("UBISMS") -> "Union Bank"
                u.contains("INDUSIND") -> "IndusInd"
                u.contains("IDFC") -> "IDFC First"
                u.contains("PAYTM") || u.contains("PPBL") -> "Paytm Payments Bank"
                u.contains("FEDERAL") || u.contains("FEDBNK") || u.contains("JUPITER") || u.contains("FIMONEY") || u.contains("EPICFI") -> "Federal Bank"
                u.contains("AUBANK") || u.contains("AU BANK") -> "AU Small Finance"
                u.contains("RBL") -> "RBL Bank"
                YES_BANK_TEXT.containsMatchIn(u) -> "Yes Bank"
                else -> "Bank"
            }
        }

        // 7.5 UPI reference / RRN
        val referenceId = (REFERENCE.find(clean) ?: UPI_RRN.find(clean))?.groupValues?.get(1)?.trim()

        // 8. Salary heuristic
        val isSalary = type == "credit" &&
            (lower.contains("salary") || lower.contains("employer") || lower.contains("stipend") ||
                merchant.lowercase().contains("payroll"))

        return ParsedSms(amount, type, merchant, accountSuffix, bankName, isSalary, availableBalance, referenceId)
    }

    /**
     * Same id the JS catch-up scan and the backend compute, so one SMS seen by both the
     * real-time path and the inbox scan is recognised as the same transaction.
     */
    fun smsId(body: String, referenceId: String?): String =
        if (!referenceId.isNullOrEmpty()) "ref_$referenceId" else contentId(body)

    /** Hash of the message text alone, stable across parser changes; lets the server spot a re-sent SMS. */
    fun contentId(body: String): String {
        var hash = 0
        for (ch in collapse(body)) {
            hash = (hash shl 5) - hash + ch.code
        }
        return "sms_${abs(hash.toLong())}"
    }

    private val SANITIZE_STEPS = listOf(
        Regex("\\b(?:ref|refno|upi\\s*ref|upi|rrn|val|info|trf|ft)\\b.*$", I) to "",
        Regex("on\\s+\\d{2}[-/.]\\d{2}[-/.]\\d{2,4}.*$", I) to "",
        Regex("\\s+(?:thru|through|via)\\s+.*$", I) to "",
        Regex("[^\\w\\s\\-*]") to " ",
        Regex("\\s+") to " ",
    )

    private fun sanitizeMerchantName(name: String): String {
        if (name.isEmpty()) return ""
        var cleaned = name
        for ((rx, replacement) in SANITIZE_STEPS) cleaned = cleaned.replace(rx, replacement)
        cleaned = cleaned.trim()

        val lower = cleaned.lowercase()
        return when {
            lower.contains("zomato") -> "Zomato"
            lower.contains("swiggy") -> "Swiggy"
            lower.contains("blinkit") -> "Blinkit"
            lower.contains("zepto") -> "Zepto"
            lower.contains("uber") -> "Uber"
            lower.contains("ola") -> "Ola"
            lower.contains("rapido") -> "Rapido"
            lower.contains("netflix") -> "Netflix"
            lower.contains("spotify") -> "Spotify"
            lower.contains("hotstar") -> "Disney+ Hotstar"
            lower.contains("amazon") -> "Amazon"
            lower.contains("flipkart") -> "Flipkart"
            lower.contains("jio") -> "Jio Recharge"
            lower.contains("airtel") -> "Airtel Bill"
            lower.contains("starbucks") -> "Starbucks"
            else -> cleaned
        }
    }

    /** Identifies the bank from the DLT sender header (e.g. AD-SBIINB -> SBI). */
    fun detectBankFromSender(sender: String?): String? {
        if (sender.isNullOrEmpty()) return null
        val clean = sender.uppercase().replace(Regex("^[A-Z]{2}-", I), "").replace(Regex("[^A-Z0-9]"), "")
        return when {
            clean.contains("SBI") || clean.contains("SBIN") -> "SBI"
            clean.contains("KOTAK") || clean.contains("KKBK") || clean.contains("KMBLTD") -> "Kotak"
            clean.contains("HDFC") -> "HDFC"
            clean.contains("ICICI") -> "ICICI"
            clean.contains("AXIS") || clean.contains("UTIB") -> "Axis"
            clean.contains("PNB") || clean.contains("PUNB") -> "PNB"
            clean.contains("BOB") || clean.contains("BARB") -> "Bank of Baroda"
            clean.contains("CANARA") || clean.contains("CNRB") || clean.contains("CANBNK") -> "Canara Bank"
            clean.contains("UNION") || clean.contains("UBIN") || clean.contains("UBISMS") -> "Union Bank"
            clean.contains("INDUS") || clean.contains("INDB") -> "IndusInd"
            clean.contains("IDFC") -> "IDFC First"
            clean.contains("PAYTM") || clean.contains("PPBL") -> "Paytm Payments Bank"
            clean.contains("FEDERAL") || clean.contains("FEDBNK") || clean.contains("JUPITER") || clean.contains("FIMONEY") || clean.contains("EPICFI") -> "Federal Bank"
            clean.contains("AUBANK") || clean.contains("AU BANK") -> "AU Small Finance"
            clean.contains("RBL") || clean.contains("RATN") -> "RBL Bank"
            clean.contains("YESB") || clean.contains("YESBNK") -> "Yes Bank"
            clean.contains("BOI") || clean.contains("BOIND") || clean.contains("BKID") -> "Bank of India"
            clean.contains("UCOBNK") || clean.contains("UCBA") -> "UCO Bank"
            clean.contains("IOB") -> "Indian Overseas Bank"
            clean.contains("CENTBK") || clean.contains("CBIN") -> "Central Bank of India"
            clean.contains("INDIBK") || clean.contains("IDIB") -> "Indian Bank"
            else -> null
        }
    }

    private val SUFFIX = Regex("\\b(?:a\\/c|acct|account|ac|card)\\b[^0-9]{0,25}?([xX*.]*)(\\d{3,18})\\b", I)
    private val SUFFIX_BEFORE_VERB = Regex("\\b([xX*.]*)(\\d{4,18})\\s*(?:debited|credited|-credited|-debited)\\b", I)

    /** Account or card suffix; a masked match (X6090, **1234, ...4020) wins over bare digits. */
    fun extractAccountSuffix(cleanText: String): String {
        var candidates = SUFFIX.findAll(cleanText).map { it.groupValues[2].takeLast(4) to it.groupValues[1].isNotEmpty() }.toList()
        if (candidates.isEmpty()) {
            candidates = SUFFIX_BEFORE_VERB.findAll(cleanText).map { it.groupValues[2].takeLast(4) to it.groupValues[1].isNotEmpty() }.toList()
        }
        if (candidates.isEmpty()) return "XXXX"
        return (candidates.firstOrNull { it.second } ?: candidates.first()).first
    }
}
