import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  BackHandler,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../store';
import { UpdateInfo, updateService } from '../services/updateService';

interface UpdateModalProps {
  updateInfo: UpdateInfo | null;
  visible: boolean;
  onDismiss?: () => void;
}

export const UpdateModal: React.FC<UpdateModalProps> = ({
  updateInfo,
  visible,
  onDismiss,
}) => {
  const { colors, isDark } = useTheme();
  const [downloadState, setDownloadState] = useState<'idle' | 'downloading' | 'ready_to_install' | 'failed'>('idle');
  const [downloadedFileUri, setDownloadedFileUri] = useState<string | null>(null);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [loadedMB, setLoadedMB] = useState('0');
  const [totalMB, setTotalMB] = useState('...');
  const [statusMessage, setStatusMessage] = useState('Downloading update...');

  // Block Android hardware back button if update is mandatory
  useEffect(() => {
    if (!visible || !updateInfo?.forceUpdate) return;

    const backSubscription = BackHandler.addEventListener('hardwareBackPress', () => {
      // Prevent going back
      return true;
    });

    return () => backSubscription.remove();
  }, [visible, updateInfo?.forceUpdate]);

  if (!updateInfo || !visible) return null;

  const handleUpdate = async () => {
    setDownloadState('downloading');
    setDownloadProgress(0);
    setStatusMessage('Connecting to download server...');

    try {
      const result = await updateService.downloadAndInstallApk(
        updateInfo.downloadUrl,
        (percent, loaded, total) => {
          setDownloadProgress(percent);
          if (loaded) setLoadedMB(loaded);
          if (total) setTotalMB(total);
          if (percent >= 100) {
            setStatusMessage('Opening package installer...');
          } else {
            setStatusMessage(`Downloading update (${percent}%)...`);
          }
        }
      );

      if (result.success && result.fileUri) {
        setDownloadedFileUri(result.fileUri);
        setDownloadState('ready_to_install');
        if (result.installerLaunched) {
          setStatusMessage('Installer opened! Tap Install Now if dialog was missed.');
        } else {
          setStatusMessage('Download complete! Tap Install Now below.');
        }
      } else {
        setDownloadState('failed');
        setStatusMessage(result.error || 'Download could not complete.');
      }
    } catch (err: any) {
      console.warn('[UpdateModal] Download failed:', err);
      setDownloadState('failed');
      setStatusMessage(err?.message || 'Download encountered an unexpected issue.');
    }
  };

  const handleManualInstall = async () => {
    if (downloadedFileUri) {
      setStatusMessage('Launching package installer...');
      const launched = await updateService.installApk(downloadedFileUri);
      if (!launched) {
        // Fallback to browser if installer cannot launch
        await updateService.startInstall(updateInfo.downloadUrl);
      }
    } else {
      await updateService.startInstall(updateInfo.downloadUrl);
    }
  };

  const handleBrowserFallback = async () => {
    await updateService.startInstall(updateInfo.downloadUrl);
  };

  const isMandatory = updateInfo.forceUpdate;
  const isDownloading = downloadState === 'downloading';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isMandatory && !isDownloading && onDismiss) {
          onDismiss();
        }
      }}
    >
      <View style={styles.backdrop}>
        <View style={[styles.dialogCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {/* Top Accent Strip */}
          <View style={[styles.accentStrip, { backgroundColor: colors.accent }]} />

          {/* Icon Badge & Version Pill */}
          <View style={styles.headerRow}>
            <View style={[styles.iconCircle, { backgroundColor: colors.accentMuted }]}>
              <Ionicons name="sparkles" size={17} color={colors.accent} />
            </View>

            <View style={[styles.versionPill, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#f1f5f9', borderColor: colors.border }]}>
              <Text style={[styles.versionText, { color: colors.accent }]}>
                v{updateInfo.currentVersion}
              </Text>
              <Ionicons name="arrow-forward" size={10} color={colors.textTertiary} style={{ marginHorizontal: 4 }} />
              <Text style={[styles.versionText, { color: colors.text }]}>
                v{updateInfo.latestVersion}
              </Text>
            </View>
          </View>

          {/* Heading */}
          <Text style={[styles.title, { color: colors.text }]}>
            {downloadState === 'ready_to_install'
              ? 'Update Ready to Install'
              : isMandatory
              ? 'Mandatory Update Required'
              : 'New Version Available'}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {downloadState === 'ready_to_install'
              ? 'The update package has been downloaded to your device and is ready to install.'
              : isMandatory
              ? 'Please update Regent Money to the latest release to continue securely using your account.'
              : 'A newer, faster version of Regent Money is ready with performance and UI upgrades.'}
          </Text>

          {/* What's New Section (hide when ready to install to save space) */}
          {downloadState !== 'ready_to_install' && (
            <View style={[styles.notesBox, { backgroundColor: isDark ? 'rgba(0,0,0,0.18)' : '#f8fafc', borderColor: colors.border }]}>
              <View style={styles.notesHeader}>
                <Ionicons name="list-outline" size={12} color={colors.accent} style={{ marginRight: 5 }} />
                <Text style={[styles.notesTitle, { color: colors.textSecondary }]}>WHAT'S NEW</Text>
              </View>

              {updateInfo.releaseNotes.map((note, idx) => (
                <View key={idx} style={styles.noteItem}>
                  <Ionicons name="checkmark-circle-outline" size={13} color={colors.accent} style={{ marginRight: 6, marginTop: 1 }} />
                  <Text style={[styles.noteText, { color: colors.text }]}>{note}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Live Download Progress Box */}
          {isDownloading && (
            <View style={[styles.downloadBox, { backgroundColor: isDark ? 'rgba(255,255,255,0.04)' : '#f1f5f9', borderColor: colors.border }]}>
              <View style={styles.downloadMetaRow}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={colors.accent} style={{ marginRight: 6 }} />
                  <Text style={[styles.downloadStatusText, { color: colors.text }]}>{statusMessage}</Text>
                </View>
                <Text style={[styles.downloadPercentText, { color: colors.accent }]}>
                  {downloadProgress}%
                </Text>
              </View>

              {/* Progress Bar Track */}
              <View style={[styles.progressTrack, { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#e2e8f0' }]}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${downloadProgress}%`, backgroundColor: colors.accent },
                  ]}
                />
              </View>

              <View style={styles.downloadSizeRow}>
                <Text style={[styles.downloadSizeText, { color: colors.textSecondary }]}>
                  {loadedMB} MB / {totalMB} MB
                </Text>
                <Text style={[styles.downloadSizeText, { color: colors.textTertiary }]}>
                  Direct in-app install
                </Text>
              </View>
            </View>
          )}

          {/* Ready To Install View */}
          {downloadState === 'ready_to_install' && (
            <View style={[styles.downloadBox, { backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#f0fdf4', borderColor: '#10b981', marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Ionicons name="checkmark-circle" size={18} color="#10b981" style={{ marginRight: 6 }} />
                <Text style={[styles.downloadStatusText, { color: colors.text, fontWeight: '700' }]}>
                  Download 100% Complete
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
                If Android didn't show the install dialog, tap "Install Now" below or open in browser.
              </Text>
            </View>
          )}

          {/* Failed Error View */}
          {downloadState === 'failed' && (
            <View style={[styles.downloadBox, { backgroundColor: isDark ? 'rgba(239, 68, 68, 0.08)' : '#fef2f2', borderColor: '#ef4444', marginBottom: 14 }]}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="alert-circle" size={18} color="#ef4444" style={{ marginRight: 6 }} />
                <Text style={[styles.downloadStatusText, { color: '#ef4444', fontWeight: '700' }]}>
                  Installation Notice
                </Text>
              </View>
              <Text style={{ fontSize: 11, color: colors.textSecondary, lineHeight: 16 }}>
                {statusMessage}
              </Text>
            </View>
          )}

          {/* Security Notice for Forced Updates */}
          {!isDownloading && isMandatory && downloadState !== 'ready_to_install' && (
            <View style={styles.mandatoryNoticeRow}>
              <Ionicons name="shield-checkmark-outline" size={13} color="#f59e0b" style={{ marginRight: 5 }} />
              <Text style={styles.mandatoryNoticeText}>
                Required build for encrypted sync & transaction security.
              </Text>
            </View>
          )}

          {/* Action Buttons */}
          {!isDownloading && (
            <View style={{ marginTop: 4 }}>
              {downloadState === 'ready_to_install' ? (
                <>
                  <TouchableOpacity
                    onPress={handleManualInstall}
                    activeOpacity={0.85}
                    style={[styles.updateBtn, { backgroundColor: colors.accent, marginBottom: 8 }]}
                  >
                    <Ionicons name="checkmark-done-circle-outline" size={17} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.updateBtnText}>Install Now</Text>
                  </TouchableOpacity>

                  <View style={styles.actionRow}>
                    <TouchableOpacity
                      onPress={handleBrowserFallback}
                      activeOpacity={0.7}
                      style={[styles.laterBtn, { borderColor: colors.border }]}
                    >
                      <Ionicons name="globe-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                      <Text style={[styles.laterBtnText, { color: colors.textSecondary }]}>Open in Browser</Text>
                    </TouchableOpacity>

                    {!isMandatory && onDismiss && (
                      <TouchableOpacity
                        onPress={onDismiss}
                        activeOpacity={0.7}
                        style={[styles.laterBtn, { borderColor: colors.border }]}
                      >
                        <Text style={[styles.laterBtnText, { color: colors.textSecondary }]}>Dismiss</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </>
              ) : downloadState === 'failed' ? (
                <View style={styles.actionRow}>
                  <TouchableOpacity
                    onPress={handleUpdate}
                    activeOpacity={0.85}
                    style={[styles.updateBtn, { backgroundColor: colors.accent, flex: 1 }]}
                  >
                    <Ionicons name="refresh-outline" size={15} color="#ffffff" style={{ marginRight: 5 }} />
                    <Text style={styles.updateBtnText}>Retry</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleBrowserFallback}
                    activeOpacity={0.7}
                    style={[styles.laterBtn, { borderColor: colors.border, flex: 1.2 }]}
                  >
                    <Ionicons name="globe-outline" size={13} color={colors.textSecondary} style={{ marginRight: 4 }} />
                    <Text style={[styles.laterBtnText, { color: colors.textSecondary }]}>Browser Download</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.actionRow}>
                  {!isMandatory && onDismiss && (
                    <TouchableOpacity
                      onPress={onDismiss}
                      activeOpacity={0.7}
                      style={[styles.laterBtn, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.laterBtnText, { color: colors.textSecondary }]}>Later</Text>
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handleUpdate}
                    activeOpacity={0.85}
                    style={[
                      styles.updateBtn,
                      { backgroundColor: colors.accent, flex: isMandatory ? 1 : 1.3 },
                    ]}
                  >
                    <Ionicons
                      name="download-outline"
                      size={15}
                      color="#ffffff"
                      style={{ marginRight: 5 }}
                    />
                    <Text style={styles.updateBtnText}>Download & Update</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 22,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 20,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.25,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  accentStrip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  versionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  versionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 11.5,
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 13,
  },
  notesBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 11,
    marginBottom: 14,
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  notesTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  noteItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 2,
  },
  noteText: {
    fontSize: 11.5,
    lineHeight: 16,
    flex: 1,
    fontWeight: '500',
  },
  mandatoryNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  mandatoryNoticeText: {
    fontSize: 10.5,
    color: '#f59e0b',
    fontWeight: '600',
    flex: 1,
  },
  downloadBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginTop: 4,
  },
  downloadMetaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  downloadStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  downloadPercentText: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 6,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  downloadSizeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  downloadSizeText: {
    fontSize: 10.5,
    fontWeight: '500',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  laterBtn: {
    flex: 1,
    paddingVertical: 9.5,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  laterBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
  updateBtn: {
    flexDirection: 'row',
    paddingVertical: 9.5,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  updateBtnText: {
    color: '#ffffff',
    fontSize: 12,
    fontWeight: '700',
  },
});
