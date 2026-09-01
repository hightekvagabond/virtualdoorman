package com.virtualdoorman.kiosk

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

/**
 * KioskPackage
 *
 * Registers KioskModule with the React Native bridge.
 * Add an instance of this class to the list returned by
 * MainApplication.getPackages():
 *
 *   override fun getPackages(): List<ReactPackage> =
 *       PackageList(this).packages.apply {
 *           add(KioskPackage())
 *       }
 */
class KioskPackage : ReactPackage {

    override fun createNativeModules(
        reactContext: ReactApplicationContext
    ): List<NativeModule> = listOf(KioskModule(reactContext))

    override fun createViewManagers(
        reactContext: ReactApplicationContext
    ): List<ViewManager<*, *>> = emptyList()
}
