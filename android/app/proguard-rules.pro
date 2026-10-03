# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated & worklets
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.worklets.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-mmkv
-keep class com.tencent.mmkv.** { *; }

# @shopify/react-native-skia
-keep class com.shopify.reactnative.skia.** { *; }

# ML Kit Text Recognition
-keep class com.google.mlkit.** { *; }
-keep class com.google.android.gms.vision.** { *; }

# Google Sign-In & Keychain
-keep class com.reactnativegooglesignin.** { *; }
-keep class com.oblador.keychain.** { *; }

# Gesture Handler, Screens & Nitro
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.margelo.nitro.** { *; }
-keep class fr.greweb.reactnativeviewshot.** { *; }
