package com.regentmoney

import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableMap
import com.facebook.react.modules.core.DeviceEventManagerModule

/**
 * Voice entry, on the phone: the speech recogniser that ships with Android turns what the
 * person says into text, with live results while they speak. It costs nothing and needs no
 * server of ours.
 *
 * For voice entry it is only the first choice. Some phones have no recogniser, or it fails;
 * that screen then records the sentence and sends it to the cloud speech services instead.
 * startOnDevice() is the strict variant used by the Regent chat mic: on-device only, no fallback.
 *
 * Events sent to JS (all carry `session`, the number start() was given):
 *   voiceReady    the mic is open
 *   voicePartial  { text }            words so far
 *   voiceLevel    { level }           loudness, 0..1
 *   voiceFinal    { text, confidence, alternatives }
 *   voiceError    { code, reason }    see reasonFor()
 */
class VoiceRecognizerModule(reactContext: ReactApplicationContext) : ReactContextBaseJavaModule(reactContext) {

    private val main = Handler(Looper.getMainLooper())
    private var recognizer: SpeechRecognizer? = null
    private var session = 0
    /** One result or one error per session, never both, never twice. */
    private var settled = true
    /** The request of the current startOnDevice() session; null for start(). */
    private var onDeviceIntent: Intent? = null

    override fun getName(): String = "VoiceRecognizer"

    private fun emit(event: String, body: WritableMap) {
        try {
            reactApplicationContext
                .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
                .emit(event, body)
        } catch (_: Exception) {
            // The JS side is gone (app closing): nothing to tell
        }
    }

    private fun payload(id: Int): WritableMap = Arguments.createMap().apply { putInt("session", id) }

    /** True when this phone has a speech recogniser the app can use. */
    @ReactMethod
    fun isAvailable(promise: Promise) {
        try {
            promise.resolve(SpeechRecognizer.isRecognitionAvailable(reactApplicationContext))
        } catch (_: Exception) {
            promise.resolve(false)
        }
    }

