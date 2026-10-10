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
  Keyboard,
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
  PanResponder,
  Animated as RNAnimated,
} from 'react-native';
import { NavigationContainer, useFocusEffect, createNavigationContainerRef, useNavigation } from '@react-navigation/native';
import { createBottomTabNavigator, BottomTabBarProps } from '@react-navigation/bottom-tabs';

import { navigationRef } from './navigationRef';
export { navigationRef };
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
  FadeIn,
  runOnJS,
} from 'react-native-reanimated';
import { KeyboardAvoidingView, useKeyboardHandler } from 'react-native-keyboard-controller';
import { CartesianChart, Area, Line } from 'victory-native';
import { Canvas, ImageSVG, useSVG, LinearGradient, vec, Group, Path, Skia } from '@shopify/react-native-skia';

import { mmkvStorage } from '../db/mmkv';
import { useSyncDb } from '../services/useSyncDb';
import { GoalsScreen } from './GoalsScreen';
import { UpdateModal } from './UpdateModal';
import { AppSplashScreen } from '../components/AppSplashScreen';
import { NotificationPermissionModal } from '../components/NotificationPermissionModal';
import { SmsPermissionModal } from '../components/SmsPermissionModal';
import { TermsAndConditionsModal } from '../components/TermsAndConditionsModal';
import { smsPermissionService } from '../services/smsPermissionService';
import { updateService, UpdateInfo } from '../services/updateService';
import { ACCOUNT_TYPES } from './EditBankScreen';
import bankNamesJson from './banknames.json';
import { getExecutiveGreeting, getSessionGreeting } from '../constants/aiGreetings';
import { SmsSenderTagsManager } from '../components/SmsSenderTagsManager';
import { getSmsSenderSuggestions, formatSmsSenderTags } from '../constants/bankSmsSenders';
import { useKeyboardHeight } from '../hooks/useKeyboardHeight';
import { isExcludedFromBudget } from '../services/budgetService';

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
  showGlobalAlert,
  rehydrateAllStores,
  useSecurityStore,
  AutoLockTimeout,
  useSidebarStore,
  useAppUpdateStore,
  useTermsModalStore,
} from '../store';
import { biometricService } from '../services/biometricService';
import { BiometricLockOverlay } from '../components/BiometricLockOverlay';
import { AppSidebarDrawer } from '../components/AppSidebarDrawer';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
import { getBackendUrl } from '../config/api';
const BACKEND_URL = getBackendUrl();
import { WelcomeScreen, LoginScreen, SignupScreen, AuthLandingScreen } from './authScreens';
import { OnboardingScreen } from './OnboardingScreen';
import { syncService } from '../services/syncService';
import { BankDetailsModal } from './BankDetailsModal';
import { ProfileScreen } from './ProfileScreen';
import { EditProfileScreen } from './EditProfileScreen';
import { EditBankScreen } from './EditBankScreen';
import { ManualTransactionScreen } from './ManualTransactionScreen';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { SettingsScreen } from './SettingsScreen';
import { PrivacyCenterScreen } from './PrivacyCenterScreen';
import { SuggestFeatureScreen } from './SuggestFeatureScreen';
import { ReportBugScreen } from './ReportBugScreen';
import { BudgetScreen } from './BudgetScreen';
import { CreateBudgetScreen } from './CreateBudgetScreen';
import { smsCatchupService } from '../services/smsCatchupService';
import {
  askChatbot,
  ChatMessage
} from '../services/aiService';
import { sanitizeTransactions } from '../services/sanitizer';

