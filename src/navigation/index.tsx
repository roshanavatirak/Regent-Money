// Application Navigation & Screen Hierarchy (Clean Bundle)
import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  RefreshControl,
  Modal,
  Image,
  Alert,
  Pressable,
  useWindowDimensions,
  StyleProp,
  ViewStyle,
  AppState,
  AppStateStatus,
} from 'react-native';
import { NavigationContainer, useFocusEffect, createNavigationContainerRef } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';

export const navigationRef = createNavigationContainerRef<any>();
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  withSpring,
  FadeIn
} from 'react-native-reanimated';
import { CartesianChart, Area, PolarChart, Pie, Line } from 'victory-native';
import { Canvas, ImageSVG, useSVG, LinearGradient, vec, Group } from '@shopify/react-native-skia';
import Voice from '@react-native-voice/voice';

import { mmkvStorage } from '../db/mmkv';
import { useSyncDb } from '../services/useSyncDb';
import { GoalsScreen } from './GoalsScreen';
import { UpdateModal } from './UpdateModal';
import { updateService, UpdateInfo } from '../services/updateService';
import bankNamesJson from './banknames.json';

const POPULAR_BANKS = [
  { code: 'SBIN', name: 'State Bank of India', short: 'SBI Bank' },
  { code: 'BARB', name: 'Bank of Baroda', short: 'BOB Bank' },
  { code: 'UBIN', name: 'Union Bank of India', short: 'Union BOI' },
  { code: 'UTIB', name: 'Axis Bank', short: 'Axis Bank' },
  { code: 'IDFB', name: 'IDFC FIRST Bank', short: 'IDFC Bank' },
  { code: 'HDFC', name: 'HDFC Bank', short: 'HDFC Bank' },
  { code: 'KKBK', name: 'Kotak Mahindra Bank', short: 'Kotak Bank' },
  { code: 'ICIC', name: 'ICICI Bank', short: 'ICICI Bank' },
  { code: 'PUNB', name: 'Punjab National Bank', short: 'PNB Bank' },
  { code: 'IDIB', name: 'Indian Bank', short: 'Indian Bank' },
  { code: 'CNRB', name: 'Canara Bank', short: 'Canara Bank' },
  { code: 'BKID', name: 'Bank of India', short: 'Bank of India' },
];

const LOCAL_SVG_MAP: { [key: string]: any } = {
  'BARB': require('../../assets/Banks logo/bob.svg'),
  'BKID': require('../../assets/Banks logo/boi.svg'),
  'CNRB': require('../../assets/Banks logo/cnrb.svg'),
  'HDFC': require('../../assets/Banks logo/hdfc.svg'),
  'ICIC': require('../../assets/Banks logo/icic.svg'),
  'IDFB': require('../../assets/Banks logo/idfc.svg'),
  'IDIB': require('../../assets/Banks logo/idib.svg'),
  'JIOP': require('../../assets/Banks logo/jiop.svg'),
  'KKBK': require('../../assets/Banks logo/kkbk.svg'),
  'MAHB': require('../../assets/Banks logo/mahb.svg'),
  'PUNB': require('../../assets/Banks logo/punb.svg'),
  'SBIN': require('../../assets/Banks logo/sbi.svg'),
  'UBIN': require('../../assets/Banks logo/ubin.svg'),
  'UTIB': require('../../assets/Banks logo/axis.svg'),
  'YESB': require('../../assets/Banks logo/yesb.svg'),
};

const NativeSvgIcon = ({ source, size }: { source: any; size: number }) => {
  const svg = useSVG(source);
  if (!svg) {
    return <View style={{ width: size * 0.75, height: size * 0.75 }} />;
  }

  const targetSize = size * 0.75;
  const svgWidth = svg.width() > 0 ? svg.width() : targetSize;
  const svgHeight = svg.height() > 0 ? svg.height() : targetSize;

  const scale = Math.min(targetSize / svgWidth, targetSize / svgHeight);
  const dx = (targetSize - svgWidth * scale) / 2;
  const dy = (targetSize - svgHeight * scale) / 2;

  return (
    <Canvas style={{ width: targetSize, height: targetSize }}>
      <Group transform={[{ translateX: dx }, { translateY: dy }, { scale: scale }]}>
        <ImageSVG
          svg={svg}
          x={0}
          y={0}
          width={svgWidth}
          height={svgHeight}
        />
      </Group>
    </Canvas>
  );
};

const WebSvgIcon = ({ source, size }: { source: any; size: number }) => {
  const [hasError, setHasError] = useState(false);
  const targetSize = size * 0.75;

  if (hasError) {
    return (
      <View style={{ width: targetSize, height: targetSize, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="bank" size={size * 0.55} color="#2dba4e" />
      </View>
    );
  }

  const imageSource = typeof source === 'string' ? { uri: source } : (source?.default || source);

  return (
    <Image
      source={imageSource}
      style={{ width: targetSize, height: targetSize }}
      resizeMode="contain"
      onError={() => setHasError(true)}
    />
  );
};

const LocalSvgIcon = ({ source, size }: { source: any; size: number }) => {
  if (Platform.OS === 'web') {
    return <WebSvgIcon source={source} size={size} />;
  }
  return <NativeSvgIcon source={source} size={size} />;
};

const BankIcon = ({
  code,
  name,
  size = 40,
  style
}: {
  code: string;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  const cleanCode = code ? code.toUpperCase() : '';
  const localSource = LOCAL_SVG_MAP[cleanCode];

  const baseStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (localSource) {
    return (
      <View style={[baseStyle, style]}>
        <LocalSvgIcon source={localSource} size={size} />
      </View>
    );
  }

  // Consistent fallback logo for other banks: white background and symbols in green (#2dba4e)
  return (
    <View style={[
      baseStyle,
      {
        borderWidth: 1,
        borderColor: 'rgba(45, 186, 78, 0.18)',
      },
      style
    ]}>
      <MaterialCommunityIcons name="bank" size={Math.round(size * 0.55)} color="#2dba4e" />
    </View>
  );
};

import {
  useTransactionStore,
  useBudgetStore,
  useGoalsStore,
  useAIStore,
  useAuthStore,
  useBankStore,
  useThemeStore,
  useTheme,
  useNotificationStore,
  useAnalyticsStore,
  useConfirmStore,
  showGlobalConfirm,
  rehydrateAllStores,
  useSecurityStore,
  AutoLockTimeout,
  useSidebarStore,
  useAppUpdateStore,
} from '../store';
import { biometricService } from '../services/biometricService';
import { BiometricLockOverlay } from '../components/BiometricLockOverlay';
import { AppSidebarDrawer } from '../components/AppSidebarDrawer';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { getBackendUrl } from '../config/api';
const BACKEND_URL = getBackendUrl();
import { WelcomeScreen, LoginScreen, SignupScreen } from './authScreens';
import { syncService } from '../services/syncService';
import { BankDetailsModal } from './BankDetailsModal';
import { ManualTransactionModal } from './ManualTransactionModal';
import { ProfileScreen } from './ProfileScreen';
import {
  askChatbot,
  ChatMessage
} from '../services/aiService';
import { sanitizeTransactions } from '../services/sanitizer';

// ----------------------------------------------------
// Bouncing Dots Component (Reanimated Typing Indicator)
// ----------------------------------------------------
const BouncingDot = ({ delay }: { delay: number }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const translateY = useSharedValue(0);

  useEffect(() => {
    translateY.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(-10, { duration: 300 }),
          withTiming(0, { duration: 300 })
        ),
        -1,
        true
      )
    );
  }, [delay, translateY]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.typingDot, animatedStyle]} />
  );
};

const TypingIndicator = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  return (
    <View style={styles.typingContainer}>
      <BouncingDot delay={0} />
      <BouncingDot delay={150} />
      <BouncingDot delay={300} />
    </View>
  );
};

// ----------------------------------------------------
// 1. Dashboard Screen Component
// ----------------------------------------------------



// ----------------------------------------------------
// Reusable Add Bank Modal (Paytm/UPI-Style Verification)
// ----------------------------------------------------
const BANK_DEFAULT_SMS_SENDER: { [key: string]: string } = {
  'SBIN': 'SBIIN',
  'BARB': 'BOBTXN',
  'UBIN': 'UBININ',
  'UTIB': 'AXISBK',
  'IDFB': 'IDFCFB',
  'HDFC': 'HDFCBK',
  'KKBK': 'KOTAKB',
  'ICIC': 'ICICIB',
  'PUNB': 'PNBSMS',
  'IDIB': 'INDIBK',
  'CNRB': 'CNRBK',
  'BKID': 'BOIND',
};

interface AddBankModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const ALL_BANKS_SORTED: { code: string; name: string }[] = Object.entries(
  bankNamesJson as { [key: string]: string }
)
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.name.localeCompare(b.name));

