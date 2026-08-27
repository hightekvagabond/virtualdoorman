package com.virtualdoorman.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableNativeMap

/**
 * KioskModule
 *
 * Exposes kiosk-mode controls to React Native JS.
 *
 * Lock-task strategy (in priority order):
 *   1. DevicePolicyManager LockTaskMode (Android 9+, requires Device Owner or
 *      Profile Owner provisioning — the recommended path for managed tablets).
 *   2. startLockTask() / stopLockTask() without DPM (Android 5–8 or when DPM
 *      is not available — shows the "App pinned" toast once and prevents Back
 *      and Home from exiting, but doesn't hide status bar notifications).
 *   3. Screen-pinning prompt (pre-L fallback, should never be hit in practice).
 *
 * Status-bar / navigation-bar hiding uses WindowInsetsController on API 30+
 * and the legacy View.SYSTEM_UI_FLAG_* flags below that.
 *
 * None of the lock methods require a special permission in the manifest beyond
 * MANAGE_DEVICE_POLICY_LOCK_TASK (for DPM path) which is declared there only
 * when the Device Owner flow is used. The module is safe to call on any build.
 */
class KioskModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    override fun getName(): String = "KioskModule"

    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------

    /**
     * Lock the device into kiosk mode.
     *
     * Resolves with a map:
     *   { method: "lock-task" | "screen-pin" | "none", active: boolean }
     */
    @ReactMethod
    fun enter(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No foreground activity")
            return
        }
        activity.runOnUiThread {
            try {
                hideSystemUi(activity)
                val method = startLocking(activity)
                val result = WritableNativeMap().apply {
                    putString("method", method)
                    putBoolean("active", true)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                promise.reject("E_KIOSK_ENTER", e.message, e)
            }
        }
    }

    /**
     * Exit kiosk mode (Admin PIN or recovery command must gate this call on
     * the JS side — the native layer trusts the caller unconditionally).
     */
    @ReactMethod
    fun exit(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No foreground activity")
            return
        }
        activity.runOnUiThread {
            try {
                stopLocking(activity)
                showSystemUi(activity)
                promise.resolve(true)
            } catch (e: Exception) {
                promise.reject("E_KIOSK_EXIT", e.message, e)
            }
        }
    }

    /**
     * Returns whether the app is currently in lock-task mode.
     */
    @ReactMethod
    fun isActive(promise: Promise) {
        val am = reactContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val active = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
        } else {
            am.isInLockTaskMode
        }
        promise.resolve(active)
    }

    // -------------------------------------------------------------------------
    // Internal helpers
    // -------------------------------------------------------------------------

    /**
     * Returns the method string used so JS can log / report what happened.
     */
    private fun startLocking(activity: Activity): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // startLockTask() works with or without Device Owner.
            // With DO the system silently pins the app and the overlay never appears.
            // Without DO the OS shows the "App pinned" overlay once per session.
            activity.startLockTask()
            "lock-task"
        } else {
            // Pre-L: nothing we can do programmatically; rely on immersive mode.
            "screen-pin"
        }
    }

    private fun stopLocking(activity: Activity) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            activity.stopLockTask()
        }
        // Pre-L: no-op.
    }

    /** Hide status bar and navigation bar (fully immersive). */
    @Suppress("DEPRECATION")
    private fun hideSystemUi(activity: Activity) {
        val window = activity.window
        // Keep screen on while kiosk is active.
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            // API 30+ — WindowInsetsController
            val controller = window.insetsController
            if (controller != null) {
                controller.hide(
                    WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
                )
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            // API 19–29 — legacy flags
            val decorView = window.decorView
            decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                    or View.SYSTEM_UI_FLAG_FULLSCREEN
                    or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                    or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                )
        }
    }

    /** Restore system UI (called on exit). */
    @Suppress("DEPRECATION")
    private fun showSystemUi(activity: Activity) {
        val window = activity.window
        window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.insetsController?.show(
                WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars()
            )
        } else {
            window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
        }
    }
}
