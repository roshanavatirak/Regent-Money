// src/navigation/UpdateModal.tsx
//
// Required update: full screen, can't be dismissed.
// Optional update: bottom sheet with "Later".
// The download progress fills the main button itself.
// Release notes come from the server (see updateService); nothing is hard-coded here.

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, Modal, Pressable, BackHandler, Image, ActivityIndicator, ScrollView, Platform } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, Easing, FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { useTheme } from '../store';
import { UpdateInfo, updateService } from '../services/updateService';

const FOREST = '#0B3D2C';
const LIME = '#B8F36B';
const APP_LOGO = require('../../assets/appicon.png');

type DownloadState = 'idle' | 'downloading' | 'ready' | 'failed';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  visible: boolean;
  onDismiss?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({ updateInfo, visible, onDismiss }) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const [state, setState] = useState<DownloadState>('idle');
  const [percent, setPercent] = useState(0);
  const [loadedMB, setLoadedMB] = useState('0');
  const [totalMB, setTotalMB] = useState('');
  const [fileUri, setFileUri] = useState<string | null>(null);
  const [errorText, setErrorText] = useState('');

  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withTiming(state === 'ready' ? 1 : percent / 100, { duration: 300, easing: Easing.out(Easing.cubic) });
  }, [percent, state]);
  const fillStyle = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));

  const isMandatory = !!updateInfo?.forceUpdate;

  // Block the Android back button for required updates
  useEffect(() => {
    if (!visible || !isMandatory) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [visible, isMandatory]);

  if (!updateInfo || !visible) return null;

  const notes = updateInfo.releaseNotes || [];

  const startDownload = async () => {
    setState('downloading');
    setPercent(0);
    setErrorText('');
    try {
      const result = await updateService.downloadAndInstallApk(updateInfo.downloadUrl, (p, loaded, total) => {
        setPercent(p);
        if (loaded) setLoadedMB(loaded);
        if (total && total !== '...') setTotalMB(total);
      });
      if (result.success && result.fileUri) {
        setFileUri(result.fileUri);
        setState('ready');
      } else {
        setState('failed');
        setErrorText(result.error || 'The download didn’t finish.');
      }
    } catch (err: any) {
      setState('failed');
      setErrorText(err?.message || 'The download didn’t finish.');
    }
  };

  const install = async () => {
    const launched = fileUri ? await updateService.installApk(fileUri) : false;
    if (!launched) await updateService.startInstall(updateInfo.downloadUrl);
  };

  const openInBrowser = () => updateService.startInstall(updateInfo.downloadUrl);

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const track = isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8';

  /* ---------------- Pieces ---------------- */

  const NotesList = notes.length > 0 && (
    <View>
      {notes.map((n, i) => (
        <Animated.View key={i} entering={FadeInDown.delay(120 + i * 70).duration(320)} style={s.note}>
          <View style={[s.noteDot, { backgroundColor: isDark ? LIME : '#16A34A' }]} />
          <View style={{ flex: 1 }}>
            <Text style={[s.noteTitle, { color: ink }]}>{n.title}</Text>
            {n.detail ? <Text style={[s.noteDetail, { color: muted }]}>{n.detail}</Text> : null}
          </View>
        </Animated.View>
      ))}
    </View>
  );

  const mainLabel =
    state === 'downloading'
      ? `Downloading ${percent}%`
      : state === 'ready'
        ? 'Install update'
        : state === 'failed'
          ? 'Try again'
          : 'Update now';

  const onMain = state === 'ready' ? install : state === 'downloading' ? undefined : startDownload;

  const MainButton = (
    <Pressable
      onPress={onMain}
      disabled={state === 'downloading'}
      style={({ pressed }) => [s.mainBtn, { backgroundColor: state === 'downloading' ? track : accent }, pressed && state !== 'downloading' && { transform: [{ scale: 0.98 }] }]}
      accessibilityRole="button"
      accessibilityLabel={mainLabel}
      accessibilityState={{ busy: state === 'downloading' }}
    >
      {state === 'downloading' && <Animated.View style={[s.mainFill, { backgroundColor: accent }, fillStyle]} />}
      <View style={s.mainContent}>
        {state === 'downloading' ? (
          <ActivityIndicator size="small" color={accentFg} />
        ) : (
          <Feather name={state === 'ready' ? 'check-circle' : state === 'failed' ? 'refresh-cw' : 'download'} size={18} color={accentFg} />
        )}
        <Text style={[s.mainText, { color: accentFg }]}>{mainLabel}</Text>
      </View>
      {state === 'downloading' && totalMB ? (
        <Text style={[s.mainSize, { color: percent > 75 ? accentFg : accent }]}>
          {loadedMB} of {totalMB} MB
        </Text>
      ) : null}
    </Pressable>
  );

  const Footer = (
    <View>
      {state === 'failed' && (
        <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
          <Feather name="alert-circle" size={14} color={isDark ? '#FFA8A8' : '#C92A2A'} />
          <Text style={[s.errorText, { color: isDark ? '#FFA8A8' : '#C92A2A' }]}>{errorText}</Text>
        </Animated.View>
      )}
      {state === 'ready' && (
        <Text style={[s.helper, { color: muted }]}>If the installer didn’t open, tap Install update.</Text>
      )}
      {MainButton}
      {state === 'ready' || state === 'failed' ? (
        <Pressable onPress={openInBrowser} style={s.textBtn} accessibilityRole="button">
          <Text style={[s.textBtnLabel, { color: muted }]}>Download in browser instead</Text>
        </Pressable>
      ) : !isMandatory && state === 'idle' && onDismiss ? (
        <Pressable onPress={onDismiss} style={s.textBtn} accessibilityRole="button">
          <Text style={[s.textBtnLabel, { color: muted }]}>Later</Text>
        </Pressable>
      ) : null}
    </View>
  );

  /* ---------------- Required: full screen ---------------- */

  if (isMandatory) {
    return (
      <Modal visible animationType="fade" statusBarTranslucent onRequestClose={() => {}}>
        <View style={[s.full, { backgroundColor: pageBg, paddingTop: insets.top + 12, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
          <ScrollView contentContainerStyle={s.fullBody} showsVerticalScrollIndicator={false}>
            <Animated.View entering={FadeIn.duration(400)} style={s.hero}>
              <View style={[s.appIconBox, { borderColor: line }]}>
                <Image source={APP_LOGO} style={s.appIconImage} resizeMode="cover" />
              </View>
            </Animated.View>

            <View style={[s.versionChip, { backgroundColor: surface, borderColor: line }]}>
              <Text style={[s.versionOld, { color: muted }]}>{updateInfo.currentVersion}</Text>
              <Feather name="arrow-right" size={12} color={muted} />
              <Text style={[s.versionNew, { color: ink }]}>{updateInfo.latestVersion}</Text>
            </View>

            <Text style={[s.fullTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              {state === 'ready' ? 'Ready to install' : 'Update to continue'}
            </Text>
            <Text style={[s.fullSub, { color: muted }]}>This version is needed to keep your accounts syncing safely.</Text>

            {NotesList ? (
              <View style={[s.notesCard, { backgroundColor: surface, borderColor: line }]}>
                <Text style={[s.notesLabel, { color: muted }]}>What’s new</Text>
                {NotesList}
              </View>
            ) : null}
          </ScrollView>
          {Footer}
        </View>
      </Modal>
    );
  }

  /* ---------------- Optional: bottom sheet ---------------- */

  return (
    <Modal visible transparent animationType="slide" statusBarTranslucent onRequestClose={() => state !== 'downloading' && onDismiss?.()}>
      <View style={s.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={() => state === 'idle' && onDismiss?.()} accessibilityLabel="Close" />
        <View style={[s.sheet, { backgroundColor: surface, paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
          <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
          <View style={s.sheetHead}>
            <View style={[s.sheetIcon, { borderColor: line }]}>
              <Image source={APP_LOGO} style={s.sheetIconImage} resizeMode="cover" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[s.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
                {state === 'ready' ? 'Ready to install' : 'New update ready'}
              </Text>
              <Text style={[s.sheetSub, { color: muted }]}>Version {updateInfo.latestVersion}</Text>
            </View>
          </View>
          {NotesList ? <View style={{ marginTop: 10 }}>{NotesList}</View> : null}
          <View style={{ marginTop: 14 }}>{Footer}</View>
        </View>
      </View>
    </Modal>
  );
};

const s = StyleSheet.create({
  full: { flex: 1, paddingHorizontal: 24 },
  fullBody: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 16 },
  hero: { alignItems: 'center', justifyContent: 'center', marginTop: 8, marginBottom: 4 },
  appIconBox: {
    width: 80,
    height: 80,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
      web: {
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12)',
      } as any,
    }),
  },
  appIconImage: { width: '100%', height: '100%' },
  versionChip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 30, paddingHorizontal: 12, borderRadius: 15, borderWidth: 1, marginTop: 18 },
  versionOld: { fontSize: 13, fontWeight: '600' },
  versionNew: { fontSize: 13, fontWeight: '700' },
  fullTitle: { fontSize: 30, letterSpacing: -0.8, textAlign: 'center', marginTop: 14 },
  fullSub: { fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 8, maxWidth: 300 },
  notesCard: { width: '100%', borderWidth: 1, borderRadius: 22, paddingHorizontal: 18, paddingVertical: 6, marginTop: 26 },
  notesLabel: { fontSize: 12, fontWeight: '700', paddingTop: 10 },

  note: { flexDirection: 'row', gap: 12, paddingVertical: 10 },
  noteDot: { width: 8, height: 8, borderRadius: 4, marginTop: 7 },
  noteTitle: { fontSize: 15, fontWeight: '700' },
  noteDetail: { fontSize: 14, lineHeight: 20, marginTop: 2 },

  mainBtn: { height: 56, borderRadius: 28, overflow: 'hidden', justifyContent: 'center', marginTop: 12 },
  mainFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 28 },
  mainContent: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  mainText: { fontSize: 16, fontWeight: '700' },
  mainSize: { position: 'absolute', right: 22, fontSize: 13, fontWeight: '600' },
  textBtn: { height: 44, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  textBtnLabel: { fontSize: 14, fontWeight: '600' },
  helper: { fontSize: 13, textAlign: 'center' },
  errorRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  errorText: { fontSize: 13, fontWeight: '600', flexShrink: 1 },

  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 18 },
  sheetHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  sheetIcon: { width: 50, height: 50, borderRadius: 14, overflow: 'hidden', borderWidth: 1 },
  sheetIconImage: { width: '100%', height: '100%' },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4 },
  sheetSub: { fontSize: 13, marginTop: 2 },
});