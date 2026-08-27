/**
 * ScreensaverScreen
 *
 * Shown when the inactivity timer fires. Displays `screensaver_text` from
 * the remote config on a black background. Any touch resets the timer and
 * returns to the start of the capture flow via `onWake`.
 *
 * `screensaver_text` is admin-authored copy, NOT an i18n key — render as-is.
 */
import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
  StatusBar,
} from 'react-native';

export interface ScreensaverScreenProps {
  /** Admin-configured idle message from config.json. */
  screensaverText: string;
  /** Called when the guest touches the screen to wake the kiosk. */
  onWake: () => void;
}

export function ScreensaverScreen({
  screensaverText,
  onWake,
}: ScreensaverScreenProps): React.JSX.Element {
  return (
    <TouchableWithoutFeedback onPress={onWake} testID="screensaver-touch">
      <View style={styles.container}>
        <StatusBar hidden />
        <Text style={styles.text} testID="screensaver-text">
          {screensaverText}
        </Text>
      </View>
    </TouchableWithoutFeedback>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
  },
  text: {
    color: '#ffffff',
    fontSize: 36,
    fontWeight: '300',
    textAlign: 'center',
    lineHeight: 52,
  },
});
