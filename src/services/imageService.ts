import * as ImagePicker from 'expo-image-picker';
import { Platform } from 'react-native';

export interface LuxuryAvatarOption {
  id: string;
  name: string;
  url: string;
}

export const LUXURY_PRESET_AVATARS: LuxuryAvatarOption[] = [
  {
    id: 'exec-male',
    name: 'Executive',
    url: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'investor-female',
    name: 'Investor',
    url: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'tech-founder',
    name: 'Founder',
    url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'minimalist',
    name: 'Minimalist',
    url: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'creative',
    name: 'Creative',
    url: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=300&q=80',
  },
  {
    id: 'crypto-pro',
    name: 'Analyst',
    url: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=300&q=80',
  },
];

export const pickImageFromDevice = async (): Promise<string | null> => {
  try {
    if (Platform.OS !== 'web') {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alert('Permission to access photos is needed to upload an avatar.');
        return null;
      }
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
      base64: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    if (asset.base64) {
      return `data:image/jpeg;base64,${asset.base64}`;
    }
    return asset.uri;
  } catch (err: any) {
    console.warn('[ImageService] Failed to pick image:', err?.message || err);
    return null;
  }
};
