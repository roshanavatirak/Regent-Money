import { Alert } from 'react-native';
import { requireOptionalNativeModule } from 'expo';

/** Opens voice entry, or explains the update needed on a build without a recorder. */
export function openVoiceEntry(navigation: { navigate: (name: never) => void }) {
  // An app installed before voice entry existed has no recorder built in
  if (requireOptionalNativeModule('ExpoAudio') && requireOptionalNativeModule('ExpoHaptics')) {
    navigation.navigate('VoiceEntry' as never);
  } else {
    Alert.alert('Update Regent Money', 'Voice entry needs the latest version of the app. Update it from the Play Store to add transactions by speaking.');
  }
}
