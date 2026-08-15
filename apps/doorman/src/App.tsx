/**
 * Scaffold screen.
 *
 * It exists to prove the skeleton works end to end: i18n renders, the shared
 * types package imports across workspaces, and the build-time environment is
 * readable. Real screens land in the capture, pairing and admin tickets.
 */
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { Property } from '@virtualdoorman/types';

import './i18n';
import { env } from './config/env';

// FUTURE: pairing writes the real property here; until then the scaffold
// shows a placeholder so the shared type is exercised at compile time.
const UNPAIRED_PROPERTY: Property = {
  name: 'unpaired',
  display_name: 'Unpaired device',
  bucket: '',
  prefix: '',
};

function App(): React.JSX.Element {
  const { t } = useTranslation();

  // FUTURE: role-based entry branches here — a paired client device boots into
  // the kiosk capture flow, a master device into the admin app (pairing ticket).
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.screen}>
        <View style={styles.content} testID="scaffold-screen">
          <Text style={styles.title}>{t('app.title')}</Text>
          <Text style={styles.heading}>{t('welcome.heading')}</Text>
          <Text style={styles.body}>{t('welcome.subtitle')}</Text>
          <Text style={styles.meta}>
            {t('welcome.environment', { envName: env.ENV_NAME })}
          </Text>
          <Text style={styles.meta}>{UNPAIRED_PROPERTY.display_name}</Text>
        </View>
      </SafeAreaView>
    </SafeAreaProvider>
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