const AddBankModal = ({ visible, onClose, onSuccess }: AddBankModalProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const user = useAuthStore((state) => state.user);

  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form inputs
  const [bankNameInput, setBankNameInput] = useState('');
  const [accountSuffix, setAccountSuffix] = useState('');
  const [balance, setBalance] = useState('');
  const [smsSenderId, setSmsSenderId] = useState('');
  const [upiId, setUpiId] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formStep, setFormStep] = useState(1);

  const resetForm = () => {
    setSelectedBank(null);
    setSearchQuery('');
    setBankNameInput('');
    setAccountSuffix('');
    setBalance('');
    setSmsSenderId('');
    setUpiId('');
    setCustomKeywords('');
    setFormError('');
    setFormStep(1);
  };

  useEffect(() => {
    if (visible) {
      resetForm();
    }
  }, [visible]);

  const handleSelectBank = (bank: { code: string; name: string }) => {
    setSelectedBank(bank);
    setBankNameInput(bank.name);

    // Guess SMS Sender ID based on dictionary, fallback to bank.code + "BK"
    const guessedSender = BANK_DEFAULT_SMS_SENDER[bank.code] || `${bank.code}BK`;
    setSmsSenderId(guessedSender);

    setFormStep(2);
  };

  const filteredBanks = useMemo(() => {
    if (!searchQuery.trim()) {
      return ALL_BANKS_SORTED;
    }
    const query = searchQuery.toLowerCase();
    return ALL_BANKS_SORTED.filter(bank =>
      bank.name.toLowerCase().includes(query) ||
      bank.code.toLowerCase().includes(query)
    );
  }, [searchQuery]);

  const renderPopularBanks = () => {
    if (searchQuery.trim()) return null;
    return (
      <View style={styles.popularSection}>
        <Text style={styles.sectionSubHeader}>Popular Banks</Text>
        <View style={styles.popularGrid}>
          {POPULAR_BANKS.map((bank) => {
            return (
              <TouchableOpacity
                key={bank.code}
                style={styles.popularItem}
                onPress={() => handleSelectBank(bank)}
                activeOpacity={0.7}
              >
                <View style={styles.popularBadge}>
                  <BankIcon code={bank.code} name={bank.name} size={52} />
                </View>
                <Text style={styles.popularLabel} numberOfLines={2}>
                  {bank.short}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={[styles.sectionSubHeader, { marginTop: 20, marginBottom: 8 }]}>All Other Banks</Text>
      </View>
    );
  };

  const handleSubmitBank = async () => {
    if (!bankNameInput.trim() || !accountSuffix.trim() || !balance.trim()) {
      setFormError('Please fill in all fields.');
      return;
    }
    if (accountSuffix.trim().length !== 4 || isNaN(Number(accountSuffix))) {
      setFormError('Account suffix must be exactly 4 digits.');
      return;
    }
    if (isNaN(Number(balance))) {
      setFormError('Current balance must be a valid number.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const token = authService.getAccessToken();
      if (!token) {
        throw new Error('No access token found');
      }

      const newId = 'bank_' + Math.random().toString(36).substr(2, 9);
      const response = await fetch(`${BACKEND_URL}/sync/bank-profile`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: newId,
          bankName: bankNameInput.trim(),
          accountNumberSuffix: accountSuffix.trim(),
          currentBalance: parseFloat(balance),
          smsSenderId: smsSenderId.trim() || undefined,
          upiId: upiId.trim() || undefined,
          customKeywords: customKeywords.trim() || undefined,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to connect bank account on backend');
      }

      resetForm();
      onSuccess();
    } catch (e: any) {
      setFormError(e.message || 'Database save failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (formStep === 2) {
          setFormStep(1);
          setFormError('');
        } else {
          resetForm();
          onClose();
        }
      }}
    >
      <View style={styles.modalOverlayFull}>
        <View style={styles.modalCardFull}>
          <View style={navStyles.modalHeader}>
            <Text style={navStyles.modalTitle}>
              {formStep === 1 ? 'Select Your Bank' : 'Bank Account Details'}
            </Text>
            <TouchableOpacity
              onPress={() => {
                resetForm();
                onClose();
              }}
              style={navStyles.closeBtn}
            >
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          {formStep === 1 ? (
            <View style={{ flex: 1 }}>
              <View style={styles.searchBarContainer}>
                <Feather name="search" size={18} color="#8E8E9F" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Enter the bank name"
                  placeholderTextColor="rgba(250, 251, 252, 0.4)"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  autoCapitalize="none"
                />
              </View>

              <FlatList
                data={filteredBanks}
                keyExtractor={(item, index) => item.code + '_' + index}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                ListHeaderComponent={renderPopularBanks}
                initialNumToRender={50}
                maxToRenderPerBatch={50}
                windowSize={10}
                removeClippedSubviews={true}
                keyboardShouldPersistTaps="handled"
                getItemLayout={(data, index) => (
                  { length: 74, offset: 74 * index, index }
                )}
                ListEmptyComponent={
                  <Text style={{ color: 'rgba(250, 251, 252, 0.5)', textAlign: 'center', marginTop: 30 }}>
                    No banks found matching "{searchQuery}"
                  </Text>
                }
                renderItem={({ item }) => {
                  return (
                    <TouchableOpacity
                      style={styles.bankListItem}
                      onPress={() => handleSelectBank(item)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.bankIconContainer}>
                        <BankIcon code={item.code} name={item.name} size={40} />
                      </View>
                      <View style={styles.bankMeta}>
                        <Text style={styles.bankNameText} numberOfLines={1} ellipsizeMode="tail">
                          {item.name}
                        </Text>
                        <Text style={styles.bankCodeText}>
                          {item.code}
                        </Text>
                      </View>
                      <Feather name="chevron-right" size={16} color={colors.textTertiary || '#8E8E9F'} style={styles.bankChevron} />
                    </TouchableOpacity>
                  );
                }}
              />
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }}>
              <TouchableOpacity
                style={styles.formBackBtn}
                onPress={() => {
                  setFormStep(1);
                  setFormError('');
                }}
              >
                <Feather name="arrow-left" size={16} color="#2dba4e" />
                <Text style={styles.formBackText}>Back to banks</Text>
              </TouchableOpacity>

              <View style={styles.bankFormHeader}>
                <View style={{ marginBottom: 12 }}>
                  <BankIcon code={selectedBank?.code || ''} name={selectedBank?.name || ''} size={56} />
                </View>
                <Text style={styles.bankFormTitle}>{selectedBank?.name}</Text>
                <Text style={styles.bankFormSubtitle}>Direct Mapping Setup</Text>
              </View>

              <View style={{ paddingHorizontal: 4 }}>
                {/* Bank Name Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>Bank Display Name</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="home" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. HDFC Bank"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      value={bankNameInput}
                      onChangeText={setBankNameInput}
                    />
                  </View>
                </View>

                {/* Suffix Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>Last 4 Digits of Account Number</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="hash" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. 5678"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      keyboardType="numeric"
                      maxLength={4}
                      value={accountSuffix}
                      onChangeText={setAccountSuffix}
                    />
                  </View>
                </View>

                {/* Starting Balance Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>Current / Starting Balance (INR)</Text>
                  <View style={styles.formInputGroup}>
                    <MaterialCommunityIcons name="currency-inr" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. 75000"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      keyboardType="numeric"
                      value={balance}
                      onChangeText={setBalance}
                    />
                  </View>
                </View>

                {/* SMS Sender ID Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>SMS Sender ID / Header</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="message-square" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. HDFCBK"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      value={smsSenderId}
                      onChangeText={setSmsSenderId}
                      autoCapitalize="characters"
                    />
                  </View>
                  <Text style={{ color: '#8E8E9F', fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                    The sender address of the SMS notification (e.g. AD-HDFCBK to HDFCBK).
                  </Text>
                </View>

                {/* UPI ID Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>Associated UPI ID (Optional)</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="at-sign" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. success@okhdfcbank"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      value={upiId}
                      onChangeText={setUpiId}
                      autoCapitalize="none"
                    />
                  </View>
                  <Text style={{ color: '#8E8E9F', fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                    Used for mapping UPI payment transaction notifications.
                  </Text>
                </View>

                {/* Custom Keywords Input */}
                <View style={styles.formFieldContainer}>
                  <Text style={styles.formFieldLabel}>Custom Matching Keywords (Optional)</Text>
                  <View style={styles.formInputGroup}>
                    <Feather name="key" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                    <TextInput
                      style={styles.formInputField}
                      placeholder="e.g. HDFC, credit card, salary"
                      placeholderTextColor="rgba(250, 251, 252, 0.4)"
                      value={customKeywords}
                      onChangeText={setCustomKeywords}
                    />
                  </View>
                  <Text style={{ color: '#8E8E9F', fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                    Comma-separated words that must appear in messages or screenshots for auto-matching.
                  </Text>
                </View>
              </View>

              {formError ? (
                <View style={[styles.errorContainer, { marginVertical: 12, width: '100%' }]}>
                  <Feather name="alert-circle" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
                  <Text style={styles.errorTextInline}>{formError}</Text>
                </View>
              ) : null}

              {submitting ? (
                <ActivityIndicator size="large" color="#2dba4e" style={{ marginTop: 24 }} />
              ) : (
                <TouchableOpacity
                  style={[styles.submitBankBtn, { marginTop: 24, width: '100%' }]}
                  onPress={handleSubmitBank}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBankBtnText}>Link Bank Account</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// Web-Safe Chart Fallbacks (Skia is not bundled on Web)
// ----------------------------------------------------
const WebNetWorthChart = ({ data, color = '#2dba4e' }: { data: any[]; color?: string }) => {
  if (!data || data.length === 0) return null;
  const values = data.map((d) => d.netWorth || 0);
  const minVal = Math.min(...values);
  const maxVal = Math.max(...values);
  const range = maxVal - minVal || 1;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 10, paddingTop: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
        {data.map((item, idx) => {
          const heightPct = Math.max(15, Math.round(((item.netWorth - minVal) / range) * 80 + 15));
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', paddingHorizontal: 3 }}>
              <View
                style={{
                  width: '70%',
                  maxWidth: 24,
                  height: `${heightPct}%`,
                  backgroundColor: color,
                  borderRadius: 6,
                  opacity: idx === data.length - 1 ? 1 : 0.65,
                }}
              />
              <Text style={{ color: 'rgba(250, 251, 252, 0.5)', fontSize: 10, marginTop: 6 }} numberOfLines={1}>
                {item.monthLabel}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const WebProjectionChart = ({ data }: { data: any[] }) => {
  if (!data || data.length === 0) return null;
  const sampled = data.length > 8
    ? data.filter((_, i) => i === 0 || i === data.length - 1 || i % Math.ceil(data.length / 6) === 0)
    : data;
  const maxVal = Math.max(...data.map(d => Math.max(d.value || 0, d.invested || 0))) || 1;

  return (
    <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', height: 120 }}>
        {sampled.map((item, idx) => {
          const valuePct = Math.max(12, Math.round(((item.value || 0) / maxVal) * 100));
          const investedPct = Math.max(10, Math.round(((item.invested || 0) / maxVal) * 100));
          return (
            <View key={idx} style={{ flex: 1, alignItems: 'center', height: '100%', justifyContent: 'flex-end', paddingHorizontal: 2 }}>
              <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: '85%', gap: 3 }}>
                <View
                  style={{
                    width: 8,
                    height: `${investedPct}%`,
                    backgroundColor: 'rgba(250, 251, 252, 0.4)',
                    borderRadius: 3
                  }}
                />
                <View
                  style={{
                    width: 8,
                    height: `${valuePct}%`,
                    backgroundColor: '#2dba4e',
                    borderRadius: 3
                  }}
                />
              </View>
              <Text style={{ color: 'rgba(250, 251, 252, 0.5)', fontSize: 9, marginTop: 4 }}>
                Y{item.year}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
};

const WebDonutChart = ({ data }: { data: any[] }) => {
  const total = data.reduce((sum, item) => sum + (item.value || 0), 0) || 1;
  return (
    <View style={{ width: 130, height: 130, borderRadius: 65, borderWidth: 14, borderColor: '#2dba4e', justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ color: '#fafbfc', fontSize: 11, fontWeight: '800' }}>₹{total.toLocaleString('en-IN')}</Text>
      <Text style={{ color: 'rgba(250, 251, 252, 0.5)', fontSize: 9 }}>Total</Text>
    </View>
  );
};

interface NetWorthDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  snapshots: any[];
  liveNetWorth: number;
  loading?: boolean;
}

const NetWorthDetailsModal = ({ visible, onClose, snapshots, liveNetWorth, loading = false }: NetWorthDetailsModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);

  const [range, setRange] = useState<'3M' | '6M' | '1Y'>('6M');

  // Compute filtered snapshots and table list items
  const { chartData, listItems, changeAmount, changePercent, isPositive } = useMemo(() => {
    let monthsToKeep = 6;
    if (range === '3M') monthsToKeep = 3;
    if (range === '6M') monthsToKeep = 6;
    if (range === '1Y') monthsToKeep = 12;

    // Filter snapshots based on range
    let filtered = [...snapshots];
    filtered.sort((a, b) => b.timestamp - a.timestamp);
    filtered = filtered.slice(0, monthsToKeep);
    filtered.sort((a, b) => a.timestamp - b.timestamp);

    // Compute month-end last days
    const tableData = filtered.map((s) => {
      const dateObj = new Date(s.timestamp);
      const y = dateObj.getFullYear();
      const m = dateObj.getMonth();
      const lastDay = new Date(y, m + 1, 0); // last day of that month
      return {
        timestamp: s.timestamp,
        netWorth: s.netWorth,
        monthLabel: dateObj.toLocaleDateString('en-IN', { month: 'short' }),
        lastDayLabel: `${lastDay.getDate()} ${lastDay.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`,
        displayMonth: dateObj.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
        isLive: false,
      };
    });

    const currentLiveItem = {
      timestamp: Date.now(),
      netWorth: liveNetWorth,
      monthLabel: new Date().toLocaleDateString('en-IN', { month: 'short' }),
      lastDayLabel: 'Today (Live)',
      displayMonth: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
      isLive: true,
    };

    // Newest first for list
    const listItems = [currentLiveItem, ...[...tableData].reverse()];

    // Chronological order for chart
    const chartData = [
      ...tableData,
      {
        timestamp: Date.now(),
        netWorth: liveNetWorth,
        monthLabel: new Date().toLocaleDateString('en-IN', { month: 'short' }),
        isLive: true,
      }
    ];

    // Compute trend metrics
    const startVal = tableData.length > 0 ? tableData[0].netWorth : liveNetWorth;
    const changeAmt = liveNetWorth - startVal;
    const changePct = startVal > 0 ? (changeAmt / startVal) * 100 : 0;

    return {
      chartData,
      listItems,
      changeAmount: changeAmt,
      changePercent: changePct,
      isPositive: changeAmt >= 0,
    };
  }, [snapshots, liveNetWorth, range]);

  const trendColor = isPositive ? '#2dba4e' : '#cf222e';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlayFull}>
        <View style={[styles.modalCardFull, { height: '90%' }]}>
          {/* Header */}
          <View style={navStyles.modalHeader}>
            <View>
              <Text style={navStyles.modalTitle}>Net Worth Analytics</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                Live wealth tracker & trends
              </Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={navStyles.closeBtn}
              activeOpacity={0.7}
            >
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
            {/* Live Summary block */}
            <View style={{ marginVertical: 10, alignItems: 'flex-start' }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Current Net Worth
              </Text>
              <Text style={{ color: colors.text, fontSize: 32, fontWeight: '900', marginTop: 4 }}>
                ₹{liveNetWorth.toLocaleString('en-IN')}
              </Text>

              {/* Trend Badge */}
              <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: isPositive ? 'rgba(45, 186, 78, 0.12)' : 'rgba(207, 34, 46, 0.12)',
                paddingHorizontal: 8,
                paddingVertical: 4,
                borderRadius: 8,
                marginTop: 6
              }}>
                <Feather
                  name={isPositive ? "arrow-up-right" : "arrow-down-left"}
                  size={14}
                  color={trendColor}
                  style={{ marginRight: 4 }}
                />
                <Text style={{ color: trendColor, fontSize: 12, fontWeight: '800' }}>
                  {isPositive ? '+' : ''}₹{Math.abs(changeAmount).toLocaleString('en-IN')} ({isPositive ? '+' : ''}{changePercent.toFixed(1)}%)
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 11, marginLeft: 6 }}>
                  last {range === '3M' ? '3 months' : range === '6M' ? '6 months' : '1 year'}
                </Text>
              </View>
            </View>

            {/* Timeframe selector */}
            <View style={{
              flexDirection: 'row',
              backgroundColor: colors.isDark ? '#1a1a24' : '#edf0f2',
              borderRadius: 12,
              padding: 4,
              marginVertical: 16
            }}>
              {(['3M', '6M', '1Y'] as const).map((r) => {
                const active = range === r;
                return (
                  <TouchableOpacity
                    key={r}
                    style={{
                      flex: 1,
                      paddingVertical: 10,
                      alignItems: 'center',
                      backgroundColor: active ? (colors.isDark ? '#2b2b3b' : '#ffffff') : 'transparent',
                      borderRadius: 8,
                      borderWidth: active ? 1 : 0,
                      borderColor: active ? colors.border : 'transparent',
                      shadowColor: active ? '#000000' : 'transparent',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 2,
                      elevation: active ? 2 : 0,
                    }}
                    onPress={() => setRange(r)}
                    activeOpacity={0.8}
                  >
                    <Text style={{
                      color: active ? trendColor : colors.textSecondary,
                      fontWeight: '800',
                      fontSize: 13
                    }}>
                      {r === '3M' ? '3 Months' : r === '6M' ? '6 Months' : '1 Year'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* GPU Stock Chart */}
            <View style={{
              backgroundColor: colors.isDark ? '#12121a' : '#ffffff',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 16,
              padding: 12,
              height: 220,
              marginBottom: 20,
              shadowColor: colors.shadowColor,
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.05,
              shadowRadius: 8,
              elevation: 2,
            }}>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: '700', marginBottom: 8, textTransform: 'uppercase' }}>
                Wealth Performance Curve
              </Text>

              {chartData.length > 1 ? (
                <View style={{ flex: 1 }}>
                  {Platform.OS !== 'web' ? (
                    <CartesianChart
                      data={chartData}
                      xKey="monthLabel"
                      yKeys={["netWorth"]}
                    >
                      {({ points, chartBounds }) => (
                        <>
                          <Area
                            points={points.netWorth}
                            y0={chartBounds.bottom}
                            animate={{ type: "timing", duration: 300 }}
                          >
                            <LinearGradient
                              start={vec(0, chartBounds.top)}
                              end={vec(0, chartBounds.bottom)}
                              colors={[trendColor, "rgba(45, 186, 78, 0)"]}
                            />
                          </Area>
                          <Line
                            points={points.netWorth}
                            color={trendColor}
                            strokeWidth={2.5}
                            animate={{ type: "timing", duration: 300 }}
                          />
                        </>
                      )}
                    </CartesianChart>
                  ) : (
                    <WebNetWorthChart data={chartData} color={trendColor} />
                  )}
                </View>
              ) : loading ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="small" color={trendColor} />
                </View>
              ) : (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 16 }}>
                  <Feather name="bar-chart-2" size={24} color={colors.textTertiary} style={{ marginBottom: 6 }} />
                  <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: '600' }}>
                    No historical trend data found
                  </Text>
                  <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 4, textAlign: 'center', lineHeight: 16 }}>
                    Historical snapshots will record automatically as your bank balances change.
                  </Text>
                </View>
              )}
            </View>

            {/* Month-wise list header */}
            <Text style={{
              color: colors.text,
              fontSize: 14,
              fontWeight: '800',
              marginBottom: 10,
              letterSpacing: 0.5,
            }}>
              Month-end History
            </Text>

            {/* Monthly record rows */}
            {listItems.map((item, idx) => {
              return (
                <View
                  key={idx}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.inputBackground,
                    borderWidth: 1,
                    borderColor: item.isLive ? colors.accent : colors.border,
                    borderRadius: 14,
                    paddingHorizontal: 16,
                    height: 64,
                    marginVertical: 4,
                    shadowColor: colors.shadowColor,
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.03,
                    shadowRadius: 4,
                    elevation: 1,
                  }}
                >
                  <View style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: item.isLive ? colors.accentMuted : (colors.isDark ? '#1e1e2c' : '#f0f4f8'),
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 12,
                  }}>
                    {item.isLive ? (
                      <Ionicons name="pulse" size={18} color={colors.accent} />
                    ) : (
                      <Feather name="calendar" size={16} color={colors.textSecondary} />
                    )}
                  </View>

                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                        {item.displayMonth}
                      </Text>
                      {item.isLive && (
                        <View style={{
                          backgroundColor: 'rgba(45, 186, 78, 0.12)',
                          paddingHorizontal: 6,
                          paddingVertical: 2,
                          borderRadius: 6,
                          marginLeft: 8
                        }}>
                          <Text style={{ color: '#2dba4e', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 }}>
                            LIVE
                          </Text>
                        </View>
                      )}
                    </View>
                    <Text style={{ color: colors.textTertiary, fontSize: 11, marginTop: 2 }}>
                      {item.lastDayLabel}
                    </Text>
                  </View>

                  <Text style={{ color: colors.text, fontSize: 14, fontWeight: '800' }}>
                    ₹{item.netWorth.toLocaleString('en-IN')}
                  </Text>
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

interface NotificationsModalProps {
  visible: boolean;
  onClose: () => void;
}

const NotificationsModal = ({ visible, onClose }: NotificationsModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);

  const notifications = useNotificationStore((state) => state.notifications);
  const isLoading = useNotificationStore((state) => state.isLoading);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const handleMarkAllRead = async () => {
    const unread = notifications.filter(n => !n.readStatus);
    for (const item of unread) {
      notificationService.markAsRead(item.id);
    }
  };

  const handleAction = async (notification: any, actionName: 'approve' | 'keep_old') => {
    const payload = notification.payload;
    if (!payload) return;

    try {
      const accessToken = authService.getAccessToken();
      if (!accessToken) return;

      if (payload.action === 'category_correction') {
        const categoryToUse = actionName === 'approve' ? payload.suggestedCategory : payload.oldCategory;

        const response = await fetch(`${BACKEND_URL}/sync/transaction/${payload.transactionId}/category`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ category: categoryToUse }),
        });

        if (!response.ok) {
          throw new Error('Failed to update category');
        }

        await syncService.sync();
        Alert.alert('Success', `Transaction category set to "${categoryToUse}"`);
      }

      await notificationService.markAsRead(notification.id);
    } catch (e: any) {
      Alert.alert('Action Failed', e.message || 'Unable to complete action.');
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlayFull}>
        <View style={[styles.modalCardFull, { height: '85%' }]}>
          {/* Header */}
          <View style={navStyles.modalHeader}>
            <View>
              <Text style={navStyles.modalTitle}>Notifications</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                AI agent briefs and anomalies
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllRead}
                  style={{ marginRight: 16, backgroundColor: colors.buttonSecondaryBackground, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}
                  activeOpacity={0.7}
                >
                  <Text style={{ color: colors.accent, fontSize: 11, fontWeight: '700' }}>Mark all read</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                onPress={onClose}
                style={navStyles.closeBtn}
                activeOpacity={0.7}
              >
                <Feather name="x" size={20} color="#8E8E9F" />
              </TouchableOpacity>
            </View>
          </View>

          {isLoading ? (
            <ActivityIndicator size="large" color={colors.accent} style={{ marginTop: 40 }} />
          ) : notifications.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 20 }}>
              <Ionicons name="notifications-off-outline" size={48} color="#8E8E9F" style={{ marginBottom: 12 }} />
              <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' }}>All caught up!</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, textAlign: 'center', lineHeight: 18 }}>
                AI Agents are actively monitoring SMS logs and budget anomalies. You will be notified here when an action is required.
              </Text>
            </View>
          ) : (
            <FlatList
              data={notifications}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 20 }}
              renderItem={({ item }) => {
                const isUnread = !item.readStatus;
                const isCorrection = item.payload?.action === 'category_correction';

                return (
                  <View
                    style={{
                      backgroundColor: colors.inputBackground,
                      borderWidth: 1,
                      borderColor: isUnread ? colors.accent : colors.border,
                      borderRadius: 14,
                      padding: 16,
                      marginVertical: 6,
                      shadowColor: colors.shadowColor,
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.03,
                      shadowRadius: 4,
                      elevation: 1,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      {/* Icon type */}
                      <View style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: isUnread ? colors.accentMuted : (isDark ? '#1e1e2c' : '#f0f4f8'),
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginRight: 10,
                        marginTop: 2,
                      }}>
                        <Ionicons
                          name={item.type === 'anomaly' || item.type === 'budget_alert' ? 'warning-outline' : 'chatbubble-ellipses-outline'}
                          size={16}
                          color={isUnread ? colors.accent : colors.textSecondary}
                        />
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={{ color: colors.text, fontSize: 14, fontWeight: '700' }}>
                          {item.title}
                        </Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4, lineHeight: 18 }}>
                          {item.body}
                        </Text>

                        {/* Category Correction Actions */}
                        {isCorrection && isUnread && (
                          <View style={{ flexDirection: 'row', marginTop: 12 }}>
                            <TouchableOpacity
                              style={{
                                backgroundColor: colors.accent,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                                marginRight: 10,
                              }}
                              onPress={() => handleAction(item, 'approve')}
                              activeOpacity={0.8}
                            >
                              <Text style={{ color: '#24292e', fontSize: 12, fontWeight: '800' }}>
                                Approve {item.payload.suggestedCategory}
                              </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                borderWidth: 1,
                                borderColor: colors.border,
                                paddingHorizontal: 12,
                                paddingVertical: 6,
                                borderRadius: 8,
                              }}
                              onPress={() => handleAction(item, 'keep_old')}
                              activeOpacity={0.8}
                            >
                              <Text style={{ color: colors.text, fontSize: 12, fontWeight: '700' }}>
                                Keep {item.payload.oldCategory}
                              </Text>
                            </TouchableOpacity>
                          </View>
                        )}

                        {/* Relative time */}
                        <Text style={{ color: colors.textTertiary, fontSize: 10, marginTop: 8 }}>
                          {new Date(item.createdAt).toLocaleString('en-IN')}
                        </Text>
                      </View>

                      {/* Read status dot */}
                      {isUnread && (
                        <View style={{
                          width: 8,
                          height: 8,
                          borderRadius: 4,
                          backgroundColor: colors.accent,
                          marginLeft: 8,
                          marginTop: 6,
                        }} />
                      )}
                    </View>
                  </View>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// Reusable Global Profile Modal
