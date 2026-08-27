package com.virtualdoorman.kiosk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * ReactPackage that exposes [KioskModule] to the React Native bridge.
 *
 * Registered in MainApplication via PackageList (autolink is not available for
 * in-tree modules) — see MainApplication.kt.
 */
class KioskPackage : ReactPackage {
    override fun createNativeModules(context: ReactApplicationContext): List<NativeModule> =
        listOf(KioskModule(context))

    override fun createViewManagers(context: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
