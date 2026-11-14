package com.regentmoney

import com.android.installreferrer.api.InstallReferrerClient
import com.android.installreferrer.api.InstallReferrerStateListener
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest
import java.security.MessageDigest
import java.util.concurrent.atomic.AtomicBoolean

/**
 * How this install arrived, for invite and campaign tracking.
 *
 *  - getInstallReferrer: the referrer string Google Play recorded for this install
 *    (which link was opened, or "organic"). It names no person and no device.
 *  - requestIntegrityToken: a Google Play Integrity token bound to one claim, so the server
 *    can confirm the claim came from this real app, installed from Play, on a genuine device.
 *
 * Neither call reads any device identifier, account, contact or message.
 */
class AttributionModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "Attribution"

    /**
     * Resolves { status, referrer, clickAt, installAt }.
     * status: "ok", "unsupported" (no Play Store on this phone) or "unavailable" (try again later).
     */
    @ReactMethod
    fun getInstallReferrer(promise: Promise) {
        val settled = AtomicBoolean(false)
        fun finish(status: String, referrer: String = "", clickAt: Double = 0.0, installAt: Double = 0.0) {
            if (!settled.compareAndSet(false, true)) return
            val map = Arguments.createMap()
            map.putString("status", status)
            map.putString("referrer", referrer)
            map.putDouble("clickAt", clickAt)
            map.putDouble("installAt", installAt)
            promise.resolve(map)
        }

        try {
            val client = InstallReferrerClient.newBuilder(reactApplicationContext).build()
            client.startConnection(object : InstallReferrerStateListener {
                override fun onInstallReferrerSetupFinished(responseCode: Int) {
                    try {
                        when (responseCode) {
                            InstallReferrerClient.InstallReferrerResponse.OK -> {
                                val details = client.installReferrer
                                finish(
                                    "ok",
                                    details.installReferrer ?: "",
                                    details.referrerClickTimestampSeconds.toDouble(),
                                    details.installBeginTimestampSeconds.toDouble()
                                )
                            }
                            InstallReferrerClient.InstallReferrerResponse.FEATURE_NOT_SUPPORTED -> finish("unsupported")
                            else -> finish("unavailable")
                        }
                    } catch (e: Exception) {
                        finish("unavailable")
                    } finally {
                        try { client.endConnection() } catch (_: Exception) {}
                    }
                }

                override fun onInstallReferrerServiceDisconnected() {
                    finish("unavailable")
                }
            })
        } catch (e: Exception) {
            finish("unavailable")
        }
    }

    /**
     * Asks Google Play for an integrity token whose requestHash is SHA-256(payload).
     * The server rebuilds the same payload and compares the hash inside Google's signed
     * verdict, so a token cannot be reused for another account or another referrer.
     */
    @ReactMethod
    fun requestIntegrityToken(cloudProjectNumber: String, payload: String, promise: Promise) {
        try {
            val projectNumber = cloudProjectNumber.toLong()
            val requestHash = MessageDigest.getInstance("SHA-256")
                .digest(payload.toByteArray(Charsets.UTF_8))
                .joinToString("") { "%02x".format(it) }

            IntegrityManagerFactory.createStandard(reactApplicationContext)
                .prepareIntegrityToken(
                    PrepareIntegrityTokenRequest.builder().setCloudProjectNumber(projectNumber).build()
                )
                .addOnSuccessListener { provider ->
                    provider.request(StandardIntegrityTokenRequest.builder().setRequestHash(requestHash).build())
                        .addOnSuccessListener { response -> promise.resolve(response.token()) }
                        .addOnFailureListener { e -> promise.reject("INTEGRITY_ERROR", e.message, e) }
                }
                .addOnFailureListener { e -> promise.reject("INTEGRITY_ERROR", e.message, e) }
        } catch (e: Exception) {
            promise.reject("INTEGRITY_ERROR", e.message, e)
        }
    }
}