// ----------------------------------------------------
const ProfileModal = ({ visible, onClose }: { visible: boolean; onClose: () => void }) => {
  const { colors } = useTheme();
  const navStyles = getNavStyles(colors);
  const user = useAuthStore((state) => state.user);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={navStyles.modalOverlay}>
        <View style={navStyles.modalCard}>
          <View style={navStyles.modalHeader}>
            <Text style={navStyles.modalTitle}>User Profile</Text>
            <TouchableOpacity onPress={onClose} style={navStyles.closeBtn}>
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <View style={navStyles.profileInfoRow}>
            <View style={navStyles.largeAvatar}>
              <Text style={navStyles.largeAvatarText}>
                {user?.name?.charAt(0).toUpperCase() || 'U'}
              </Text>
            </View>
            <View style={{ flex: 1, marginLeft: 16 }}>
              <Text style={navStyles.profileName}>{user?.name || 'Guest User'}</Text>
              <Text style={navStyles.profileEmail}>{user?.email || user?.phone || 'Offline session'}</Text>
              <View style={{ flexDirection: 'row', marginTop: 8 }}>
                <View style={navStyles.providerBadge}>
                  <Text style={navStyles.providerBadgeText}>
                    Provider: {user?.authProvider ? (user.authProvider === 'local' || user.authProvider === 'email' ? 'Email/Password' : user.authProvider.charAt(0).toUpperCase() + user.authProvider.slice(1)) : 'Supabase'}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={navStyles.metaInfoBlock}>
            <Text style={navStyles.metaLabel}>Session Type: <Text style={navStyles.metaValue}>NestJS Cloud Sync</Text></Text>
            {user?.createdAt && (
              <Text style={navStyles.metaLabel}>Member Since: <Text style={navStyles.metaValue}>{new Date(user.createdAt).toLocaleDateString('en-IN')}</Text></Text>
            )}
          </View>

          <TouchableOpacity
            style={navStyles.logoutBtn}
            onPress={() => {
              onClose();
              showGlobalConfirm({
                title: 'Log Out Session',
                message: 'Are you sure you want to log out of your Regent Money account?',
                confirmText: 'Yes, Log Out',
                cancelText: 'Cancel',
                isDestructive: true,
                icon: 'log-out',
                onConfirm: async () => {
                  await authService.logOut();
                },
              });
            }}
          >
            <Feather name="log-out" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
            <Text style={navStyles.logoutBtnText}>Log Out Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// Unified Premium TopBar (Header shown across every screen)
// ----------------------------------------------------
interface AppTopBarProps {
  onOpenAddBank?: () => void;
}

const AppTopBar = ({ onOpenAddBank }: AppTopBarProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const unreadCount = useNotificationStore((state) => state.unreadCount);

  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
  const [internalAddBankVisible, setInternalAddBankVisible] = useState(false);

  // Pulse animation for the saving badge and alert dot
  const pulseOpacity = useSharedValue(0.4);
  const pulseScale = useSharedValue(1);

  useEffect(() => {
    pulseOpacity.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1100 }),
        withTiming(0.35, { duration: 1100 })
      ),
      -1,
      true
    );
    pulseScale.value = withRepeat(
      withSequence(
        withTiming(1.2, { duration: 1100 }),
        withTiming(0.9, { duration: 1100 })
      ),
      -1,
      true
    );
  }, []);

  const animatedPulseDot = useAnimatedStyle(() => ({
    opacity: pulseOpacity.value,
    transform: [{ scale: pulseScale.value }],
  }));

  const handleAlertPress = () => {
    if (onOpenAddBank) {
      onOpenAddBank();
    } else {
      setInternalAddBankVisible(true);
    }
  };

  return (
    <View style={[styles.topBarContainer, { paddingTop: Math.max(insets.top, Platform.OS === 'web' ? 8 : 4) }]}>
      <View style={styles.topBarContent}>
        {/* Left Brand Identity - Tap to open Sidebar Drawer */}
        <TouchableOpacity
          style={styles.topBarLeft}
          onPress={() => useSidebarStore.getState().openSidebar()}
          activeOpacity={0.7}
        >
          <View style={styles.topBarLogoBadge}>
            <Image
              source={require('../../assets/insideicon.png')}
              style={styles.topBarLogoImage}
              resizeMode="contain"
            />
          </View>
          <View style={styles.topBarBrandCol}>
            <View style={styles.topBarTitleRow}>
              <Text style={styles.topBarRegent}>REGENT</Text>
              <Text style={styles.topBarMoney}>MONEY</Text>
            </View>
          </View>
        </TouchableOpacity>

        {/* Right Actions */}
        <View style={styles.topBarRight}>
          {bankProfiles.length === 0 && (
            <TouchableOpacity
              style={styles.topBarAlertBtn}
              onPress={handleAlertPress}
              activeOpacity={0.7}
            >
              <Feather name="alert-circle" size={16} color="#FF5252" />
              <Animated.View style={[styles.badgePulseDot, animatedPulseDot]} />
            </TouchableOpacity>
          )}

          {/* Notifications Bell */}
          <TouchableOpacity
            style={styles.topBarIconBtn}
            onPress={() => setNotificationsVisible(true)}
            activeOpacity={0.7}
          >
            <Feather name="bell" size={17} color={colors.text} />
            {unreadCount > 0 && (
              <View style={styles.topBarBadge}>
                <Text style={styles.topBarBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Global Modals accessible from every page */}
      <ProfileModal
        visible={profileModalVisible}
        onClose={() => setProfileModalVisible(false)}
      />

      <NotificationsModal
        visible={notificationsVisible}
        onClose={() => setNotificationsVisible(false)}
      />

      <AddBankModal
        visible={internalAddBankVisible}
        onClose={() => setInternalAddBankVisible(false)}
        onSuccess={async () => {
          setInternalAddBankVisible(false);
          await sync();
        }}
      />
    </View>
  );
};

const TransactionRowItem = React.memo(({ tx, styles }: { tx: any; styles: any }) => (
  <View style={styles.txItem}>
    <View style={styles.txLeft}>
      <View style={styles.txIconBg}>
        <Feather
          name={tx.category === 'food' ? 'coffee' : tx.category === 'transport' ? 'navigation' : 'tag'}
          size={16}
          color="#2dba4e"
        />
      </View>
      <View style={styles.txMeta}>
        <Text style={styles.merchantName}>{tx.merchant}</Text>
        <Text style={styles.txDate}>{new Date(tx.timestamp).toLocaleDateString('en-IN')}</Text>
      </View>
    </View>
    <View style={styles.txRight}>
      <Text style={styles.txAmount}>-₹{tx.amount}</Text>
      {tx.isAnomaly && (
        <View style={styles.anomalyBadge}>
          <Text style={styles.anomalyText}>Anomaly</Text>
        </View>
      )}
    </View>
  </View>
));

const DashboardScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const [refreshing, setRefreshing] = useState(false);

  const unreadCount = useNotificationStore((state) => state.unreadCount);
  const notifications = useNotificationStore((state) => state.notifications);

  // Bank profile state management
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const [addBankModalVisible, setAddBankModalVisible] = useState(false);
  const [netWorthModalVisible, setNetWorthModalVisible] = useState(false);

  // Slide Animation for Onboarding notification banner
  const bannerY = useSharedValue(-100);
  const bannerOpacity = useSharedValue(0);

  useEffect(() => {
    if (bankProfiles.length === 0) {
      bannerY.value = withTiming(0, { duration: 500 });
      bannerOpacity.value = withTiming(1, { duration: 500 });
    } else {
      bannerY.value = withTiming(-100, { duration: 300 });
      bannerOpacity.value = withTiming(0, { duration: 300 });
    }
  }, [bankProfiles.length]);

  const bannerAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: bannerY.value }],
    opacity: bannerOpacity.value,
  }));

  const handleOpenAddBank = () => {
    setAddBankModalVisible(true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncService.sync(true);
      await sync();
    } catch (e: any) {
      console.log('[Dashboard] Pull-to-refresh sync failed:', e.message);
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  const transactions = useTransactionStore((state) => state.transactions);
  const isLoading = useTransactionStore((state) => state.isLoading);
  const filterCategory = useTransactionStore((state) => state.filterCategory);
  const setFilterCategory = useTransactionStore((state) => state.setFilterCategory);

  const snapshots = useAnalyticsStore((state) => state.snapshots);
  const incomeCurrentMonth = useAnalyticsStore((state) => state.incomeCurrentMonth);

  // Fetch data on screen focus with cached SWR
  useFocusEffect(
    useCallback(() => {
      sync();
      syncService.fetchAnalytics();
    }, [sync])
  );

  // Dynamic calculations for cards
  const liveNetWorth = useMemo(() => {
    if (bankProfiles.length > 0) {
      return bankProfiles.reduce((sum, bank) => sum + bank.currentBalance, 0);
    }
    if (snapshots.length > 0) {
      return snapshots[snapshots.length - 1].netWorth;
    }
    return 184320; // fallback
  }, [bankProfiles, snapshots]);

  const currentMonthExpenses = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    return transactions
      .filter((tx) => tx.timestamp >= startOfMonth)
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions]);

  // Donut chart category grouping (with double-drilldown into merchants when category is selected)
  const donutData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const filteredTxs = transactions.filter(
      (tx) => tx.timestamp >= startOfMonth && (filterCategory === null || tx.category === filterCategory)
    );

    const map: { [key: string]: number } = {};
    filteredTxs.forEach((tx) => {
      const key = filterCategory === null ? tx.category : tx.merchant;
      map[key] = (map[key] || 0) + tx.amount;
    });

    const chartColors = isDark
      ? ['#2dba4e', 'rgba(45, 186, 78, 0.7)', '#fafbfc', 'rgba(250, 251, 252, 0.6)', 'rgba(45, 186, 78, 0.4)']
      : ['#2dba4e', 'rgba(45, 186, 78, 0.7)', '#1a1f26', 'rgba(26, 31, 38, 0.6)', 'rgba(45, 186, 78, 0.4)'];
    return Object.keys(map).map((key, index) => ({
      label: key.charAt(0).toUpperCase() + key.slice(1),
      value: map[key],
      color: chartColors[index % chartColors.length],
    }));
  }, [transactions, filterCategory]);

  const recentTransactions = useMemo(() => {
    return transactions
      .filter((tx) => filterCategory === null || tx.category === filterCategory)
      .slice(0, 5);
  }, [transactions, filterCategory]);

  const categories = ['food', 'transport', 'shopping', 'utilities', 'entertainment'];

  return (
    <View style={styles.container}>
      <AppTopBar onOpenAddBank={handleOpenAddBank} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: 12, paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dba4e" colors={["#2dba4e"]} />
        }
      >

        {/* Onboarding Bank Connection Banner */}
        {bankProfiles.length === 0 && (
          <Animated.View
            entering={FadeIn.delay(300).duration(800)}
            style={styles.bankNotificationBanner}
          >
            <Feather name="info" size={18} color="#FFD700" style={{ marginRight: 10 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerText}>Connect a bank account to enable sync and transactions.</Text>
            </View>
            <TouchableOpacity
              style={styles.bannerActionBtn}
              onPress={handleOpenAddBank}
              activeOpacity={0.8}
            >
              <Text style={styles.bannerActionText}>Add Bank</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

        {/* Net Worth Card (Neon shadow style) */}
        <TouchableOpacity
          style={[styles.card, styles.neonCard]}
          onPress={() => setNetWorthModalVisible(true)}
          activeOpacity={0.8}
        >
          <Text style={styles.cardTitle}>Total Net Worth</Text>
          <Text style={styles.cardBigNumber}>₹{liveNetWorth.toLocaleString('en-IN')}</Text>
          <Text style={styles.cardFooter}>Active Wealth Compounder</Text>
        </TouchableOpacity>

        {/* Net Worth Area Chart */}
        {snapshots.length > 1 && (
          <View style={[styles.card, { height: 220 }]}>
            <Text style={styles.chartTitle}>Net Worth History (6 Months)</Text>
            <View style={{ flex: 1, marginTop: 10 }}>
              {Platform.OS !== 'web' ? (
                <CartesianChart
                  data={snapshots}
                  xKey="monthLabel"
                  yKeys={["netWorth"]}
                >
                  {({ points, chartBounds }) => (
                    <Area
                      points={points.netWorth}
                      y0={chartBounds.bottom}
                      animate={{ type: "timing", duration: 350 }}
                    >
                      <LinearGradient
                        start={vec(0, chartBounds.top)}
                        end={vec(0, chartBounds.bottom)}
                        colors={["#2dba4e", "rgba(45, 186, 78, 0)"]}
                      />
                    </Area>
                  )}
                </CartesianChart>
              ) : (
                <WebNetWorthChart data={snapshots} />
              )}
            </View>
          </View>
        )}

        {/* Balance Row */}
        <View style={styles.row}>
          <View style={styles.cardHalf}>
            <Text style={styles.cardTitle}>Spent (Current Month)</Text>
            <Text style={styles.cardBigNumberSmall}>
              ₹{currentMonthExpenses.toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.cardHalf}>
            <Text style={styles.cardTitle}>Income (Current Month)</Text>
            <Text style={[styles.cardBigNumberSmall, { color: colors.accent }]}>
              ₹{incomeCurrentMonth.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>

        {/* Category Horizontal Filter Row */}
        <View style={styles.filterWrapper}>
          <Text style={styles.sectionHeader}>Transactions Filter</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll}>
            <TouchableOpacity
              style={[styles.filterTab, filterCategory === null && styles.filterTabActive]}
              onPress={() => setFilterCategory(null)}
            >
              <Text style={[styles.filterTabText, filterCategory === null && styles.filterTabTextActive]}>All</Text>
            </TouchableOpacity>
            {categories.map((cat) => (
              <TouchableOpacity
                key={cat}
                style={[styles.filterTab, filterCategory === cat && styles.filterTabActive]}
                onPress={() => setFilterCategory(cat)}
              >
                <Text style={[styles.filterTabText, filterCategory === cat && styles.filterTabTextActive]}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* Donut Chart (PolarChart) */}
        {donutData.length > 0 && (
          <View style={[styles.card, styles.donutCardContainer]}>
            <Text style={styles.chartTitle}>
              {filterCategory === null ? 'Spending breakdown' : `${filterCategory.toUpperCase()} breakdown`}
            </Text>
            <View style={styles.donutRow}>
              <View style={{ width: 140, height: 140, justifyContent: 'center', alignItems: 'center' }}>
                {Platform.OS !== 'web' ? (
                  <PolarChart
                    data={donutData}
                    labelKey="label"
                    valueKey="value"
                    colorKey="color"
                  >
                    <Pie.Chart innerRadius="65%" />
                  </PolarChart>
                ) : (
                  <WebDonutChart data={donutData} />
                )}
              </View>
              <View style={styles.donutLegend}>
                {donutData.slice(0, 4).map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendIndicator, { backgroundColor: item.color }]} />
                    <Text style={styles.legendText} numberOfLines={1}>
                      {item.label}: ₹{item.value}
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Recent Transactions List */}
        <View style={[styles.card, { marginBottom: 30 }]}>
          <Text style={styles.chartTitle}>Recent Transactions</Text>
          {isLoading && transactions.length === 0 ? (
            <ActivityIndicator color="#2dba4e" style={{ marginTop: 20 }} />
          ) : recentTransactions.length === 0 ? (
            <Text style={styles.emptyText}>No transactions found for filter.</Text>
          ) : (
            recentTransactions.map((tx) => (
              <TransactionRowItem key={tx.id} tx={tx} styles={styles} />
            ))
          )}
        </View>
      </ScrollView>

      {/* Add Bank Modal Sheet */}
      <AddBankModal
        visible={addBankModalVisible}
        onClose={() => setAddBankModalVisible(false)}
        onSuccess={async () => {
          setAddBankModalVisible(false);
          await sync();
        }}
      />

      {/* Net Worth Details Modal */}
      <NetWorthDetailsModal
        visible={netWorthModalVisible}
        onClose={() => setNetWorthModalVisible(false)}
        snapshots={snapshots}
        liveNetWorth={liveNetWorth}
        loading={false}
      />
    </View>
  );
};

// ----------------------------------------------------
// 2. AI Chatbot Screen Component
// ----------------------------------------------------
const ChatScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const chatHistory = useAIStore((state) => state.chatHistory);
  const addChatMessage = useAIStore((state) => state.addChatMessage);
  const isThinking = useAIStore((state) => state.isThinking);
  const setThinking = useAIStore((state) => state.setThinking);

  const user = useAuthStore((state) => state.user);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const goals = useGoalsStore((state) => state.goals);
  const transactions = useTransactionStore((state) => state.transactions);
  const budgets = useBudgetStore((state) => state.budgets);

  const [chatInput, setChatInput] = useState('');
  const [isListening, setIsListening] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);

  // Sync DB on screen focus
  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  // Voice Event Listeners Setup
  useEffect(() => {
    if (Platform.OS === 'web' || !Voice || typeof Voice.onSpeechStart === 'undefined') {
      return;
    }

    Voice.onSpeechStart = () => setIsListening(true);
    Voice.onSpeechEnd = () => setIsListening(false);
    Voice.onSpeechResults = (e: any) => {
      if (e.value && e.value[0]) {
        setChatInput(e.value[0]);
      }
    };
    Voice.onSpeechError = (e: any) => {
      console.error('Speech recognition error:', e);
      setIsListening(false);
    };

    return () => {
      if (Voice && typeof Voice.destroy === 'function') {
        Voice.destroy().then(Voice.removeAllListeners).catch((err: any) =>
          console.log('[Voice] Cleanup error:', err?.message)
        );
      }
    };
  }, []);

  const toggleListening = async () => {
    if (!Voice) {
      alert('Voice recognition is not supported on this platform/device.');
      return;
    }
    try {
      if (isListening) {
        await Voice.stop();
        setIsListening(false);
      } else {
        setChatInput('');
        await Voice.start('en-IN');
        setIsListening(true);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async () => {
    if (!chatInput.trim()) return;

    const query = chatInput;
    setChatInput('');

    // Add user message to history
    addChatMessage({ role: 'user', content: query });
    setThinking(true);

    // Auto scroll to bottom
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);

    try {
      // 1. User Profile Context
      const userProfileContext = {
        name: user?.name,
        email: user?.email,
        gender: user?.gender,
        dob: user?.dob,
        occupation: user?.occupation,
        currentIncome: user?.currentIncome ? Number(user.currentIncome) : undefined,
        incomeSourcesCount: user?.incomeSourcesCount,
      };

      // 2. Total Balance & Connected Accounts
      const totalBalance = bankProfiles.reduce((sum, b) => sum + (Number(b.currentBalance) || 0), 0);
      const accountsContext = bankProfiles.map((b) => ({
        bankName: b.bankName,
        accountType: 'Bank Account',
        balance: Number(b.currentBalance) || 0,
        accountNumberEnding: b.accountNumberSuffix || undefined,
      }));

      // 3. Savings Goals Context
      const goalsContext = goals.map((g) => ({
        name: g.name,
        target: Number(g.targetAmount) || 0,
        current: Number(g.currentAmount) || 0,
        targetDate: g.targetDate ? new Date(g.targetDate).toLocaleDateString('en-IN') : undefined,
      }));

      // 4. Budgets
      const budgetContext = budgets.map((b) => ({
        category: b.category,
        limit: Number(b.limitAmount) || 0,
        spent: Number(b.spentAmount) || 0,
      }));

      // 5. Recent Transactions
      const rawRecentTxs = transactions.slice(0, 15).map((t) => ({
        amount: Number(t.amount) || 0,
        category: t.category,
        merchant: t.merchant,
        timestamp: t.timestamp,
        type: (t.type === 'credit' ? 'credit' : 'debit') as 'credit' | 'debit',
      }));
      const recentTxs = sanitizeTransactions(rawRecentTxs);

      const context = {
        user: userProfileContext,
        totalBalance,
        accounts: accountsContext,
        savingsGoals: goalsContext,
        budgets: budgetContext,
        recentTransactions: recentTxs,
      };

      // Call Groq / Gemini with full live context
      const response = await askChatbot(query, chatHistory, context);
      addChatMessage({ role: 'assistant', content: response });
    } catch (e: any) {
      console.error(e);
      addChatMessage({ role: 'assistant', content: 'Connection issue. Could not contact financial helper.' });
    } finally {
      setThinking(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { paddingTop: 0 }]}
    >
      <AppTopBar />
      <View style={[styles.header, { paddingTop: 8, paddingBottom: 4 }]}>
        <Text style={styles.headerTitle}>AI Assistant</Text>
        <Text style={styles.subtitle}>Powered by Groq Ultra-Fast AI</Text>
      </View>

      {chatHistory.length === 0 ? (
        <View style={styles.chatWelcome}>
          <View style={styles.welcomeCircle}>
            <Ionicons name="chatbubble-ellipses-outline" size={40} color="#2dba4e" />
          </View>
          <Text style={styles.welcomeTitle}>Regent AI Chatbot</Text>
          <Text style={styles.welcomeText}>
            Ask financial questions instantly. Your data stays local and is anonymized before leaving the device.
          </Text>
          <View style={styles.suggestedBox}>
            <Text style={styles.suggestedTitle}>Try saying:</Text>
            <TouchableOpacity onPress={() => setChatInput('How much did I spend on Food this month?')}>
              <Text style={styles.suggestText}>"How much did I spend on Food this month?"</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setChatInput('What is my remaining budget for Shopping?')}>
              <Text style={styles.suggestText}>"What is my remaining budget for Shopping?"</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <FlatList
          ref={flatListRef}
          data={chatHistory}
          keyExtractor={(_, index) => index.toString()}
          contentContainerStyle={[styles.chatList, { paddingBottom: 100 }]}
          onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
          renderItem={({ item }) => (
            <View style={[
              styles.chatBubble,
              item.role === 'user' ? styles.userBubble : styles.botBubble
            ]}>
              <Text style={[
                styles.chatText,
                item.role === 'user' ? styles.userChatText : styles.botChatText
              ]}>
                {item.content}
              </Text>
            </View>
          )}
        />
      )}

      {isThinking && <TypingIndicator />}

      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 85 }]}>
        <TextInput
          style={styles.chatTextInput}
          placeholder={isListening ? "Listening..." : "Type a message..."}
          placeholderTextColor="#8E8E9F"
          value={chatInput}
          onChangeText={setChatInput}
          editable={!isThinking}
        />

        <TouchableOpacity
          style={[styles.micBtn, isListening && styles.micBtnActive]}
          onPress={toggleListening}
        >
          <Feather name={isListening ? "mic-off" : "mic"} size={20} color={isListening ? "#24292e" : "#2dba4e"} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.sendBtn} onPress={handleSendMessage} disabled={isThinking}>
          <Feather name="send" size={18} color="#24292e" />
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
};

