package com.virtualdoorman.kiosk

import android.app.Activity
import android.app.ActivityManager
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.view.View
import android.view.WindowManager
import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule

@ReactModule(name = KioskModule.NAME)
class KioskModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "KioskModule"
        private var isLocked = false
    }

    override fun getName(): String = NAME

    // -------------------------------------------------------------------------
    // lock()
    // -------------------------------------------------------------------------
    @ReactMethod
    fun lock(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No foreground activity found")
            return
        }

        try {
            // 1. Immersive sticky fullscreen — hide status bar, nav bar, system UI
            activity.runOnUiThread {
                val decorView = activity.window.decorView
                @Suppress("DEPRECATION")
                val flags = (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        or View.SYSTEM_UI_FLAG_FULLSCREEN
                        or View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
                @Suppress("DEPRECATION")
                decorView.systemUiVisibility = flags

                // Keep screen on while locked
                activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }

            // 2. LockTaskMode (Device Owner) or screen-pinning fallback
            if (isDeviceOwner(activity)) {
                // Full LockTaskMode — Back, Home, Recents are all blocked
                activity.startLockTask()
            } else {
                // Screen-pinning fallback for sideloaded installs without DO
                startScreenPinning(activity)
            }

            // 3. Start foreground service to prevent OS kill
            val serviceIntent = Intent(reactContext, KioskForegroundService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                reactContext.startForegroundService(serviceIntent)
            } else {
                reactContext.startService(serviceIntent)
            }

            isLocked = true
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_LOCK_FAILED", e.message, e)
        }
    }

    // -------------------------------------------------------------------------
    // unlock()
    // -------------------------------------------------------------------------
    @ReactMethod
    fun unlock(promise: Promise) {
        val activity = currentActivity
        if (activity == null) {
            promise.reject("E_NO_ACTIVITY", "No foreground activity found")
            return
        }

        try {
            // Stop foreground service
            val serviceIntent = Intent(reactContext, KioskForegroundService::class.java)
            reactContext.stopService(serviceIntent)

            // Restore system UI
            activity.runOnUiThread {
                @Suppress("DEPRECATION")
                activity.window.decorView.systemUiVisibility = View.SYSTEM_UI_FLAG_VISIBLE
                activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
            }

            // Exit LockTaskMode
            if (isDeviceOwner(activity)) {
                activity.stopLockTask()
            }
            // Screen pinning: stopLockTask() in non-DO mode triggers the system
            // "Unpin?" confirmation dialog.
            activity.stopLockTask()

            isLocked = false
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("E_UNLOCK_FAILED", e.message, e)
        }
    }

    // -------------------------------------------------------------------------
    // isLocked(): Promise<Boolean>
    // -------------------------------------------------------------------------
    @ReactMethod
    fun isLocked(promise: Promise) {
        promise.resolve(isLocked)
    }

    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------

    private fun isDeviceOwner(activity: Activity): Boolean {
        val dpm = activity.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager
        return dpm.isDeviceOwnerApp(activity.packageName)
    }

    /**
     * Screen-pinning path (non-Device-Owner / sideload without adb DO setup).
     * Requires the user to have enabled screen-pinning in Android Settings,
     * OR the app can deep-link them there. This is a best-effort fallback.
     */
    private fun startScreenPinning(activity: Activity) {
        val am = activity.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        val tasks = am.appTasks
        if (tasks.isNotEmpty()) {
            tasks[0].setExcludeFromRecents(true)
        }
        // startLockTask() in non-DO mode triggers the system screen-pinning
        // dialog — the user must confirm once, after which the app is pinned.
        activity.startLockTask()
    }
}
