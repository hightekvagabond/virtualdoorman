/**
 * ScreensaverScreen
 *
 * Shown when the inactivity timer fires. Displays the admin-configured
 * `screensaver_text` (raw, not an i18n key) on a full-black background.
 *
 * Any touch anywhere on the screen navigates back to the start of the
 * capture flow (never to a mid-flow step).
 *
 * The text is rendered as-is — the README convention: admin-editable copy
 * is not i18n; it comes from config.json.
 */
import React, { useCallback } from 'react';
import {
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';

interface Props {
  /** Admin-configured screensaver copy from config.json. */
  screensaverText: string;
  /**
   * Called when the guest touches the screen.
   * The caller is responsible for navigating back to the start of the capture
   * flow — this component has no routing dependency.
   */
  onWake: () => void;
}

export function ScreensaverScreen({
  screensaverText,
  onWake,
}: Props): React.JSX.Element {
  const handlePress = useCallback(() => {
    onWake();
  }, [onWake]);

  return (
    <TouchableWithoutFeedback onPress={handlePress} testID="screensaver-touch-area">
      <View style={styles.container}>
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
    padding: 32,
  },
  text: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '300',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});