// ----------------------------------------------------
// 3. Goals Screen Component
// ----------------------------------------------------
const GoalsTabScreen = () => <GoalsScreen AppTopBarComponent={AppTopBar} />;


// ----------------------------------------------------
// 4. Settings Screen Component
// ----------------------------------------------------
const SettingsScreen = () => <ProfileScreen AppTopBarComponent={AppTopBar} />;

// ----------------------------------------------------
// Connected Banks Screen
// ----------------------------------------------------
const BanksScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const [addBankModalVisible, setAddBankModalVisible] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [selectedBank, setSelectedBank] = useState<any | null>(null);
  const [detailsVisible, setDetailsVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Manual Transaction on bank card
  const [manualBank, setManualBank] = useState<any | null>(null);
  const [manualType, setManualType] = useState<'credit' | 'debit'>('credit');
  const [manualVisible, setManualVisible] = useState(false);

  const totalBalance = useMemo(() => {
    return bankProfiles.reduce((sum, bank) => sum + (Number(bank.currentBalance) || 0), 0);
  }, [bankProfiles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await sync();
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  const getBankCode = (bankName: string): string => {
    const entry = Object.entries(bankNamesJson).find(
      ([code, name]) => name.toLowerCase() === bankName.toLowerCase()
    );
    return entry ? entry[0] : '';
  };

  const handleOpenAddBank = () => {
    setAddBankModalVisible(true);
  };

  const handleRemoveBank = (id: string, bankName: string, suffix: string) => {
    showGlobalConfirm({
      title: 'Remove Bank Account',
      message: `Are you sure you want to remove your ${bankName} account ending in ${suffix}? This will unlink it from your profile.`,
      confirmText: 'Yes, Remove',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: async () => {
        setRemovingId(id);
        // Optimistically remove from store & MMKV cache immediately so UI updates
        useBankStore.getState().removeBankProfileState(id);
        try {
          const token = authService.getAccessToken();
          const backendUrl = getBackendUrl();
          const response = await fetch(`${backendUrl}/sync/bank-profile/${id}`, {
            method: 'DELETE',
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            console.warn('[Bank] Backend delete warning:', errData.message);
          }

          await sync();
        } catch (e: any) {
          console.warn('[Bank] Remove bank error:', e.message);
        } finally {
          setRemovingId(null);
        }
      },
    });
  };

  const { width } = useWindowDimensions();
  const isSmall = width < 380;

  const tabFloatingOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);
  const tabHeight = isSmall ? 58 : 64;
  const stickyButtonBottom = tabFloatingOffset + tabHeight + 16;

  return (
    <View style={styles.container}>
      <AppTopBar onOpenAddBank={handleOpenAddBank} />
      <ScrollView
        style={styles.container}
        contentContainerStyle={[
          styles.contentContainer,
          { paddingTop: 10, paddingBottom: stickyButtonBottom + 64 }
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dba4e" colors={["#2dba4e"]} />
        }
      >
        {/* Sleek Header Row */}
        <View style={{ marginBottom: 12, marginTop: 4 }}>
          <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: 0.2 }}>
            My Banks
          </Text>
        </View>

        {/* Total Balance Card - Sleek Compact Glassmorphic Card */}
        {bankProfiles.length > 0 ? (
          <View style={{
            backgroundColor: colors.card,
            borderRadius: 14,
            paddingHorizontal: 14,
            paddingVertical: 12,
            marginBottom: 12,
            borderWidth: 1.5,
            borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.35)' : 'rgba(22, 163, 74, 0.32)',
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: colors.isDark ? 0.20 : 0.08,
            shadowRadius: 8,
            elevation: 3,
          }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(22, 163, 74, 0.12)',
                  borderWidth: 1,
                  borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.25)',
                  justifyContent: 'center',
                  alignItems: 'center',
                  marginRight: 10,
                }}>
                  <MaterialCommunityIcons name="wallet-outline" size={17} color={colors.accent} />
                </View>
                <View>
                  <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    Total Balance
                  </Text>
                  <Text style={{ fontSize: 10.5, color: colors.textSecondary, opacity: 0.75, marginTop: 1 }}>
                    {bankProfiles.length === 1 ? '1 account linked' : `Across ${bankProfiles.length} accounts`}
                  </Text>
                </View>
              </View>

              <Text style={{ fontSize: 20, fontWeight: '900', color: colors.text, letterSpacing: 0.3 }}>
                ₹{totalBalance.toLocaleString('en-IN')}
              </Text>
            </View>
          </View>
        ) : null}

        {/* Bank List or Empty State */}
        {bankProfiles.length === 0 ? (
          <View style={{
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 32,
            paddingHorizontal: 20,
            backgroundColor: colors.card,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            marginTop: 4,
          }}>
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.10)',
              borderWidth: 1,
              borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.25)',
              justifyContent: 'center',
              alignItems: 'center',
              marginBottom: 12,
            }}>
              <Feather name="credit-card" size={22} color={colors.accent} />
            </View>
            <Text style={{
              color: colors.text,
              fontSize: 15,
              fontWeight: '800',
              marginBottom: 4,
              textAlign: 'center',
            }}>
              You haven't added any account
            </Text>
            <Text style={{
              color: colors.textSecondary,
              fontSize: 12,
              textAlign: 'center',
              lineHeight: 17,
              maxWidth: 260,
            }}>
              Link your bank account below to start tracking live balances, transactions, and net worth.
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 2 }}>
            {bankProfiles.map((bank) => (
              <TouchableOpacity
                key={bank.id}
                style={{
                  backgroundColor: colors.card,
                  borderRadius: 14,
                  paddingHorizontal: 12,
                  paddingVertical: 11,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: colors.isDark ? 0.25 : 0.06,
                  shadowRadius: 6,
                  elevation: 2,
                }}
                onPress={() => {
                  setSelectedBank(bank);
                  setDetailsVisible(true);
                }}
                activeOpacity={0.8}
              >
                {/* Top Row: Icon + Bank Info on Left | Balance + Trash on Right */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, marginRight: 8 }}>
                    <BankIcon code={getBankCode(bank.bankName)} name={bank.bankName} size={32} />
                    <View style={{ marginLeft: 10, flex: 1, minWidth: 0 }}>
                      <Text style={{ color: colors.text, fontSize: 13.5, fontWeight: '700' }} numberOfLines={1} ellipsizeMode="tail">
                        {bank.bankName}
                      </Text>
                      <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 1 }}>
                        Savings •••• {bank.accountNumberSuffix}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>
                      ₹{bank.currentBalance.toLocaleString('en-IN')}
                    </Text>

                    <TouchableOpacity
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        handleRemoveBank(bank.id, bank.bankName, bank.accountNumberSuffix);
                      }}
                      disabled={removingId !== null}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 7,
                        backgroundColor: colors.isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(220, 38, 38, 0.08)',
                        borderWidth: 1,
                        borderColor: colors.isDark ? 'rgba(255, 82, 82, 0.25)' : 'rgba(220, 38, 38, 0.25)',
                        justifyContent: 'center',
                        alignItems: 'center',
                        marginLeft: 4,
                      }}
                      activeOpacity={0.7}
                    >
                      {removingId === bank.id ? (
                        <ActivityIndicator size="small" color="#FF5252" />
                      ) : (
                        <Feather name="trash-2" size={13} color="#FF5252" />
                      )}
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Divider Line */}
                <View style={{
                  height: 1,
                  backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.06)' : colors.border,
                  marginVertical: 8,
                }} />

                {/* Bottom Row: Quick Actions (+ Credit / - Debit) & View details link */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(22, 163, 74, 0.08)',
                        borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.28)' : 'rgba(22, 163, 74, 0.35)',
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3.5,
                      }}
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        setManualBank(bank);
                        setManualType('credit');
                        setManualVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="plus-circle" size={11} color={colors.accent} style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: colors.accent }}>+ Credit</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: colors.isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(220, 38, 38, 0.08)',
                        borderColor: colors.isDark ? 'rgba(239, 68, 68, 0.28)' : 'rgba(220, 38, 38, 0.35)',
                        borderWidth: 1,
                        borderRadius: 6,
                        paddingHorizontal: 8,
                        paddingVertical: 3.5,
                      }}
                      onPress={(e: any) => {
                        e?.stopPropagation?.();
                        setManualBank(bank);
                        setManualType('debit');
                        setManualVisible(true);
                      }}
                      activeOpacity={0.7}
                    >
                      <Feather name="minus-circle" size={11} color="#ef4444" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#ef4444' }}>- Debit</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 11, color: colors.textSecondary, marginRight: 2, fontWeight: '600' }}>
                      Details
                    </Text>
                    <Feather name="chevron-right" size={13} color={colors.textSecondary} />
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Sticky Bottom Docked Button (Always pinned above the tab bar) */}
      <View style={{
        position: 'absolute',
        bottom: stickyButtonBottom,
        left: 20,
        right: 20,
        zIndex: 50,
      }}>
        <TouchableOpacity
          style={{
            backgroundColor: colors.accent,
            borderRadius: 12,
            height: 44,
            width: '100%',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: colors.accent,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.30,
            shadowRadius: 8,
            elevation: 6,
          }}
          onPress={handleOpenAddBank}
          activeOpacity={0.8}
        >
          <Feather name="plus-circle" size={15} color="#ffffff" style={{ marginRight: 6 }} />
          <Text style={{ color: '#ffffff', fontSize: 13.5, fontWeight: '800', letterSpacing: 0.3 }}>
            Link New Bank Account
          </Text>
        </TouchableOpacity>
      </View>

      <AddBankModal
        visible={addBankModalVisible}
        onClose={() => setAddBankModalVisible(false)}
        onSuccess={async () => {
          setAddBankModalVisible(false);
          await sync();
        }}
      />

      <BankDetailsModal
        visible={detailsVisible}
        onClose={() => setDetailsVisible(false)}
        bank={selectedBank ? bankProfiles.find((b) => b.id === selectedBank.id) || selectedBank : null}
      />

      <ManualTransactionModal
        visible={manualVisible}
        onClose={() => setManualVisible(false)}
        bank={manualBank ? bankProfiles.find((b) => b.id === manualBank.id) || manualBank : null}
        initialType={manualType}
        onSuccess={async (data) => {
          if (manualBank) {
            useBankStore.getState().updateBankBalance(manualBank.id, data.updatedBalance);
            if (data.type === 'debit' && data.record) {
              useTransactionStore.getState().addTransactionState(data.record);
            }
            await sync();
          }
        }}
      />
    </View>
  );
};

