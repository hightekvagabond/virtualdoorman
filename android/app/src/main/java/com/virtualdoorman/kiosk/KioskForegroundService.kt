package com.virtualdoorman.kiosk

import android.app.*
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.virtualdoorman.R

/**
 * KioskForegroundService
 *
 * Keeps the VirtualDoorman process alive while kiosk mode is active.
 * Android will not kill a process that holds a foreground service
 * notification, which prevents the OS from evicting the kiosk app
 * under memory pressure.
 *
 * The notification is intentionally minimal and silent — it appears in
 * the notification shade, but LockTaskMode / IMMERSIVE_STICKY prevents
 * guests from pulling the shade down.
 *
 * Lifecycle:
 *   Started  → KioskModule.lock()
 *   Stopped  → KioskModule.unlock()
 *   Restarted automatically on eviction via START_STICKY.
 */
class KioskForegroundService : Service() {

    companion object {
        private const val CHANNEL_ID     = "kiosk_lock_channel"
        private const val CHANNEL_NAME   = "Kiosk Mode"
        private const val NOTIFICATION_ID = 1001
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // START_STICKY: if the OS kills this service, restart it immediately
        // with a null intent so the notification is re-posted.
        return START_STICKY
    }

    override fun onDestroy() {
        stopForeground(true)
        super.onDestroy()
    }

    // -------------------------------------------------------------------------
    // Private helpers
    // -------------------------------------------------------------------------

    private fun buildNotification(): Notification =
        NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Virtual Doorman — Kiosk Active")
            .setContentText("Tablet is locked to kiosk mode.")
            .setSmallIcon(R.mipmap.ic_launcher)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setOngoing(true)      // Cannot be swiped away by the guest
            .setAutoCancel(false)
            .build()

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW  // Silent — no heads-up banner
            ).apply {
                description      = "Keeps kiosk mode active"
                setShowBadge(false)
                lockscreenVisibility = Notification.VISIBILITY_SECRET
            }
            val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
            nm.createNotificationChannel(channel)
        }
    }
}
