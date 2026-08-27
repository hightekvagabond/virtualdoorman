package com.virtualdoorman;

import android.app.Activity;
import android.view.WindowManager;

import androidx.annotation.NonNull;

import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReactMethod;

/**
 * VDScreenBrightnessModule
 *
 * Sets the screen brightness (0.0–1.0) on the current Activity window.
 * Called on launch and after each config sync so brightness is always in
 * sync with the admin-configured value without an app restart.
 *
 * Exposed to JS as NativeModules.VDScreenBrightness.
 */
public class VDScreenBrightnessModule extends ReactContextBaseJavaModule {

    VDScreenBrightnessModule(ReactApplicationContext reactContext) {
        super(reactContext);
    }

    @NonNull
    @Override
    public String getName() {
        return "VDScreenBrightness";
    }

    /**
     * @param brightness 0.0 (darkest) – 1.0 (full). Values outside the range
     *                   are clamped by the JS hook before calling here.
     */
    @ReactMethod
    public void setBrightness(float brightness) {
        final Activity activity = getCurrentActivity();
        if (activity == null) return;
        final float clamped = Math.max(0f, Math.min(1f, brightness));
        activity.runOnUiThread(() -> {
            WindowManager.LayoutParams params = activity.getWindow().getAttributes();
            params.screenBrightness = clamped;
            activity.getWindow().setAttributes(params);
        });
    }
}