// ----------------------------------------------------
// Navigators & Navigation Container
// ----------------------------------------------------
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

interface TabItemConfig {
  label: string;
  activeIcon: keyof typeof Ionicons.glyphMap;
  inactiveIcon: keyof typeof Ionicons.glyphMap;
  size?: number;
}

const TAB_CONFIG: { [key: string]: TabItemConfig } = {
  Home: {
    label: 'Home',
    activeIcon: 'home',
    inactiveIcon: 'home-outline',
    size: 20,
  },
  Goals: {
    label: 'Goals',
    activeIcon: 'trophy',
    inactiveIcon: 'trophy-outline',
    size: 19,
  },
  Banks: {
    label: 'Banks',
    activeIcon: 'wallet',
    inactiveIcon: 'wallet-outline',
    size: 20,
  },
  'AI Chat': {
    label: 'AI Chat',
    activeIcon: 'sparkles',
    inactiveIcon: 'sparkles-outline',
    size: 20,
  },
  Settings: {
    label: 'Profile',
    activeIcon: 'person',
    inactiveIcon: 'person-outline',
    size: 20,
  },
};

const CustomTabButton = ({
  route,
  isFocused,
  onPress,
  onLongPress,
  isSmall,
  isMedium,
  isDark,
  colors,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  onLongPress: () => void;
  isSmall: boolean;
  isMedium: boolean;
  isDark: boolean;
  colors: any;
}) => {
  const user = useAuthStore((state) => state.user);
  const [isHovered, setIsHovered] = useState(false);
  const scale = useSharedValue(1);

  const config = TAB_CONFIG[route.name] || {
    label: route.name,
    activeIcon: 'apps' as const,
    inactiveIcon: 'apps-outline' as const,
    size: 20,
  };

  const iconSize = isSmall ? 18 : (config.size || 20);

  const handlePressIn = () => {
    scale.value = withSpring(0.92, { damping: 14, stiffness: 300 });
  };

  const handlePressOut = () => {
    scale.value = withSpring(1, { damping: 14, stiffness: 300 });
  };

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const pillBgColor = isFocused
    ? (isDark ? 'rgba(45, 186, 78, 0.16)' : 'rgba(22, 163, 74, 0.12)')
    : isHovered
      ? (isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.04)')
      : 'transparent';

  const pillBorderColor = isFocused
    ? (isDark ? 'rgba(45, 186, 78, 0.35)' : 'rgba(22, 163, 74, 0.28)')
    : isHovered
      ? (isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)')
      : 'transparent';

  const iconColor = isFocused
    ? (isDark ? '#2dba4e' : '#16a34a')
    : isHovered
      ? (isDark ? '#fafbfc' : '#0f172a')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#64748b');

  const textColor = isFocused
    ? (isDark ? '#2dba4e' : '#16a34a')
    : isHovered
      ? (isDark ? '#e4e4e7' : '#1e293b')
      : (isDark ? 'rgba(250, 251, 252, 0.65)' : '#475569');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onHoverIn={() => setIsHovered(true)}
      onHoverOut={() => setIsHovered(false)}
      style={[
        {
          flex: 1,
          height: '100%',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 2,
        },
        Platform.OS === 'web' && ({ cursor: 'pointer', outlineStyle: 'none' } as any),
      ]}
      accessibilityRole="button"
      accessibilityState={isFocused ? { selected: true } : {}}
      accessibilityLabel={config.label}
    >
      <Animated.View
        style={[
          {
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: isSmall ? 7 : (isMedium ? 10 : 14),
            paddingVertical: 4.5,
            borderRadius: 18,
            borderWidth: 1,
            borderColor: pillBorderColor,
            backgroundColor: pillBgColor,
            maxWidth: '96%',
            minWidth: isSmall ? 44 : 50,
          },
          isFocused && {
            shadowColor: isDark ? '#2dba4e' : '#16a34a',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: isDark ? 0.32 : 0.16,
            shadowRadius: 5,
            elevation: 2,
          },
          animatedStyle,
        ]}
      >
        {route.name === 'Settings' && !!user?.avatarUrl ? (
          <View
            style={{
              width: iconSize + 4,
              height: iconSize + 4,
              borderRadius: (iconSize + 4) / 2,
              borderWidth: 1.5,
              borderColor: isFocused
                ? (isDark ? '#2dba4e' : '#16a34a')
                : (isDark ? 'rgba(255, 255, 255, 0.28)' : 'rgba(0, 0, 0, 0.22)'),
              overflow: 'hidden',
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isDark ? '#161b22' : '#f1f5f9',
            }}
          >
            <Image
              source={{ uri: user.avatarUrl }}
              style={{
                width: iconSize + 4,
                height: iconSize + 4,
                borderRadius: (iconSize + 4) / 2,
              }}
              resizeMode="cover"
            />
          </View>
        ) : (
          <Ionicons
            name={isFocused ? config.activeIcon : config.inactiveIcon}
            size={iconSize}
            color={iconColor}
          />
        )}
        <Text
          numberOfLines={1}
          ellipsizeMode="tail"
          style={{
            color: textColor,
            fontSize: isSmall ? 8.5 : 9.5,
            fontWeight: isFocused ? '800' : '700',
            marginTop: 2,
            letterSpacing: isFocused ? 0.3 : 0.1,
          }}
        >
          {config.label}
        </Text>
      </Animated.View>
    </Pressable>
  );
};

