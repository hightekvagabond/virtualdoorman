/**
 * App root.
 *
 * Owns the inactivity timer and the screensaver overlay. Every touch event
 * anywhere in the app is intercepted here to reset the idle countdown.
 *
 * Architecture notes:
 *  - `config` will come from the S3 config-sync hook (config-sync ticket);
 *    until that lands we use CONFIG_DEFAULTS so this compiles and runs.
 *  - The `paused` prop on useInactivityTimer is wired to `false` here;
 *    the capture-flow ticket will pass `true` during active camera use.
 *  - Role-based branching (client tablet vs master phone) lands in the
 *    pairing ticket; the scaffold content stays until then.
 */
import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableWithoutFeedback,
  AppState,
  type AppStateStatus,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Property } from '@virtualdoorman/types';
import { CONFIG_DEFAULTS } from '@virtualdoorman/types';

import './i18n';
import { env } from './config/env';
import { useInactivityTimer } from './hooks/useInactivityTimer';
import { useScreenBrightness } from './hooks/useScreenBrightness';
import { ScreensaverScreen } from './screens/ScreensaverScreen';

// FUTURE: replace with live config from S3 config-sync hook (config-sync ticket).
const FALLBACK_CONFIG = {
  screensaver_text: 'Touch to begin',
  screen_timeout_seconds: CONFIG_DEFAULTS.screen_timeout_seconds,
  screen_brightness: CONFIG_DEFAULTS.screen_brightness,
} as const;

function App(): React.JSX.Element {
  const { t } = useTranslation();

  // FUTURE: replace with live config once config-sync lands.
  const config = FALLBACK_CONFIG;

  // Apply brightness from config; re-applies whenever config syncs.
  useScreenBrightness(config.screen_brightness);

  const handleIdle = useCallback(() => {
    // useInactivityTimer sets isIdle=true; no additional action needed here.
    // FUTURE: hook for analytics / HA integration stub.
  }, []);

  const handleWake = useCallback(() => {
    // FUTURE: navigate to the start of the capture flow once navigator lands.
  }, []);

  const { onTouch, isIdle } = useInactivityTimer({
    timeoutSeconds: config.screen_timeout_seconds,
    onIdle: handleIdle,
    onWake: handleWake,
    // FUTURE: set to true while camera capture is in progress (capture ticket).
    paused: false,
  });

  // Poll for config on wake from device sleep (AppState foreground transition).
  // FUTURE: call config-sync trigger here once that hook exists.
  React.useEffect(() => {
    const sub = AppState.addEventListener(
      'change',
      (state: AppStateStatus) => {
        if (state === 'active') {
          // FUTURE: trigger immediate config poll (config-sync ticket).
          onTouch(); // reset inactivity timer on device wake
        }
      },
    );
    return () => sub.remove();
  }, [onTouch]);

  // FUTURE: pairing writes the real property here.
  const unpairedProperty: Property = {
    name: 'unpaired',
    display_name: t('property.unpaired'),
    bucket: '',
    prefix: '',
  };

  if (isIdle) {
    return (
      <ScreensaverScreen
        screensaverText={config.screensaver_text}
        onWake={onTouch}
      />
    );
  }

  return (
    <TouchableWithoutFeedback onPress={onTouch} accessible={false}>
      <SafeAreaProvider>
        <SafeAreaView style={styles.screen}>
          <View style={styles.content} testID="scaffold-screen">
            <Text style={styles.title}>{t('app.title')}</Text>
            <Text style={styles.heading}>{t('welcome.heading')}</Text>
            <Text style={styles.body}>{t('welcome.subtitle')}</Text>
            <Text style={styles.meta}>
              {t('welcome.environment', { envName: env.ENV_NAME })}
            </Text>
            <Text style={styles.meta}>{unpairedProperty.display_name}</Text>
          </View>
        </SafeAreaView>
      </SafeAreaProvider>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 16,
  },
  heading: {
    fontSize: 24,
    marginBottom: 8,
  },
  body: {
    fontSize: 16,
    textAlign: 'center',
  },
  meta: {
    fontSize: 12,
    marginTop: 12,
    opacity: 0.6,
  },
});

export default App;