    /** Opens the mic and starts recognising. `language` is a tag such as "hi-IN" or "en-IN". */
    @ReactMethod
    fun start(language: String, sessionId: Int, promise: Promise) {
        main.post {
            try {
                destroyRecognizer()
                if (!SpeechRecognizer.isRecognitionAvailable(reactApplicationContext)) {
                    promise.resolve(false)
                    return@post
                }
                session = sessionId
                settled = false
                onDeviceIntent = null
                val sr = SpeechRecognizer.createSpeechRecognizer(reactApplicationContext)
                recognizer = sr
                sr.setRecognitionListener(listenerFor(sessionId))

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactApplicationContext.packageName)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3)
                    // Hints only: recognisers are free to ignore them
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L)
                }
                sr.startListening(intent)
                promise.resolve(true)
            } catch (_: Exception) {
                destroyRecognizer()
                promise.resolve(false)
            }
        }
    }

    /**
     * On-device only: the audio never leaves the phone, and there is no fallback of any kind.
     * Uses Android's on-device recogniser (Android 12+). Resolves to:
     *   "started"      listening; events follow as for start()
     *   "unavailable"  this phone has no on-device recogniser (older Android, or none installed)
     *   "failed"       it exists but could not start
     * `language` may be "" to use the phone's own language.
     */
    @ReactMethod
    fun startOnDevice(language: String, sessionId: Int, promise: Promise) {
        main.post {
            try {
                destroyRecognizer()
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S ||
                    !SpeechRecognizer.isOnDeviceRecognitionAvailable(reactApplicationContext)
                ) {
                    promise.resolve("unavailable")
                    return@post
                }
                session = sessionId
                settled = false
                val sr = SpeechRecognizer.createOnDeviceSpeechRecognizer(reactApplicationContext)
                recognizer = sr
                sr.setRecognitionListener(listenerFor(sessionId))

                val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
                    putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                    if (language.isNotBlank()) {
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
                        putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
                    }
                    putExtra(RecognizerIntent.EXTRA_PREFER_OFFLINE, true)
                    putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, reactApplicationContext.packageName)
                    putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
                    putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 2500L)
                    putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 2000L)
                }
                onDeviceIntent = intent
                sr.startListening(intent)
                promise.resolve("started")
            } catch (_: Exception) {
                settled = true
                destroyRecognizer()
                promise.resolve("failed")
            }
        }
    }

    /** The person tapped Done: finish and deliver what was heard. */
    @ReactMethod
    fun stop() {
        main.post {
            try {
                recognizer?.stopListening()
            } catch (_: Exception) {
            }
        }
    }

    /** Throw the session away: no result, no error. */
    @ReactMethod
    fun cancel() {
        main.post {
            settled = true
            destroyRecognizer()
        }
    }

    private fun destroyRecognizer() {
        val sr = recognizer ?: return
        recognizer = null
        try {
            sr.cancel()
        } catch (_: Exception) {
        }
        try {
            sr.destroy()
        } catch (_: Exception) {
        }
    }

    private fun reasonFor(code: Int): String = when (code) {
        SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no_speech"
        SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "permission"
        SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
        SpeechRecognizer.ERROR_AUDIO -> "audio"
        SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "busy"
        // 12 = language not supported, 13 = language pack not downloaded (Android 12+)
        12, 13 -> "language"
        else -> "failed"
    }

    private fun listenerFor(id: Int) = object : RecognitionListener {
        private fun current() = id == session && !settled

        override fun onReadyForSpeech(params: Bundle?) {
            if (current()) emit("voiceReady", payload(id))
        }

        override fun onBeginningOfSpeech() {}

        override fun onRmsChanged(rmsdB: Float) {
            if (!current()) return
            // Reported roughly between -2 and 10 dB
            val level = ((rmsdB + 2f) / 12f).coerceIn(0f, 1f)
            emit("voiceLevel", payload(id).apply { putDouble("level", level.toDouble()) })
        }

        override fun onBufferReceived(buffer: ByteArray?) {}

        override fun onEndOfSpeech() {}

        override fun onError(error: Int) {
            if (!current()) return
            settled = true
            var reason = reasonFor(error)
            // On-device session, language pack missing: ask the system to download it (a model
            // download by Android's speech service; no audio is sent). The person retries after.
            val intent = onDeviceIntent
            if (error == 13 && intent != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                try {
                    recognizer?.triggerModelDownload(intent)
                    reason = "language_downloading"
                } catch (_: Exception) {
                }
            }
            emit("voiceError", payload(id).apply {
                putInt("code", error)
                putString("reason", reason)
            })
            if (reason == "language_downloading") {
                // Give the request time to reach the speech service before letting go
                val sr = recognizer
                recognizer = null
                main.postDelayed({
                    try {
                        sr?.destroy()
                    } catch (_: Exception) {
                    }
                }, 3000L)
            } else {
                destroyRecognizer()
            }
        }

        override fun onResults(results: Bundle?) {
            if (!current()) return
            settled = true
            val texts = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION) ?: arrayListOf()
            val scores = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)
            val best = texts.firstOrNull()?.trim().orEmpty()
            if (best.isEmpty()) {
                emit("voiceError", payload(id).apply {
                    putInt("code", SpeechRecognizer.ERROR_NO_MATCH)
                    putString("reason", "no_speech")
                })
            } else {
                emit("voiceFinal", payload(id).apply {
                    putString("text", best)
                    // -1 when the recogniser gives no score
                    putDouble("confidence", (scores?.firstOrNull() ?: -1f).toDouble())
                    putArray("alternatives", Arguments.createArray().apply { texts.drop(1).forEach { pushString(it) } })
                })
            }
            destroyRecognizer()
        }

        override fun onPartialResults(partialResults: Bundle?) {
            if (!current()) return
            val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()?.trim()
            if (!text.isNullOrEmpty()) emit("voicePartial", payload(id).apply { putString("text", text) })
        }

        override fun onEvent(eventType: Int, params: Bundle?) {}
    }

    override fun invalidate() {
        main.post {
            settled = true
            destroyRecognizer()
        }
        super.invalidate()
    }
}