const CustomBottomTabBar = ({ state, descriptors, navigation, insets }: BottomTabBarProps) => {
  const { colors, isDark } = useTheme();
  const { width: windowWidth } = useWindowDimensions();

  const isSmall = windowWidth < 380;
  const isMedium = windowWidth >= 380 && windowWidth < 600;

  // Responsive margins ensuring perfect clearance on all devices
  const barMarginHorizontal = isSmall ? 10 : 16;
  const maxBarWidth = 520;
  const barWidth = Math.min(windowWidth - barMarginHorizontal * 2, maxBarWidth);

  // Safe bottom offset considering home indicator and gesture navigation
  const bottomOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  return (
    <View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: bottomOffset,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
      }}
    >
      <View
        style={{
          width: barWidth,
          height: isSmall ? 58 : 64,
          borderRadius: 32,
          backgroundColor: isDark ? 'rgba(22, 27, 34, 0.97)' : colors.card,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: isSmall ? 6 : 10,
          paddingVertical: 4,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: isDark ? '#000000' : colors.shadowColor,
          shadowOffset: { width: 0, height: isDark ? 6 : 3 },
          shadowOpacity: isDark ? 0.45 : 0.08,
          shadowRadius: isDark ? 16 : 10,
          elevation: isDark ? 10 : 3,
        }}
      >
        {state.routes.map((route, index) => {
          const isFocused = state.index === index;

          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });

            if (!isFocused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          const onLongPress = () => {
            navigation.emit({
              type: 'tabLongPress',
              target: route.key,
            });
          };

          return (
            <CustomTabButton
              key={route.key}
              route={route}
              isFocused={isFocused}
              onPress={onPress}
              onLongPress={onLongPress}
              isSmall={isSmall}
              isMedium={isMedium}
              isDark={isDark}
              colors={colors}
            />
          );
        })}
      </View>
    </View>
  );
};

