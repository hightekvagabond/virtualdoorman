package com.virtualdoorman;

import android.app.Activity;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * VDKeepAwakeModule
 *
 * Applies and clears FLAG_KEEP_SCREEN_ON on the current Activity window so
 * the kiosk tablet screen never sleeps while the app is in the foreground.
 *
 * Exposed to JS as NativeModules.VDKeepAwake.
 */
public class VDKeepAwakeModule extends ReactContextBaseJavaModule {

    VDKeepAwakeModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "VDKeepAwake";
    }

    @ReactMethod
    public void activate() {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(() ->
            activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        );
    }

    @ReactMethod
    public void deactivate() {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        activity.runOnUiThread(() ->
            activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        );
    }
}