// Route React Native Web alerts to Regent Money's luxury GlobalConfirmModal
if (Platform.OS === 'web') {
  Alert.alert = (title: string, message?: string, buttons?: any[]) => {
    if (!buttons || buttons.length <= 1) {
      showGlobalAlert(title, message || '', buttons?.[0]?.onPress);
    } else {
      const cancelBtn = buttons.find((b: any) => b.style === 'cancel') || buttons[0];
      const confirmBtn = buttons.find((b: any) => b !== cancelBtn) || buttons[1];
      showGlobalConfirm({
        title,
        message: message || '',
        cancelText: cancelBtn?.text || 'Cancel',
        confirmText: confirmBtn?.text || 'OK',
        isDestructive: confirmBtn?.style === 'destructive',
        icon: confirmBtn?.style === 'destructive' ? 'trash-2' : 'alert-triangle',
        onConfirm: confirmBtn?.onPress || (() => {}),
        onCancel: cancelBtn?.onPress,
      });
    }
  };
}

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
  const { colors, isDark } = useTheme();
  const { height: windowHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { keyboardHeight, isKeyboardVisible } = useKeyboardHeight();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const user = useAuthStore((state) => state.user);

  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Form inputs
  const [bankNameInput, setBankNameInput] = useState('');
  const [accountType, setAccountType] = useState('Savings');
  const [accountTypeDropdownOpen, setAccountTypeDropdownOpen] = useState(false);
  const [accountSuffix, setAccountSuffix] = useState('');
  const [balance, setBalance] = useState('');
  const [smsSenderTags, setSmsSenderTags] = useState<string[]>([]);
  const [upiId, setUpiId] = useState('');
  const [customKeywords, setCustomKeywords] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formStep, setFormStep] = useState(1);

  const handleBankBalanceChange = (t: string) => {
    if (!t) {
      setBalance('');
      if (formError) setFormError('');
      return;
    }
    let cleaned = t.replace(/[^0-9.]/g, '');
    const parts = cleaned.split('.');
    if (parts.length > 2) {
      cleaned = parts[0] + '.' + parts.slice(1).join('');
    }
    if (parts.length >= 2) {
      cleaned = parts[0] + '.' + parts[1].slice(0, 2);
    }
    setBalance(cleaned);
    if (formError) setFormError('');
  };

  const resetForm = () => {
    setSelectedBank(null);
    setSearchQuery('');
    setBankNameInput('');
    setAccountType('Savings');
    setAccountTypeDropdownOpen(false);
    setAccountSuffix('');
    setBalance('');
    setSmsSenderTags([]);
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

    // Pre-populate with known default SMS sender tags (e.g. SBIPSG, SBIBNK, SBIUPI, SBIINB)
    const suggestions = getSmsSenderSuggestions(bank.code);
    setSmsSenderTags(suggestions.length > 0 ? suggestions.slice(0, 4) : [`${bank.code}BK`]);

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
    const balanceParts = balance.split('.');
    if (balanceParts.length === 2 && balanceParts[1].length > 2) {
      setFormError('Current balance cannot have more than 2 decimal places.');
      return;
    }

    setFormError('');
    setSubmitting(true);

    try {
      const token = authService.getAccessToken();
      if (!token) {
        throw new Error('No access token found');
      }

      const cleanBalance = Math.round(parseFloat(balance) * 100) / 100;
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
          accountType: accountType || 'Savings',
          accountNumberSuffix: accountSuffix.trim(),
          currentBalance: cleanBalance,
          smsSenderId: formatSmsSenderTags(smsSenderTags) || undefined,
          upiId: upiId.trim() || undefined,
          customKeywords: customKeywords.trim() || undefined,
          smsConsent: true,
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

  const modalHeight = useMemo(() => {
    if (isKeyboardVisible) {
      const topOffset = Platform.OS === 'android' ? Math.max(insets.top, 36) : (insets.top + 20);
      const availableHeight = windowHeight - keyboardHeight - topOffset;
      return Math.min(windowHeight * 0.85, Math.max(280, availableHeight));
    }
    return windowHeight * 0.85;
  }, [isKeyboardVisible, windowHeight, keyboardHeight, insets.top]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
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
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={() => {
            if (isKeyboardVisible) {
              Keyboard.dismiss();
            } else {
              if (formStep === 2) {
                setFormStep(1);
                setFormError('');
              } else {
                resetForm();
                onClose();
              }
            }
          }}
        />
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          pointerEvents="box-none"
          style={[
            { width: '100%', alignItems: 'center', justifyContent: 'flex-end' },
            Platform.OS === 'android' && isKeyboardVisible && { paddingBottom: keyboardHeight },
          ]}
        >
          <View
            style={[
              styles.modalCardFull,
              {
                height: modalHeight,
                maxHeight: modalHeight,
                paddingTop: isKeyboardVisible ? 16 : 24,
                paddingBottom: isKeyboardVisible ? 12 : 24,
              },
            ]}
          >
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
                  contentContainerStyle={{ paddingBottom: isKeyboardVisible ? 40 : 20 }}
                  keyboardDismissMode="on-drag"
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
              <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                keyboardDismissMode="on-drag"
                contentContainerStyle={{ paddingBottom: isKeyboardVisible ? 60 : Math.max(insets.bottom, 24) + 24 }}
              >
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
                      <Feather name="home" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                      <TextInput
                        style={styles.formInputField}
                        placeholder="e.g. HDFC Bank"
                        placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                        value={bankNameInput}
                        onChangeText={setBankNameInput}
                      />
                    </View>
                  </View>

                  {/* Account Type Dropdown */}
                  <View style={styles.formFieldContainer}>
                    <Text style={styles.formFieldLabel}>Account Type</Text>
                    <TouchableOpacity
                      style={[
                        styles.formInputGroup,
                        { justifyContent: 'space-between', paddingVertical: 13 },
                        accountTypeDropdownOpen && { borderColor: colors.accent },
                      ]}
                      onPress={() => setAccountTypeDropdownOpen(!accountTypeDropdownOpen)}
                      activeOpacity={0.7}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Feather name="credit-card" size={16} color={colors.accent} style={styles.formInputIcon} />
                        <Text style={{ fontSize: 14, color: colors.text, fontWeight: '600' }}>
                          {ACCOUNT_TYPES.find((t) => t.id === accountType)?.label || `${accountType} Account`}
                        </Text>
                      </View>
                      <Feather
                        name={accountTypeDropdownOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color={colors.textSecondary}
                      />
                    </TouchableOpacity>

                    {accountTypeDropdownOpen && (
                      <View
                        style={{
                          marginTop: 6,
                          backgroundColor: isDark ? '#14141e' : '#f8fafc',
                          borderWidth: 1,
                          borderColor: colors.border,
                          borderRadius: 14,
                          overflow: 'hidden',
                        }}
                      >
                        {ACCOUNT_TYPES.map((type, idx) => {
                          const isSelected = accountType === type.id;
                          return (
                            <TouchableOpacity
                              key={type.id}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                paddingVertical: 12,
                                paddingHorizontal: 14,
                                backgroundColor: isSelected
                                  ? isDark
                                    ? 'rgba(45, 186, 78, 0.15)'
                                    : 'rgba(22, 163, 74, 0.12)'
                                  : 'transparent',
                                borderBottomWidth: idx < ACCOUNT_TYPES.length - 1 ? 1 : 0,
                                borderBottomColor: isDark
                                  ? 'rgba(255, 255, 255, 0.06)'
                                  : colors.border,
                              }}
                              onPress={() => {
                                setAccountType(type.id);
                                setAccountTypeDropdownOpen(false);
                              }}
                              activeOpacity={0.7}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                <Feather
                                  name={type.icon as any}
                                  size={15}
                                  color={isSelected ? colors.accent : colors.textSecondary}
                                  style={{ marginRight: 10 }}
                                />
                                <Text
                                  style={{
                                    fontSize: 13,
                                    fontWeight: isSelected ? '700' : '500',
                                    color: isSelected ? colors.accent : colors.text,
                                  }}
                                >
                                  {type.label}
                                </Text>
                              </View>
                              {isSelected && <Feather name="check" size={16} color={colors.accent} />}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>

                  {/* Suffix Input */}
                  <View style={styles.formFieldContainer}>
                    <Text style={styles.formFieldLabel}>Last 4 Digits of Account Number</Text>
                    <View style={styles.formInputGroup}>
                      <Feather name="hash" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                      <TextInput
                        style={styles.formInputField}
                        placeholder="e.g. 5678"
                        placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
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
                      <MaterialCommunityIcons name="currency-inr" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                      <TextInput
                        style={styles.formInputField}
                        placeholder="e.g. 75000"
                        placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                        keyboardType="decimal-pad"
                        value={balance}
                        onChangeText={handleBankBalanceChange}
                      />
                    </View>
                  </View>

                  {/* SMS Sender Tags Manager */}
                  <View style={styles.formFieldContainer}>
                    <SmsSenderTagsManager
                      tags={smsSenderTags}
                      onChangeTags={setSmsSenderTags}
                      bankCodeOrName={selectedBank?.code || bankNameInput}
                      colors={colors}
                      isDark={isDark}
                      label="SMS SENDER CODES / HEADERS"
                      hint="Transactions from any of these sender codes (e.g. SBIPSG, SBIBNK) will be automatically read."
                    />
                  </View>

                  {/* UPI ID Input */}
                  <View style={styles.formFieldContainer}>
                    <Text style={styles.formFieldLabel}>Associated UPI ID (Optional)</Text>
                    <View style={styles.formInputGroup}>
                      <Feather name="at-sign" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                      <TextInput
                        style={styles.formInputField}
                        placeholder="e.g. success@okhdfcbank"
                        placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                        value={upiId}
                        onChangeText={setUpiId}
                        autoCapitalize="none"
                      />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 }}>
                      Used for mapping UPI payment transaction notifications.
                    </Text>
                  </View>

                  {/* Custom Keywords Input */}
                  <View style={styles.formFieldContainer}>
                    <Text style={styles.formFieldLabel}>Custom Matching Keywords (Optional)</Text>
                    <View style={styles.formInputGroup}>
                      <Feather name="key" size={16} color={colors.textSecondary} style={styles.formInputIcon} />
                      <TextInput
                        style={styles.formInputField}
                        placeholder="e.g. HDFC, credit card, salary"
                        placeholderTextColor={isDark ? 'rgba(250, 251, 252, 0.4)' : colors.textTertiary}
                        value={customKeywords}
                        onChangeText={setCustomKeywords}
                      />
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 11, marginTop: 4, lineHeight: 15 }}>
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
        </KeyboardAvoidingView>
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

export const SPENDING_CHART_COLORS: Record<string, string> = {
  food: '#f59e0b',          // Warm Amber Orange
  dining: '#f59e0b',
  restaurant: '#f59e0b',
  groceries: '#10b981',     // Vibrant Emerald Green
  supermarket: '#10b981',
  shopping: '#ec4899',      // Magenta / Vivid Pink
  clothing: '#ec4899',
  entertainment: '#a855f7', // Electric Purple
  movies: '#a855f7',
  travel: '#0284c7',        // Sky Blue
  flight: '#0284c7',
  transport: '#06b6d4',     // Cyan
  cab: '#06b6d4',
  fuel: '#f43f5e',          // Coral / Rose
  bills: '#eab308',         // Gold / Yellow
  utilities: '#eab308',     // Gold / Yellow
  electricity: '#eab308',
  recharge: '#06b6d4',      // Cyan
  medical: '#ef4444',       // Crimson Red
  health: '#ef4444',
  education: '#14b8a6',     // Teal
  investments: '#16a34a',   // Bright Green
  self_transfer: '#6366f1', // Royal Indigo
  services: '#8b5cf6',      // Violet
  personal: '#d946ef',      // Fuchsia
  miscellaneous: '#64748b', // Slate Gray
  other: '#94a3b8',         // Neutral Slate
};

export const PALETTE_FALLBACK = [
  '#f59e0b', // Amber
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#f43f5e', // Rose
  '#a855f7', // Purple
  '#eab308', // Gold
  '#14b8a6', // Teal
  '#0284c7', // Sky Blue
  '#64748b', // Slate Gray
];

export const getSpendingCategoryColor = (categoryKey: string, _isDark?: boolean, index = 0): string => {
  const cleanKey = categoryKey.toLowerCase().trim();
  return SPENDING_CHART_COLORS[cleanKey] || PALETTE_FALLBACK[index % PALETTE_FALLBACK.length];
};

interface SpendingDonutChartProps {
  data: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
}

const SpendingDonutChart: React.FC<SpendingDonutChartProps> = ({
  data,
  size = 156,
  strokeWidth = 14,
}) => {
  const { colors, isDark } = useTheme();

  const total = useMemo(() => {
    return data.reduce((sum, item) => sum + (item.value || 0), 0);
  }, [data]);

  // Leave room for outer percentage badges around the ring
  const ringPadding = 44;
  const radius = (size - ringPadding) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const rect = useMemo(() => ({
    x: cx - radius,
    y: cy - radius,
    width: 2 * radius,
    height: 2 * radius,
  }), [cx, cy, radius]);

  // Generate Skia Arc Paths for Native
  const slicePaths = useMemo(() => {
    if (Platform.OS === 'web' || !Skia?.Path || total <= 0) return null;
    try {
      let currentAngle = -90; // Start at 12 o'clock
      const isSingleSlice = data.length === 1;
      const gap = isSingleSlice ? 0 : 3; // 3-degree clean separation between slices

      return data.map((item) => {
        const path = Skia.Path.Make();
        const sweepAngle = (item.value / total) * 360;

        if (isSingleSlice || sweepAngle >= 359.5) {
          path.addCircle(cx, cy, radius);
        } else {
          const effectiveSweep = Math.max(1, sweepAngle - gap);
          path.addArc(rect, currentAngle + gap / 2, effectiveSweep);
        }
        currentAngle += sweepAngle;
        return { path, color: item.color };
      });
    } catch (err) {
      console.warn('Error generating Skia donut paths:', err);
      return null;
    }
  }, [data, total, rect, cx, cy, radius]);

  const bgTrackPath = useMemo(() => {
    if (Platform.OS === 'web' || !Skia?.Path) return null;
    try {
      const p = Skia.Path.Make();
      p.addCircle(cx, cy, radius);
      return p;
    } catch {
      return null;
    }
  }, [cx, cy, radius]);

  // Calculate percentage badges positioned right outside each ring section
  const percentageLabels = useMemo(() => {
    if (total <= 0 || data.length === 0) return [];

    let currentAngle = -90;
    const rawBadges: Array<{
      pctText: string;
      color: string;
      angle: number;
      label: string;
    }> = [];

    // Provide percentage badges for all slices up to top 5 (matching the legend)
    data.forEach((item, index) => {
      const sweepAngle = (item.value / total) * 360;
      const pct = (item.value / total) * 100;
      const midAngleDeg = currentAngle + sweepAngle / 2;

      if (index < 5 && item.value > 0) {
        // Exact decimal percentage up to 2 decimal places (e.g. 52.10%, 28.76%, 16.81%, 2.12%, 0.21%)
        const pctText = pct <= 0 ? '0%' : (pct % 1 === 0 ? `${pct}%` : `${pct.toFixed(2)}%`);
        rawBadges.push({
          pctText,
          color: item.color,
          angle: midAngleDeg,
          label: item.label,
        });
      }

      currentAngle += sweepAngle;
    });

    if (rawBadges.length === 0) return [];

    // Multi-pass angular relaxation to guarantee adjacent badges never overlap
    const minGapDeg = 30;
    const adjustedAngles = rawBadges.map((b) => b.angle);

    for (let pass = 0; pass < 12; pass++) {
      for (let i = 0; i < adjustedAngles.length; i++) {
        for (let j = i + 1; j < adjustedAngles.length; j++) {
          let diff = adjustedAngles[j] - adjustedAngles[i];
          while (diff > 180) diff -= 360;
          while (diff < -180) diff += 360;

          if (Math.abs(diff) < minGapDeg) {
            const overlap = minGapDeg - Math.abs(diff);
            const push = overlap / 2;
            if (diff >= 0) {
              adjustedAngles[i] -= push;
              adjustedAngles[j] += push;
            } else {
              adjustedAngles[i] += push;
              adjustedAngles[j] += push;
            }
          }
        }
      }
    }

    const labelRadius = radius + strokeWidth / 2 + 10;
    return rawBadges.map((badge, idx) => {
      const rad = (adjustedAngles[idx] * Math.PI) / 180;
      return {
        pctText: badge.pctText,
        color: badge.color,
        x: cx + labelRadius * Math.cos(rad),
        y: cy + labelRadius * Math.sin(rad),
        label: badge.label,
      };
    });
  }, [data, total, radius, strokeWidth, cx, cy]);

  // Web or Fallback conic gradient
  const webGradient = useMemo(() => {
    if (total <= 0) return colors.border;
    let currentDeg = 0;
    const stops: string[] = [];
    data.forEach((d) => {
      const sweep = (d.value / total) * 360;
      const start = currentDeg;
      const end = currentDeg + sweep;
      stops.push(`${d.color} ${start.toFixed(1)}deg ${end.toFixed(1)}deg`);
      currentDeg = end;
    });
    return stops.length > 0 ? `conic-gradient(${stops.join(', ')})` : colors.accent;
  }, [data, total, colors.border, colors.accent]);

  if (total <= 0) {
    return null;
  }

  // Native rendering with Skia
  if (Platform.OS !== 'web' && slicePaths) {
    return (
      <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
        <Canvas style={{ width: size, height: size }}>
          {bgTrackPath && (
            <Path
              path={bgTrackPath}
              style="stroke"
              strokeWidth={strokeWidth}
              color={isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)'}
            />
          )}
          {slicePaths.map((slice, i) => (
            <Path
              key={i}
              path={slice.path}
              style="stroke"
              strokeWidth={strokeWidth}
              color={slice.color}
            />
          ))}
        </Canvas>

        {/* Center Spent Amount Label */}
        <View
          style={[
            StyleSheet.absoluteFill,
            { justifyContent: 'center', alignItems: 'center' },
          ]}
          pointerEvents="none"
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Spent
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 1 }}>
            ₹{total >= 100000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString('en-IN')}
          </Text>
        </View>

        {/* Outer Percentage Badges */}
        {percentageLabels.map((lbl, i) => (
          <View
            key={`pct-${i}`}
            style={{
              position: 'absolute',
              left: lbl.x,
              top: lbl.y,
              transform: [{ translateX: -17 }, { translateY: -9 }],
              backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
              borderColor: lbl.color,
              borderWidth: 1.5,
              borderRadius: 8,
              paddingHorizontal: 4,
              paddingVertical: 1,
              minWidth: 32,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: isDark ? lbl.color : '#000',
              shadowOffset: { width: 0, height: 1 },
              shadowOpacity: isDark ? 0.35 : 0.12,
              shadowRadius: 3,
              elevation: 4,
              zIndex: 10,
            }}
            pointerEvents="none"
          >
            <Text
              numberOfLines={1}
              style={{
                fontSize: 8.5,
                fontWeight: '800',
                color: lbl.color,
                letterSpacing: -0.2,
              }}
            >
              {lbl.pctText}
            </Text>
          </View>
        ))}
      </View>
    );
  }

  // Web & Resilient Fallback rendering (CSS conic-gradient donut)
  const ringDiameter = radius * 2 + strokeWidth;
  const innerCutout = radius * 2 - strokeWidth;
  return (
    <View style={{ width: size, height: size, justifyContent: 'center', alignItems: 'center', position: 'relative' }}>
      <View
        style={{
          width: ringDiameter,
          height: ringDiameter,
          borderRadius: ringDiameter / 2,
          // @ts-ignore
          backgroundImage: webGradient,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            width: innerCutout,
            height: innerCutout,
            borderRadius: innerCutout / 2,
            backgroundColor: colors.card,
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 9, fontWeight: '700', color: colors.textSecondary, letterSpacing: 0.5, textTransform: 'uppercase' }}>
            Spent
          </Text>
          <Text style={{ fontSize: 13, fontWeight: '800', color: colors.text, marginTop: 1 }}>
            ₹{total >= 100000 ? `${(total / 1000).toFixed(1)}k` : total.toLocaleString('en-IN')}
          </Text>
        </View>
      </View>

      {/* Outer Percentage Badges */}
      {percentageLabels.map((lbl, i) => (
        <View
          key={`pct-web-${i}`}
          style={{
            position: 'absolute',
            left: lbl.x,
            top: lbl.y,
            transform: [{ translateX: -17 }, { translateY: -9 }],
            backgroundColor: isDark ? 'rgba(15, 23, 42, 0.95)' : '#ffffff',
            borderColor: lbl.color,
            borderWidth: 1.5,
            borderRadius: 8,
            paddingHorizontal: 4,
            paddingVertical: 1,
            minWidth: 32,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: isDark ? lbl.color : '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: isDark ? 0.35 : 0.12,
            shadowRadius: 3,
            elevation: 4,
            zIndex: 10,
          }}
          pointerEvents="none"
        >
          <Text
            numberOfLines={1}
            style={{
              fontSize: 8.5,
              fontWeight: '800',
              color: lbl.color,
              letterSpacing: -0.2,
            }}
          >
            {lbl.pctText}
          </Text>
        </View>
      ))}
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
    await notificationService.markAllAsRead();
  };

  useEffect(() => {
    if (visible && unreadCount > 0) {
      notificationService.markAllAsRead();
    }
  }, [visible, unreadCount]);

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
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      if (isUnread) {
                        notificationService.markAsRead(item.id);
                      }
                    }}
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
                  </TouchableOpacity>
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
      .filter((tx) => tx.timestamp >= startOfMonth && tx.type !== 'credit' && !isExcludedFromBudget(tx))
      .reduce((sum, tx) => sum + (parseFloat(tx.amount) || 0), 0);
  }, [transactions]);

  // Donut chart category grouping (with double-drilldown into merchants when category is selected)
  // Strictly excludes self-transfers and non-spending transfers
  const donutData = useMemo(() => {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const filteredTxs = transactions.filter(
      (tx) =>
        tx.timestamp >= startOfMonth &&
        tx.type !== 'credit' &&
        !isExcludedFromBudget(tx) &&
        (filterCategory === null || tx.category === filterCategory)
    );

    const map: { [key: string]: number } = {};
    filteredTxs.forEach((tx) => {
      const key = (filterCategory === null ? tx.category : tx.merchant) || 'Other';
      map[key] = (map[key] || 0) + Math.abs(tx.amount || 0);
    });

    const entries = Object.entries(map).filter(([_, val]) => val > 0);
    entries.sort((a, b) => b[1] - a[1]);

    return entries.map(([key, value], index) => {
      const formattedLabel = key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
      const cleanKey = key.toLowerCase().trim();
      const color = getSpendingCategoryColor(cleanKey, isDark, index);

      return {
        label: formattedLabel,
        value,
        color,
      };
    });
  }, [transactions, filterCategory, isDark]);

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

        {/* Spending Breakdown Donut Chart */}
        {donutData.length > 0 && (
          <View style={[styles.card, styles.donutCardContainer]}>
            <Text style={styles.chartTitle}>
              {filterCategory === null ? 'Spending breakdown' : `${filterCategory.toUpperCase()} breakdown`}
            </Text>
            <View style={styles.donutRow}>
              <View style={{ width: 156, height: 156, justifyContent: 'center', alignItems: 'center' }}>
                <SpendingDonutChart data={donutData} size={156} strokeWidth={14} />
              </View>
              <View style={styles.donutLegend}>
                {donutData.slice(0, 5).map((item, index) => (
                  <View key={index} style={styles.legendItem}>
                    <View style={[styles.legendIndicator, { backgroundColor: item.color }]} />
                    <Text style={[styles.legendText, { color: colors.textSecondary }]} numberOfLines={1}>
                      {item.label}: <Text style={{ color: colors.text, fontWeight: '700' }}>₹{item.value.toLocaleString('en-IN')}</Text>
                    </Text>
                  </View>
                ))}
                {donutData.length > 5 && (
                  <Text style={{ fontSize: 10, color: colors.textSecondary, marginTop: 2, fontStyle: 'italic' }}>
                    +{donutData.length - 5} more categories
                  </Text>
                )}
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
// 2. Regent AIbot Screen Component
// ----------------------------------------------------
const ChatScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();
  const { width: windowWidth } = useWindowDimensions();

  const isSmall = windowWidth < 380;
  const navBarHeight = isSmall ? 58 : 64;
  const bottomOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);
  const navBarClearance = bottomOffset + navBarHeight;

  const chatHistory = useAIStore((state) => state.chatHistory);
  const addChatMessage = useAIStore((state) => state.addChatMessage);
  const clearChatHistory = useAIStore((state) => state.clearChatHistory);
  const isThinking = useAIStore((state) => state.isThinking);
  const setThinking = useAIStore((state) => state.setThinking);

  const user = useAuthStore((state) => state.user);
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const goals = useGoalsStore((state) => state.goals);
  const transactions = useTransactionStore((state) => state.transactions);
  const budgets = useBudgetStore((state) => state.budgets);

  const [chatInput, setChatInput] = useState('');
  const [executiveGreeting, setExecutiveGreeting] = useState(() => getSessionGreeting(user?.name));

  useEffect(() => {
    if (user?.name) {
      setExecutiveGreeting(getSessionGreeting(user.name));
    }
  }, [user?.name]);

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);
  const inputRef = React.useRef<TextInput>(null);

  useKeyboardHandler(
    {
      onStart: (e) => {
        'worklet';
        runOnJS(setIsKeyboardVisible)(e.height > 0);
      },
      onEnd: (e) => {
        'worklet';
        runOnJS(setIsKeyboardVisible)(e.height > 0);
      },
    },
    []
  );

  useEffect(() => {
    if (Platform.OS === 'web') {
      const showSub = Keyboard.addListener('keyboardDidShow', () => setIsKeyboardVisible(true));
      const hideSub = Keyboard.addListener('keyboardDidHide', () => setIsKeyboardVisible(false));
      return () => {
        showSub.remove();
        hideSub.remove();
      };
    }
  }, []);

  useEffect(() => {
    if (isKeyboardVisible) {
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 80);
    }
  }, [isKeyboardVisible]);

  // Responsive bottom clearance:
  // - When keyboard is open: StandaloneBottomTabBar is hidden, and KeyboardAvoidingView handles the lift.
  //   Input bar only needs clean resting clearance (8px).
  // - When keyboard is closed: Input bar rests cleanly above the floating bottom tab bar (navBarClearance + 8).
  const dynamicBottomPadding = useMemo(() => {
    if (Platform.OS === 'web') {
      return navBarClearance + 8;
    }
    return isKeyboardVisible ? 8 : (navBarClearance + 8);
  }, [isKeyboardVisible, navBarClearance]);

  // Sync DB on screen focus
  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  const handleSendQuery = async (queryText?: string) => {
    const textToSend = (queryText || chatInput).trim();
    if (!textToSend || isThinking) return;

    setChatInput('');
    Keyboard.dismiss();

    addChatMessage({ role: 'user', content: textToSend });
    setThinking(true);

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

      const response = await askChatbot(textToSend, chatHistory, context);
      addChatMessage({ role: 'assistant', content: response });
    } catch (e: any) {
      console.error(e);
      addChatMessage({
        role: 'assistant',
        content: 'Connection issue. Could not contact financial assistant.',
      });
    } finally {
      setThinking(false);
      setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  const handleClearChat = () => {
    showGlobalConfirm({
      title: 'Clear Chat History',
      message: 'Are you sure you want to clear your conversation with Regent AI?',
      confirmText: 'Clear Chat',
      cancelText: 'Cancel',
      isDestructive: true,
      icon: 'trash-2',
      onConfirm: () => {
        clearChatHistory();
      },
    });
  };

  const EXECUTIVE_PROMPTS = [
    {
      id: 'liquidity',
      icon: 'briefcase',
      title: 'Total Liquidity & Balances',
      query: 'What is my total liquidity across all connected bank accounts?',
    },
    {
      id: 'cashflow',
      icon: 'activity',
      title: 'Cash Flow & Burn Rate',
      query: 'Analyze my net cash flow and monthly burn rate this month.',
    },
    {
      id: 'budgets',
      icon: 'target',
      title: 'Budget & Capital Allocation',
      query: 'Review my remaining budget and category spending limits.',
    },
    {
      id: 'expenses',
      icon: 'trending-down',
      title: 'Top Expense Analysis',
      query: 'What are my largest single transactions and expenses recently?',
    },
    {
      id: 'inflows',
      icon: 'dollar-sign',
      title: 'Income & Credit Inflow',
      query: 'Summarize all credit deposits and salary inflows this month.',
    },
    {
      id: 'goals',
      icon: 'award',
      title: 'Savings & Wealth Goals',
      query: 'What is my progress toward my active savings targets?',
    },
    {
      id: 'recurring',
      icon: 'repeat',
      title: 'Recurring Subscriptions & Bills',
      query: 'Identify all my recurring payments and utility charges.',
    },
    {
      id: 'lifestyle',
      icon: 'coffee',
      title: 'Dining & Lifestyle Spending',
      query: 'How much have I spent on food, dining, and travel recently?',
    },
    {
      id: 'networth',
      icon: 'pie-chart',
      title: 'Monthly Net Worth Snapshot',
      query: 'Calculate my total estimated net worth across all accounts.',
    },
    {
      id: 'tax',
      icon: 'zap',
      title: 'Financial Optimization Tips',
      query: 'Provide 3 actionable tips to optimize my monthly cash flow.',
    },
    {
      id: 'security',
      icon: 'shield',
      title: 'Anomaly & Security Check',
      query: 'Were there any unusual spikes or suspicious transactions?',
    },
  ];

  const [cardIndex, setCardIndex] = useState(0);
  const pan = React.useRef(new RNAnimated.ValueXY()).current;

  const cardRotate = pan.x.interpolate({
    inputRange: [-200, 0, 200],
    outputRange: ['-8deg', '0deg', '8deg'],
    extrapolate: 'clamp',
  });

  const cardOpacity = pan.x.interpolate({
    inputRange: [-200, -100, 0, 100, 200],
    outputRange: [0.6, 0.9, 1, 0.9, 0.6],
    extrapolate: 'clamp',
  });

  const nextCard = useCallback(() => {
    pan.setValue({ x: 0, y: 0 });
    setCardIndex((prev) => (prev + 1) % (EXECUTIVE_PROMPTS.length + 1));
  }, [pan, EXECUTIVE_PROMPTS.length]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gesture) => {
          return Math.abs(gesture.dx) > 10 && Math.abs(gesture.dy) < 30;
        },
        onPanResponderMove: (_, gesture) => {
          pan.setValue({ x: gesture.dx, y: 0 });
        },
        onPanResponderRelease: (_, gesture) => {
          if (gesture.dx < -40) {
            RNAnimated.timing(pan, {
              toValue: { x: -350, y: 0 },
              duration: 180,
              useNativeDriver: false,
            }).start(() => nextCard());
          } else if (gesture.dx > 40) {
            RNAnimated.timing(pan, {
              toValue: { x: 350, y: 0 },
              duration: 180,
              useNativeDriver: false,
            }).start(() => nextCard());
          } else {
            RNAnimated.spring(pan, {
              toValue: { x: 0, y: 0 },
              friction: 6,
              useNativeDriver: false,
            }).start();
          }
        },
      }),
    [pan, nextCard]
  );

  const currentCard = EXECUTIVE_PROMPTS[cardIndex];
  const nextCard1 = cardIndex < EXECUTIVE_PROMPTS.length ? EXECUTIVE_PROMPTS[(cardIndex + 1) % EXECUTIVE_PROMPTS.length] : null;
  const nextCard2 = cardIndex < EXECUTIVE_PROMPTS.length ? EXECUTIVE_PROMPTS[(cardIndex + 2) % EXECUTIVE_PROMPTS.length] : null;

  return (
    <View style={[styles.container, { paddingTop: 0 }]}>
      <AppTopBar />

      <KeyboardAvoidingView
        behavior="padding"
        style={{ flex: 1 }}
      >
        {/* Minimalist Executive Header */}
        <View style={styles.chatHeaderRow}>
          <Text style={styles.headerTitle}>Regent AI</Text>

          {chatHistory.length > 0 && (
            <TouchableOpacity
              style={styles.chatResetBtn}
              onPress={handleClearChat}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="rotate-ccw" size={15} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>

        {/* Content Body: Empty State or Active Messages */}
        {chatHistory.length === 0 ? (
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={styles.welcomeScroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Executive Greeting */}
            <View style={styles.welcomeHero}>
              <View style={styles.welcomeAvatar}>
                <Image
                  source={require('../../assets/tree.png')}
                  style={styles.welcomeAvatarImage}
                  resizeMode="contain"
                />
              </View>
              <Text style={styles.execGreetingTitle}>{executiveGreeting}</Text>
              {/* <Text style={styles.execGreetingSub}>
                Executive intelligence across your accounts, cash flow, and budgets.
              </Text> */}
            </View>

            {/* Stacked Card Deck (11 cards) or End-Of-Deck Card */}
            {cardIndex < EXECUTIVE_PROMPTS.length ? (
              <View style={{ width: '100%', alignItems: 'center' }}>
                <View style={styles.deckContainer}>
                  {/* 3rd Card Behind */}
                  {nextCard2 && (
                    <View
                      style={[
                        styles.deckCardBehind,
                        {
                          top: 18,
                          transform: [{ scale: 0.90 }],
                          opacity: 0.35,
                          zIndex: 1,
                        },
                      ]}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={nextCard2.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory} numberOfLines={1}>{nextCard2.title}</Text>
                        <Text style={styles.suggestPrompt} numberOfLines={1}>{nextCard2.query}</Text>
                      </View>
                    </View>
                  )}

                  {/* 2nd Card Behind */}
                  {nextCard1 && (
                    <View
                      style={[
                        styles.deckCardBehind,
                        {
                          top: 9,
                          transform: [{ scale: 0.95 }],
                          opacity: 0.65,
                          zIndex: 2,
                        },
                      ]}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={nextCard1.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory} numberOfLines={1}>{nextCard1.title}</Text>
                        <Text style={styles.suggestPrompt} numberOfLines={1}>{nextCard1.query}</Text>
                      </View>
                    </View>
                  )}

                  {/* Active Front Card (Swipeable) */}
                  <RNAnimated.View
                    style={[
                      styles.deckCardFront,
                      {
                        transform: [{ translateX: pan.x }, { rotate: cardRotate }],
                        opacity: cardOpacity,
                        zIndex: 5,
                      },
                    ]}
                    {...panResponder.panHandlers}
                  >
                    <TouchableOpacity
                      style={styles.cardInnerTouchable}
                      onPress={() => handleSendQuery(currentCard.query)}
                      activeOpacity={0.8}
                    >
                      <View style={styles.suggestIconBox}>
                        <Feather name={currentCard.icon as any} size={16} color={colors.accent} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.suggestCategory}>{currentCard.title}</Text>
                        <Text style={styles.suggestPrompt}>{currentCard.query}</Text>
                      </View>
                      <Feather name="arrow-up-right" size={16} color={colors.accent} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  </RNAnimated.View>
                </View>

                <Text style={styles.deckSwipeHint}>
                  Swipe left or right for next suggestion
                </Text>
              </View>
            ) : (
              /* End of Suggestions State */
              <View style={styles.endDeckCard}>
                <View style={styles.endIconCircle}>
                  <Feather name="check" size={20} color={colors.accent} />
                </View>
                <Text style={styles.endTitle}>All suggestions explored</Text>
                <Text style={styles.endSub}>
                  Type your custom question below or replay executive suggestions.
                </Text>
                <View style={styles.endActionRow}>
                  <TouchableOpacity
                    style={styles.endBtnPrimary}
                    onPress={() => {
                      setCardIndex(0);
                      pan.setValue({ x: 0, y: 0 });
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="rotate-ccw" size={14} color="#ffffff" style={{ marginRight: 6 }} />
                    <Text style={styles.endBtnPrimaryText}>Start Over</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.endBtnSecondary}
                    onPress={() => inputRef.current?.focus()}
                    activeOpacity={0.8}
                  >
                    <Feather name="edit-3" size={14} color={colors.text} style={{ marginRight: 6 }} />
                    <Text style={styles.endBtnSecondaryText}>Ask Myself</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={chatHistory}
            keyExtractor={(_, index) => index.toString()}
            contentContainerStyle={styles.chatList}
            keyboardShouldPersistTaps="handled"
            onScrollBeginDrag={Keyboard.dismiss}
            onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
            renderItem={({ item }) => {
              const isUser = item.role === 'user';
              return (
                <View style={{ flexDirection: 'row', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: 12 }}>
                  {!isUser && (
                    <View style={styles.chatAvatarBadge}>
                      <Ionicons name="sparkles" size={13} color={colors.accent} />
                    </View>
                  )}
                  <View
                    style={[
                      styles.chatBubble,
                      isUser ? styles.userBubble : styles.botBubble,
                    ]}
                  >
                    <Text
                      style={[
                        styles.chatText,
                        isUser ? styles.userChatText : styles.botChatText,
                      ]}
                      selectable
                    >
                      {item.content}
                    </Text>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* Typing Indicator */}
        {isThinking && <TypingIndicator />}

        {/* Clean Input Bar */}
        <View
          style={[
            styles.inputArea,
            { paddingBottom: dynamicBottomPadding },
          ]}
        >
          <View style={styles.inputAreaRow}>
            <TextInput
              ref={inputRef}
              style={styles.chatTextInput}
              placeholder="Ask Regent AI..."
              placeholderTextColor="#8E8E9F"
              value={chatInput}
              onChangeText={setChatInput}
              editable={!isThinking}
              returnKeyType="send"
              onSubmitEditing={() => handleSendQuery()}
              onFocus={() => {
                setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 150);
              }}
            />

            <TouchableOpacity
              style={[
                styles.sendBtn,
                (!chatInput.trim() || isThinking) && styles.sendBtnDisabled,
              ]}
              onPress={() => handleSendQuery()}
              disabled={!chatInput.trim() || isThinking}
              activeOpacity={0.8}
            >
              {isThinking ? (
                <ActivityIndicator size="small" color="#24292e" />
              ) : (
                <Feather
                  name="send"
                  size={18}
                  color={!chatInput.trim() ? colors.textSecondary : '#24292e'}
                />
              )}
            </TouchableOpacity>
          </View>

          {/* AI Disclaimer below search bar */}
          <Text style={styles.aiDisclaimerText}>
            Regent can make mistakes. Please check info.
          </Text>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
};

// ----------------------------------------------------
// 3. Goals Screen Component
// ----------------------------------------------------
const GoalsTabScreen = () => <GoalsScreen AppTopBarComponent={AppTopBar} />;

// ----------------------------------------------------
// 3b. Budgets Screen Component
// ----------------------------------------------------
const BudgetTabScreen = () => <BudgetScreen AppTopBarComponent={AppTopBar} />;

const BudgetStackScreen = ({ navigation }: any) => {
  useEffect(() => {
    navigation.replace('Main', { screen: 'Budgets' });
  }, [navigation]);
  return <BudgetScreen AppTopBarComponent={AppTopBar} />;
};

const CreateBudgetStackScreen = () => <CreateBudgetScreen AppTopBarComponent={AppTopBar} />;


// ----------------------------------------------------
// 4. Settings Screen Component
// ----------------------------------------------------
const TabProfileScreen = () => <ProfileScreen AppTopBarComponent={AppTopBar} />;

// ----------------------------------------------------
// Connected Banks Screen
// ----------------------------------------------------
const BanksScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { sync } = useSyncDb();

  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const activeBankModalId = useBankStore((state) => state.activeBankModalId);
  const setActiveBankModalId = useBankStore((state) => state.setActiveBankModalId);
  const [addBankModalVisible, setAddBankModalVisible] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const totalBalance = useMemo(() => {
    return bankProfiles.reduce((sum, bank) => sum + (Number(bank.currentBalance) || 0), 0);
  }, [bankProfiles]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      // Home screen pull-to-refresh: fast scan of the last 10 minutes only
      await smsCatchupService.reconcile(true, 10 / 60).catch(() => { });
      await sync();
    } finally {
      setRefreshing(false);
    }
  }, [sync]);

  useFocusEffect(
    useCallback(() => {
      sync();
      if (Platform.OS === 'android') {
        const dynamicHours = smsCatchupService.getDynamicStartupLookback();
        smsCatchupService.reconcile(false, dynamicHours).catch(() => { });
      }
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
                  setActiveBankModalId(bank.id);
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
                        {bank.accountType || 'Savings'} •••• {bank.accountNumberSuffix}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '800' }}>
                      ₹{bank.currentBalance.toLocaleString('en-IN')}
                    </Text>
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
                        navigation.navigate('ManualTransaction', { bank, initialType: 'credit' });
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
                        navigation.navigate('ManualTransaction', { bank, initialType: 'debit' });
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
        visible={!!activeBankModalId}
        onClose={() => setActiveBankModalId(null)}
        bank={activeBankModalId ? bankProfiles.find((b) => b.id === activeBankModalId) || null : null}
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
  Budgets: {
    label: 'Budgets',
    activeIcon: 'pie-chart',
    inactiveIcon: 'pie-chart-outline',
    size: 19,
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
  'Regent': {
    label: 'Regent',
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
            paddingHorizontal: isSmall ? 2 : (isMedium ? 6 : 10),
            paddingVertical: 4,
            maxWidth: '96%',
            minWidth: isSmall ? 36 : 46,
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
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  const isSmall = windowWidth < 380;
  const isMedium = windowWidth >= 380 && windowWidth < 600;

  // Responsive margins ensuring perfect clearance on all devices
  const barMarginHorizontal = isSmall ? 10 : 16;
  const maxBarWidth = 560;
  const barWidth = Math.min(windowWidth - barMarginHorizontal * 2, maxBarWidth);

  // Safe bottom offset considering home indicator and gesture navigation
  const bottomOffset = Platform.OS === 'web'
    ? 18
    : Math.max(insets.bottom + (Platform.OS === 'ios' ? 4 : 8), 16);

  return (
    <View
      style={{
        pointerEvents: isKeyboardVisible ? 'none' : (Platform.OS === 'web' ? 'auto' : 'box-none'),
        position: 'absolute',
        bottom: bottomOffset,
        left: 0,
        right: 0,
        alignItems: 'center',
        zIndex: 1000,
        opacity: isKeyboardVisible ? 0 : 1,
        transform: [{ translateY: isKeyboardVisible ? 120 : 0 }],
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
            if (Platform.OS === 'web' && typeof document !== 'undefined' && document.activeElement instanceof HTMLElement) {
              try {
                document.activeElement.blur();
              } catch { }
            }

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
      <Tab.Screen name="Budgets" component={BudgetTabScreen} />
      <Tab.Screen name="Goals" component={GoalsTabScreen} />
      <Tab.Screen name="Banks" component={BanksScreen} />
      <Tab.Screen name="Regent" component={ChatScreen} />
      <Tab.Screen name="Settings" component={TabProfileScreen} />
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

  if (!visible || !options) {
    return null;
  }

  const isDestructive = !!options.isDestructive;
  const title = options.title;
  const message = options.message;
  const confirmText = options.confirmText;
  const cancelText = options.cancelText;

  const handleCancel = () => {
    if (options.onCancel) {
      options.onCancel();
    }
    hideConfirm();
  };

  const handleConfirm = async () => {
    if (!options.onConfirm) return;
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
      visible={true}
      transparent
      animationType={Platform.OS === 'web' ? 'none' : 'fade'}
      onRequestClose={loading ? undefined : handleCancel}
    >
      <View style={{
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
      }}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={loading ? undefined : handleCancel}
        />
        <View style={{
          width: '84%',
          maxWidth: 310,
          backgroundColor: colors.card,
          borderRadius: 18,
          paddingTop: 18,
          paddingBottom: 16,
          paddingHorizontal: 18,
          alignItems: 'center',
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
          shadowColor: '#000000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: isDark ? 0.4 : 0.12,
          shadowRadius: 16,
          elevation: 10,
        }}>
          {/* Top Icon Badge */}
          <View style={{
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: isDestructive
              ? (isDark ? 'rgba(239, 68, 68, 0.12)' : '#FEE2E2')
              : (isDark ? 'rgba(16, 185, 129, 0.12)' : '#D1FAE5'),
            borderWidth: 1,
            borderColor: isDestructive
              ? (isDark ? 'rgba(239, 68, 68, 0.25)' : '#FCA5A5')
              : (isDark ? 'rgba(16, 185, 129, 0.25)' : '#A7F3D0'),
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 10,
          }}>
            <Feather
              name={(options?.icon as any) || (isDestructive ? 'trash-2' : 'alert-circle')}
              size={18}
              color={isDestructive ? '#EF4444' : colors.accent}
            />
          </View>

          {/* Title */}
          {!!title && (
            <Text style={{
              fontSize: 15,
              fontWeight: '700',
              color: colors.text,
              textAlign: 'center',
              marginBottom: 5,
              letterSpacing: -0.2,
            }}>
              {title}
            </Text>
          )}

          {/* Message */}
          <Text style={{
            fontSize: 12.5,
            lineHeight: 18,
            color: colors.textSecondary,
            textAlign: 'center',
            marginBottom: 16,
            paddingHorizontal: 2,
          }}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
            {/* Cancel Button - only rendered when cancelText is specified */}
            {!!cancelText && (
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 38,
                  borderRadius: 10,
                  backgroundColor: colors.buttonSecondaryBackground,
                  borderWidth: 1,
                  borderColor: colors.border,
                  justifyContent: 'center',
                  alignItems: 'center',
                }}
                onPress={handleCancel}
                activeOpacity={0.75}
                disabled={loading}
              >
                <Text style={{
                  fontSize: 12.5,
                  fontWeight: '600',
                  color: colors.text,
                }}>
                  {cancelText}
                </Text>
              </TouchableOpacity>
            )}

            {/* Confirm Button */}
            <TouchableOpacity
              style={{
                flex: 1,
                height: 38,
                borderRadius: 10,
                backgroundColor: isDestructive ? '#EF4444' : colors.accent,
                justifyContent: 'center',
                alignItems: 'center',
              }}
              onPress={handleConfirm}
              activeOpacity={0.8}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={{
                  fontSize: 12.5,
                  fontWeight: '600',
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

  const [splashFinished, setSplashFinished] = useState(false);
  const hasSeenOnboarding = mmkvStorage.getBoolean('has_seen_onboarding_v1') ?? false;

  const updateInfo = useAppUpdateStore((state) => state.updateInfo);
  const updateModalVisible = useAppUpdateStore((state) => state.updateModalVisible);
  const setUpdateInfo = useAppUpdateStore((state) => state.setUpdateInfo);
  const setUpdateModalVisible = useAppUpdateStore((state) => state.setUpdateModalVisible);
  const [notificationModalVisible, setNotificationModalVisible] = useState(false);
  const [smsModalVisible, setSmsModalVisible] = useState(false);

  const termsModalState = useTermsModalStore();
  const isTermsAccepted = Boolean(user?.termsAccepted);
  const showMandatoryTerms = Boolean(user && !isTermsAccepted && splashFinished && !isLoading);
  const showTermsModal = showMandatoryTerms || termsModalState.isOpen;
  const isReadOnlyTerms = Boolean(isTermsAccepted && termsModalState.isOpen);

  useEffect(() => {
    if (!splashFinished || isLoading || !user || !user.termsAccepted || Platform.OS === 'web') return;

    let timer: any = null;
    const checkPermissionsFlow = async () => {
      try {
        // 1. Check SMS permission first (core real-time auto-tracking feature)
        const isSmsGranted = await smsPermissionService.isPermissionGranted();
        if (!isSmsGranted && !smsPermissionService.hasBeenPrompted()) {
          timer = setTimeout(() => {
            setSmsModalVisible(true);
          }, 1000);
          return;
        }

        // 2. Then check Notification permission
        const isNotificationGranted = await notificationService.isPermissionGranted();
        if (isNotificationGranted) {
          await notificationService.registerForPushNotifications();
        } else if (!notificationService.hasBeenPrompted()) {
          timer = setTimeout(() => {
            setNotificationModalVisible(true);
          }, 1200);
        }
      } catch (e) {
        // Silent fail
      }
    };

    checkPermissionsFlow();
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [splashFinished, isLoading, user]);

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
      // Sync notifications with backend
      notificationService.fetchNotifications().catch(() => { });
      // Auto-scan recent SMS on Android once session and stores are completely hydrated
      if (Platform.OS === 'android') {
        setTimeout(() => {
          const dynamicHours = smsCatchupService.getDynamicStartupLookback();
          smsCatchupService.reconcile(false, dynamicHours).catch((err) => {
            console.warn('[AppRoot] Initial SMS catchup notice:', err);
          });
        }, 1500);
      }
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

      if (nextAppState === 'active') {
        // Automatic catch-up scan dynamically calculated from last active time
        const dynamicHours = smsCatchupService.getDynamicStartupLookback();
        smsCatchupService.reconcile(false, dynamicHours).catch(() => { });
      }

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

  if (isLoading && splashFinished) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={colors.statusBar} />
        <ActivityIndicator size="small" color={colors.accent} />
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
        {!isLoading && (
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <Stack.Navigator screenOptions={{ headerShown: false }}>
              {user === null ? (
                <>
                  {!hasSeenOnboarding ? (
                    <>
                      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                      <Stack.Screen name="Welcome" component={WelcomeScreen} />
                      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
                    </>
                  ) : (
                    <>
                      <Stack.Screen name="AuthLanding" component={AuthLandingScreen} />
                      <Stack.Screen name="Welcome" component={WelcomeScreen} />
                      <Stack.Screen name="Onboarding" component={OnboardingScreen} />
                    </>
                  )}
                  <Stack.Screen name="Login" component={LoginScreen} />
                  <Stack.Screen name="Signup" component={SignupScreen} />
                </>
              ) : (
                <>
                  <Stack.Screen name="Main" component={TabNavigator} />
                  <Stack.Screen
                    name="EditProfile"
                    component={EditProfileScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="EditBank"
                    component={EditBankScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="ManualTransaction"
                    component={ManualTransactionScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="TransactionDetail"
                    component={TransactionDetailScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="AppSettings"
                    component={SettingsScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="PrivacyCenter"
                    component={PrivacyCenterScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="SuggestFeature"
                    component={SuggestFeatureScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="ReportBug"
                    component={ReportBugScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="BudgetScreen"
                    component={BudgetStackScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_right',
                      headerShown: false,
                    }}
                  />
                  <Stack.Screen
                    name="CreateBudget"
                    component={CreateBudgetStackScreen}
                    options={{
                      presentation: 'card',
                      animation: 'slide_from_bottom',
                      headerShown: false,
                    }}
                  />
                </>
              )}
            </Stack.Navigator>
          </NavigationContainer>
        )}
        <GlobalConfirmModal />
        <BiometricLockOverlay />
        <AppSidebarDrawer />
        <UpdateModal
          updateInfo={updateInfo}
          visible={updateModalVisible}
          onDismiss={() => setUpdateModalVisible(false)}
        />
        <TermsAndConditionsModal
          visible={showTermsModal}
          readOnly={isReadOnlyTerms}
          onDismiss={() => termsModalState.closeTermsModal()}
        />
        <NotificationPermissionModal
          visible={notificationModalVisible}
          onDismiss={() => setNotificationModalVisible(false)}
        />
        <SmsPermissionModal
          visible={smsModalVisible}
          onDismiss={() => {
            setSmsModalVisible(false);
            if (!notificationService.hasBeenPrompted()) {
              setTimeout(() => setNotificationModalVisible(true), 800);
            }
          }}
          onGranted={() => {
            setSmsModalVisible(false);
            if (!notificationService.hasBeenPrompted()) {
              setTimeout(() => setNotificationModalVisible(true), 800);
            }
          }}
        />
        {!splashFinished && (
          <AppSplashScreen onFinish={() => setSplashFinished(true)} />
        )}
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
    paddingBottom: 14,
  },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
  },
  donutLegend: {
    flex: 1,
    marginLeft: 28,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 7,
  },
  legendIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 10,
    flexShrink: 0,
  },
  legendText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 1,
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
  chatHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 8,
  },
  chatResetBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  welcomeScroll: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingBottom: 24,
  },
  welcomeHero: {
    alignItems: 'center',
    marginBottom: 24,
  },
  welcomeAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.isDark ? '#1e293b' : '#ffffff',
    borderWidth: 1.2,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.35)' : 'rgba(45, 186, 78, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: colors.isDark ? 0.3 : 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  welcomeAvatarImage: {
    width: 44,
    height: 44,
    transform: [{ scale: 1.25 }],
  },
  execGreetingTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.isDark ? '#e2e8f0' : '#475569',
    letterSpacing: -0.2,
    marginBottom: 6,
    textAlign: 'center',
    paddingHorizontal: 16,
    lineHeight: 24,
  },
  execGreetingSub: {
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
    maxWidth: 340,
    textAlign: 'center',
  },
  deckContainer: {
    width: '100%',
    height: 122,
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
    marginTop: 6,
  },
  deckCardBehind: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 104,
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
    flexDirection: 'row',
    alignItems: 'center',
  },
  deckCardFront: {
    width: '100%',
    height: 104,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1.2,
    borderColor: colors.isDark ? 'rgba(45, 186, 78, 0.4)' : 'rgba(22, 163, 74, 0.3)',
    shadowColor: colors.shadowColor,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: colors.isDark ? 0.35 : 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  cardInnerTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
  },
  suggestIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  suggestCategory: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 3,
  },
  suggestPrompt: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  deckControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    marginTop: 18,
  },
  deckArrowBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  deckPaginationBadge: {
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.04)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  deckPaginationText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    letterSpacing: 0.5,
  },
  deckSwipeHint: {
    fontSize: 11,
    color: colors.textTertiary || '#8E8E9F',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '500',
  },
  endDeckCard: {
    width: '100%',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  endIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  endTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
    marginBottom: 4,
    textAlign: 'center',
  },
  endSub: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 17,
    marginBottom: 16,
    maxWidth: 280,
  },
  endActionRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  endBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    paddingVertical: 10,
    borderRadius: 12,
  },
  endBtnPrimaryText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
  endBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    borderRadius: 12,
  },
  endBtnSecondaryText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chatList: {
    padding: 16,
    paddingBottom: 20,
  },
  chatAvatarBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.accent,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
    marginTop: 4,
  },
  chatBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '82%',
  },
  userBubble: {
    backgroundColor: colors.isDark ? '#1b3b27' : '#dcfce7',
    alignSelf: 'flex-end',
    borderWidth: 1,
    borderColor: colors.accent,
    borderBottomRightRadius: 4,
  },
  botBubble: {
    backgroundColor: colors.card,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: colors.border,
    borderBottomLeftRadius: 4,
  },
  chatText: {
    fontSize: 14,
    lineHeight: 21,
  },
  userChatText: {
    color: colors.text,
    fontWeight: '500',
  },
  botChatText: {
    color: colors.text,
  },
  inputArea: {
    paddingHorizontal: 16,
    paddingTop: 8,
    backgroundColor: colors.card,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  inputAreaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aiDisclaimerText: {
    fontSize: 11,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 2,
    letterSpacing: 0.1,
  },
  chatTextInput: {
    flex: 1,
    backgroundColor: colors.inputBackground,
    color: colors.text,
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 44,
    maxHeight: 90,
    fontSize: 14,
    borderWidth: 1,
    borderColor: colors.inputBorder,
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
  sendBtnDisabled: {
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
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
    ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
  },
  modalCardFull: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
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
