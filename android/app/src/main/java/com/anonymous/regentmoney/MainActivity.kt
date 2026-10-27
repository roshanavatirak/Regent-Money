package com.anonymous.regentmoney

import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.ViewGroup
import com.anonymous.regentmoney.intro.IntroView
import java.lang.ref.WeakReference

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  private var introOverlay: IntroView? = null
  private var isReactNativeReady = false

  companion object {
    private var currentActivity: WeakReference<MainActivity>? = null

    fun onReactNativeReady() {
      currentActivity?.get()?.let { activity ->
        activity.runOnUiThread {
          activity.handleReactNativeReady()
        }
      }
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    currentActivity = WeakReference(this)
    // Set the theme to AppTheme BEFORE onCreate to support
    // coloring the background, status bar, and navigation bar.
    setTheme(R.style.AppTheme)
    super.onCreate(null)

    // Remove default Android 12+ splash animation immediately so custom animation plays seamlessly
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      splashScreen.setOnExitAnimationListener { splashScreenView ->
        splashScreenView.remove()
      }
    }

    // Attach native IntroView directly on top of React Native
    showIntroOverlay()
  }

  private fun showIntroOverlay() {
    val root = findViewById<ViewGroup>(android.R.id.content) ?: return
    val intro = IntroView(this).apply {
      layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
      elevation = 9999f
      isClickable = false
      isFocusable = false
    }
    introOverlay = intro
    root.addView(intro)

    if (isReactNativeReady) {
      intro.notifyAppReady()
    }

    intro.start {
      // Intro finished: React Native is already loaded and rendered underneath!
      introOverlay = null
      root.removeView(intro)
    }

    // Safety Fallback Timeout (9s max to prevent permanently hanging if JS crashes completely)
    root.postDelayed({
      handleReactNativeReady()
    }, 9000L)
  }

  private fun handleReactNativeReady() {
    if (isReactNativeReady) return
    isReactNativeReady = true
    introOverlay?.notifyAppReady()
  }

  override fun onResume() {
    super.onResume()
    introOverlay?.resume()
  }

  override fun onPause() {
    introOverlay?.pause()
    super.onPause()
  }

  override fun onDestroy() {
    if (currentActivity?.get() === this) {
      currentActivity = null
    }
    super.onDestroy()
  }

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "main"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  /**
    * Align the back button behavior with Android S
    * where moving root activities to background instead of finishing activities.
    * @see <a href="https://developer.android.com/reference/android/app/Activity#onBackPressed()">onBackPressed</a>
    */
  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              // For non-root activities, use the default implementation to finish them.
              super.invokeDefaultOnBackPressed()
          }
          return
      }

      // Use the default back button implementation on Android S
      // because it's doing more than [Activity.moveTaskToBack] in fact.
      super.invokeDefaultOnBackPressed()
  }
}