function TabNavigator() {
  return (
    <Tab.Navigator
      tabBar={(props) => <CustomBottomTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
      }}
    >
      <Tab.Screen name="Home" component={DashboardScreen} />
      <Tab.Screen name="Goals" component={GoalsTabScreen} />
      <Tab.Screen name="Banks" component={BanksScreen} />
      <Tab.Screen name="AI Chat" component={ChatScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: any }
> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, backgroundColor: '#0d1117', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
          <Feather name="alert-triangle" size={48} color="#f85149" style={{ marginBottom: 16 }} />
          <Text style={{ color: '#fafbfc', fontSize: 18, fontWeight: '700', marginBottom: 8, textAlign: 'center' }}>
            Something went wrong
          </Text>
          <Text style={{ color: 'rgba(250, 251, 252, 0.6)', fontSize: 12, textAlign: 'center', marginBottom: 20 }}>
            {this.state.error?.message || 'An unexpected error occurred.'}
          </Text>
          <TouchableOpacity
            style={{ backgroundColor: '#2dba4e', paddingHorizontal: 20, paddingVertical: 10, borderRadius: 12 }}
            onPress={() => this.setState({ hasError: false, error: null })}
          >
            <Text style={{ color: '#ffffff', fontWeight: '700', fontSize: 14 }}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

// ----------------------------------------------------
// Global Custom Yes/No Confirmation Dialog Component
// ----------------------------------------------------
const GlobalConfirmModal = () => {
  const { colors, isDark } = useTheme();
  const visible = useConfirmStore((state) => state.visible);
  const options = useConfirmStore((state) => state.options);
  const loading = useConfirmStore((state) => state.loading);
  const hideConfirm = useConfirmStore((state) => state.hideConfirm);
  const setLoading = useConfirmStore((state) => state.setLoading);

  const isDestructive = !!options?.isDestructive;
  const title = options?.title;
  const message = options?.message;
  const confirmText = options?.confirmText;
  const cancelText = options?.cancelText;

  const handleCancel = () => {
    if (options?.onCancel) {
      options.onCancel();
    }
    hideConfirm();
  };

  const handleConfirm = async () => {
    if (!options?.onConfirm) return;
    setLoading(true);
    try {
      await options.onConfirm();
    } catch (e: any) {
      console.warn('[Confirm] Error executing action:', e?.message || e);
    } finally {
      hideConfirm();
    }
  };

  return (
    <Modal
      visible={visible && !!options}
      transparent
      animationType="fade"
      onRequestClose={loading ? undefined : handleCancel}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
      }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={loading ? undefined : handleCancel}
        />
        <View style={{
          width: '92%',
          maxWidth: 380,
          backgroundColor: isDark ? '#1c2128' : '#ffffff',
          borderRadius: 24,
          padding: 24,
          alignItems: 'center',
          borderWidth: 1.5,
          borderColor: isDestructive ? 'rgba(255, 82, 82, 0.4)' : 'rgba(45, 186, 78, 0.4)',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 12 },
          shadowOpacity: 0.5,
          shadowRadius: 24,
          elevation: 20,
        }}>
          {/* Top Icon Badge */}
          <View style={{
            width: 64,
            height: 64,
            borderRadius: 32,
            backgroundColor: isDestructive ? 'rgba(255, 82, 82, 0.12)' : 'rgba(45, 186, 78, 0.12)',
            borderWidth: 1.5,
            borderColor: isDestructive ? 'rgba(255, 82, 82, 0.3)' : 'rgba(45, 186, 78, 0.3)',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}>
            <Feather
              name={(options?.icon as any) || (isDestructive ? 'trash-2' : 'alert-circle')}
              size={28}
              color={isDestructive ? '#FF5252' : colors.accent}
            />
          </View>

          {/* Title */}
          <Text style={{
            fontSize: 20,
            fontWeight: '800',
            color: isDark ? '#ffffff' : '#24292e',
            textAlign: 'center',
            marginBottom: 10,
            letterSpacing: -0.3,
          }}>
            {title}
          </Text>

          {/* Message */}
          <Text style={{
            fontSize: 14,
            color: isDark ? 'rgba(250, 251, 252, 0.75)' : '#57606a',
            textAlign: 'center',
            lineHeight: 22,
            marginBottom: 24,
            paddingHorizontal: 8,
          }}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 12, width: '100%' }}>
            {/* Cancel Button - only rendered when cancelText is specified */}
            {!!cancelText && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  paddingVertical: 14,
                  borderRadius: 14,
                  backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
                  borderWidth: 1,
                  borderColor: isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.1)',
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={handleCancel}
                activeOpacity={0.7}
                disabled={loading}
              >
                <Text style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: isDark ? 'rgba(250, 251, 252, 0.8)' : '#57606a',
                }}>
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}

            {/* Confirm Button */}
            <TouchableOpacity
              style={{
                flex: 1,
                paddingVertical: 14,
                borderRadius: 14,
                backgroundColor: isDestructive ? '#FF5252' : colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
                shadowColor: isDestructive ? '#FF5252' : colors.accent,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.35,
                shadowRadius: 8,
                elevation: 4,
              }}
              onPress={handleConfirm}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: '#ffffff',
                }}>
                  {confirmText || 'OK'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default function AppNavigator() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { colors, isDark } = useTheme();

  const updateInfo = useAppUpdateStore((state) => state.updateInfo);
  const updateModalVisible = useAppUpdateStore((state) => state.updateModalVisible);
  const setUpdateInfo = useAppUpdateStore((state) => state.setUpdateInfo);
  const setUpdateModalVisible = useAppUpdateStore((state) => state.setUpdateModalVisible);

  useEffect(() => {
    let isMounted = true;
    const checkUpdates = async () => {
      try {
        const info = await updateService.checkForUpdates();
        if (isMounted && info && info.isUpdateAvailable) {
          setUpdateInfo(info);
          setUpdateModalVisible(true);
        }
      } catch (e) {
        // Silent fail
      }
    };
    const timer = setTimeout(checkUpdates, 2000);
    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  useEffect(() => {
    const initAndCheck = async () => {
      await mmkvStorage.initialize();
      await rehydrateAllStores();
      // Restore persisted theme after MMKV async fallback loads
      await useThemeStore.getState().rehydrateTheme();
      await authService.checkSession();
    };
    initAndCheck();
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      const {
        biometricsEnabled,
        autoLockTimeout,
        lastBackgroundTimestamp,
        setLastBackgroundTimestamp,
        setLocked,
        isLocked,
      } = useSecurityStore.getState();

      if (!biometricsEnabled) return;

      if (nextAppState === 'background' || nextAppState === 'inactive') {
        if (!lastBackgroundTimestamp) {
          setLastBackgroundTimestamp(Date.now());
        }
      } else if (nextAppState === 'active') {
        const storedLastBg = lastBackgroundTimestamp || mmkvStorage.getNumber('security_last_bg_time');
        if (storedLastBg && !isLocked) {
          const elapsedMs = Date.now() - storedLastBg;
          const timeoutMs = autoLockTimeout * 60 * 1000;
          if (elapsedMs >= timeoutMs) {
            setLocked(true);
          }
        }
        setLastBackgroundTimestamp(null);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={colors.statusBar} />
        <View style={{
          width: 80,
          height: 80,
          borderRadius: 24,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          marginBottom: 24,
          shadowColor: colors.accent,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.15,
          shadowRadius: 10,
          elevation: 5,
        }}>
          <Image
            source={require('../../assets/icon.png')}
            style={{ width: '100%', height: '100%', borderRadius: 24 }}
          />
        </View>
        <ActivityIndicator size="small" color={colors.accent} />
        <Text style={{ color: colors.textSecondary, marginTop: 18, fontSize: 11, fontWeight: '700', letterSpacing: 2 }}>
          SECURELY RETRIEVING SESSION...
        </Text>
      </View>
    );
  }

  const navTheme = {
    dark: isDark,
    colors: {
      primary: colors.accent,
      background: colors.background,
      card: colors.card,
      text: colors.text,
      border: colors.border,
      notification: colors.accent,
    },
    fonts: {
      regular: { fontFamily: 'System', fontWeight: '400' as const },
      medium: { fontFamily: 'System', fontWeight: '500' as const },
      bold: { fontFamily: 'System', fontWeight: '700' as const },
      heavy: { fontFamily: 'System', fontWeight: '800' as const },
    },
  };

  return (
    <SafeAreaProvider>
      <StatusBar style={colors.statusBar} />
      <ErrorBoundary>
        <NavigationContainer ref={navigationRef} theme={navTheme}>
          <Stack.Navigator screenOptions={{ headerShown: false }}>
            {user === null ? (
              <>
                <Stack.Screen name="Welcome" component={WelcomeScreen} />
                <Stack.Screen name="Login" component={LoginScreen} />
                <Stack.Screen name="Signup" component={SignupScreen} />
              </>
            ) : (
              <Stack.Screen name="Main" component={TabNavigator} />
            )}
          </Stack.Navigator>
        </NavigationContainer>
        <GlobalConfirmModal />
        <BiometricLockOverlay />
        <AppSidebarDrawer />
        <UpdateModal
          updateInfo={updateInfo}
          visible={updateModalVisible}
          onDismiss={() => setUpdateModalVisible(false)}
        />
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}

// ----------------------------------------------------
// Stylesheet Definitions
// ----------------------------------------------------
const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  contentContainer: {
    paddingHorizontal: 20,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  topBarContainer: {
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    zIndex: 10,
  },
  topBarContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 7,
    minHeight: 50,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  topBarLogoBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  topBarLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 9,
  },
  topBarBrandCol: {
    marginLeft: 9,
  },
  topBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  topBarRegent: {
    fontSize: 9,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 1.5,
    marginRight: 4,
  },
  topBarMoney: {
    fontSize: 16,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 0.5,
  },
  savingPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.accentMuted,
    borderWidth: 1,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.25)' : 'rgba(22, 163, 74, 0.25)',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    marginTop: 1,
    alignSelf: 'flex-start',
  },
  savingPulseDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.accent,
    marginRight: 4,
  },
  savingPillText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 0.8,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  topBarAlertBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(255, 82, 82, 0.12)' : 'rgba(255, 82, 82, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topBarIconBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.06)' : colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  topBarBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5252',
    borderRadius: 7,
    minWidth: 15,
    height: 15,
    paddingHorizontal: 3,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarBadgeText: {
    color: '#ffffff',
    fontSize: 8.5,
    fontWeight: '800',
  },
  topBarProfileBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    borderWidth: 1.5,
    borderColor: '#2dba4e',
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBarProfileInitial: {
    color: '#2dba4e',
    fontWeight: '800',
    fontSize: 13,
  },
  dashboardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  headerLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  headerLogoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 12,
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 1,
  },
  headerTitleSmall: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
    letterSpacing: 2,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    top: -2,
    right: -2,
    backgroundColor: '#FF5252',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bellBadgeText: {
    color: '#ffffff',
    fontSize: 9,
    fontWeight: '800',
  },
  profileBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
  },
  subtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
    marginBottom: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  neonCard: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  cardHalf: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    width: '48%',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  cardBigNumber: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.text,
    marginTop: 8,
  },
  cardBigNumberSmall: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginTop: 6,
  },
  cardFooter: {
    fontSize: 11,
    color: colors.accent,
    marginTop: 8,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.border,
    borderRadius: 3,
    width: '100%',
    marginTop: 8,
  },
  progressBarFill: {
    height: 6,
    borderRadius: 3,
  },
  goalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  goalPercentage: {
    color: colors.accent,
    fontWeight: '800',
  },
  goalTargetText: {
    fontSize: 13,
    color: colors.textSecondary,
    fontWeight: '400',
  },
  settingDesc: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
    lineHeight: 18,
  },
  button: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
    marginTop: 16,
    alignItems: 'center',
    justifyContent: 'center',
    height: 46,
  },
  buttonText: {
    color: colors.buttonSecondaryText,
    fontWeight: '800',
    fontSize: 14,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  settingLabel: {
    color: colors.text,
    fontSize: 14,
  },
  filterWrapper: {
    marginBottom: 16,
  },
  sectionHeader: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  filterScroll: {
    flexDirection: 'row',
  },
  filterTab: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    marginRight: 8,
  },
  filterTabActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  filterTabText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
  },
  filterTabTextActive: {
    color: colors.buttonSecondaryText,
  },
  donutCardContainer: {
    paddingBottom: 12,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
  },
  donutLegend: {
    flex: 1,
    marginLeft: 16,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
  },
  txItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  txIconBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  txMeta: {
    justifyContent: 'center',
  },
  merchantName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  txDate: {
    color: colors.textSecondary,
    fontSize: 11,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  anomalyBadge: {
    backgroundColor: colors.buttonSecondaryBackground,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginTop: 4,
  },
  anomalyText: {
    color: colors.text,
    fontSize: 9,
    fontWeight: '800',
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 10,
  },
  chatWelcome: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 30,
  },
  welcomeCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  welcomeTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 8,
  },
  welcomeText: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  suggestedBox: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    width: '100%',
  },
  suggestedTitle: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  suggestText: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '600',
    paddingVertical: 4,
  },
  chatList: {
    padding: 16,
  },
  chatBubble: {
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    maxWidth: '85%',
  },
  userBubble: {
    backgroundColor: colors.chatSelfBubble,
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: colors.accent,
  },
  botBubble: {
    backgroundColor: colors.chatBotBubble,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
  },
  chatText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userChatText: {
    color: colors.text,
  },
  botChatText: {
    color: colors.text,
  },
  inputArea: {
    flexDirection: 'row',
    padding: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderRadius: 24,
    paddingHorizontal: 16,
    height: 42,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  micBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  micBtnActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  typingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 8,
  },
  typingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
    marginRight: 4,
  },
  sliderControl: {
    marginBottom: 14,
  },
  sliderLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
  },
  sliderBtn: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  sliderBtnText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '800',
  },
  simResults: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  simResultBox: {
    alignItems: 'center',
    width: '32%',
  },
  simResultLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  simResultVal: {
    fontSize: 12,
    fontWeight: '800',
    marginTop: 4,
  },
  keyInputSection: {
    marginTop: 12,
  },
  keyLabel: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    marginTop: 6,
  },
  settingsInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 38,
    borderWidth: 1,
    borderColor: colors.inputBorder,
  },
  saveBtn: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  bankAlertBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.isDark ? 'rgba(255, 82, 82, 0.1)' : 'rgba(255, 82, 82, 0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  badgePulseDot: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5252',
  },
  bankNotificationBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 215, 0, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 215, 0, 0.2)',
    borderRadius: 16,
    padding: 12,
    marginTop: 8,
    marginBottom: 16,
  },
  bannerText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  bannerActionBtn: {
    backgroundColor: colors.accent,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginLeft: 8,
  },
  bannerActionText: {
    color: colors.buttonSecondaryText,
    fontSize: 11,
    fontWeight: '700',
  },
  modalOverlayFull: {
    flex: 1,
    backgroundColor: 'rgba(36, 41, 46, 0.8)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  modalCardFull: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    height: '85%',
    width: '100%',
    maxWidth: 640,
  },
  searchBarContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    marginBottom: 16,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
    height: '100%',
  },
  popularSection: {
    paddingVertical: 10,
    marginBottom: 10,
  },
  sectionSubHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 14,
    letterSpacing: 0.5,
  },
  popularGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginHorizontal: -4,
  },
  popularItem: {
    width: '23%',
    alignItems: 'center',
    marginVertical: 10,
  },
  popularBadge: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  popularBadgeText: {
    color: '#fafbfc',
    fontSize: 16,
    fontWeight: '800',
  },
  popularLabel: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 14,
  },
  bankListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 64,
    marginVertical: 5,
  },
  bankIconContainer: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginRight: 14,
  },
  bankLogoBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    flexShrink: 0,
  },
  bankLogoText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  bankMeta: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
    marginRight: 10,
  },
  bankNameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  bankCodeText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  bankChevron: {
    flexShrink: 0,
    marginLeft: 'auto',
  },
  formBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  formBackText: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 6,
  },
  formFieldContainer: {
    marginBottom: 16,
  },
  formFieldLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  formInputGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
  },
  formInputIcon: {
    marginRight: 10,
  },
  formInputField: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  formInputFieldDisabled: {
    flex: 1,
    color: colors.textTertiary,
    fontSize: 14,
  },
  submitBankBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginTop: 24,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  submitBankBtnText: {
    color: colors.buttonSecondaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  bankFormHeader: {
    alignItems: 'center',
    marginVertical: 10,
  },
  bankFormTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '800',
    marginTop: 8,
  },
  bankFormSubtitle: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 82, 82, 0.1)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.2)',
    padding: 12,
    marginBottom: 20,
    width: '100%',
  },
  errorTextInline: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  verificationContainer: {
    padding: 20,
    alignItems: 'center',
  },
  verificationTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  verificationSubtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 24,
    textAlign: 'center',
  },
  verifyStepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  verifyStepText: {
    fontSize: 14,
    color: colors.text,
    marginLeft: 12,
    flex: 1,
  },
  verifyStepTextPending: {
    color: colors.textSecondary,
  },
  verifyStepTextSuccess: {
    color: colors.accent,
  },
  verifyStepTextFailed: {
    color: '#FF5252',
  },
  verificationFailureCheckbox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 20,
    padding: 12,
    backgroundColor: 'rgba(255, 82, 82, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 82, 82, 0.1)',
    width: '100%',
  },
  verificationFailureText: {
    color: '#FF5252',
    fontSize: 13,
    marginLeft: 8,
  },
  discoveredCard: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    width: '100%',
    marginTop: 16,
  },
  discoveredHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  discoveredTitleBlock: {
    marginLeft: 12,
    flex: 1,
  },
  discoveredBankName: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  discoveredAccountType: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  discoveredDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  discoveredDetailLabel: {
    fontSize: 13,
    color: colors.textSecondary,
  },
  discoveredDetailValue: {
    fontSize: 13,
    color: colors.text,
    fontWeight: '600',
  },
  discoveredSuccessText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 8,
    textAlign: 'center',
  },
  retryButton: {
    backgroundColor: colors.border,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 10,
    marginTop: 20,
  },
  retryButtonText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 14,
  },
});

const getNavStyles = (colors: any) => StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(36, 41, 46, 0.8)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  modalSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: 16,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.buttonSecondaryBackground,
    justifyContent: 'center',
    alignItems: 'center',
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 20,
  },
  largeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  largeAvatarText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 24,
  },
  profileMeta: {
    flex: 1,
  },
  profileName: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  profileEmail: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  providerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  providerBadge: {
    backgroundColor: colors.accentMuted,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  providerBadgeText: {
    color: colors.accent,
    fontSize: 10,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  metaInfoBlock: {
    backgroundColor: colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 24,
  },
  metaLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    marginVertical: 3,
  },
  metaValue: {
    color: colors.text,
    fontWeight: '700',
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.buttonSecondaryBackground,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 14,
    borderRadius: 14,
  },
  logoutBtnText: {
    color: colors.buttonSecondaryText,
    fontSize: 14,
    fontWeight: '700',
  },
});
