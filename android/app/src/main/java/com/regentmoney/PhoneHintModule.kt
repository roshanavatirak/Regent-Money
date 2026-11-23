package com.regentmoney

import android.app.Activity
import android.content.Intent
import com.facebook.react.bridge.ActivityEventListener
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.gms.auth.api.identity.GetPhoneNumberHintIntentRequest
import com.google.android.gms.auth.api.identity.Identity

/**
 * Google's Phone Number Hint (Play services): the "Choose a phone number" sheet that lists the
 * SIM numbers on this phone. The person taps one and Google shares only that number with us.
 * It needs no permission.
 *
 * request() resolves with the number as Google gives it (e.g. "+917972883376"), or null when
 * there is nothing to offer: no number readable from the SIM, the sheet was closed, no Play
 * services, or Google is holding the sheet back after recent dismissals. It never rejects, so
 * the caller just falls back to the keyboard.
 */
class PhoneHintModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext), ActivityEventListener {

    private var pending: Promise? = null

    init {
        reactContext.addActivityEventListener(this)
    }

    override fun getName(): String = "PhoneHint"

    private fun settle(number: String?) {
        val promise = pending ?: return
        pending = null
        promise.resolve(number)
    }

    @ReactMethod
    fun request(promise: Promise) {
        val activity = reactApplicationContext.currentActivity
        if (activity == null || pending != null) {
            promise.resolve(null)
            return
        }
        pending = promise
        try {
            Identity.getSignInClient(activity)
                .getPhoneNumberHintIntent(GetPhoneNumberHintIntentRequest.builder().build())
                .addOnSuccessListener { intent ->
                    try {
                        activity.startIntentSenderForResult(intent.intentSender, REQUEST_CODE, null, 0, 0, 0)
                    } catch (_: Exception) {
                        settle(null)
                    }
                }
                .addOnFailureListener { settle(null) }
        } catch (_: Exception) {
            settle(null)
        }
    }

    override fun onActivityResult(activity: Activity, requestCode: Int, resultCode: Int, data: Intent?) {
        if (requestCode != REQUEST_CODE) return
        if (resultCode != Activity.RESULT_OK || data == null) {
            settle(null)
            return
        }
        try {
            settle(Identity.getSignInClient(activity).getPhoneNumberFromIntent(data))
        } catch (_: Exception) {
            settle(null)
        }
    }

    override fun onNewIntent(intent: Intent) = Unit

    companion object {
        private const val REQUEST_CODE = 7491
    }
}
