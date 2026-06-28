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
  Alert
} from 'react-native';
import { NavigationContainer, useFocusEffect } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
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
  FadeIn
} from 'react-native-reanimated';
import { CartesianChart, Area, PolarChart, Pie, Line } from 'victory-native';
import { Canvas, ImageSVG, useSVG, LinearGradient, vec, Group } from '@shopify/react-native-skia';
import Voice from '@react-native-voice/voice';

import { mmkvStorage } from '../db/mmkv';
import { useSyncDb } from '../services/useSyncDb';
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
  'YESB': require('../../assets/Banks logo/yesb.svg'),
};

const LocalSvgIcon = ({ source, size }: { source: any; size: number }) => {
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

const BankIcon = ({ code, name, size = 38 }: { code: string; name: string; size?: number }) => {
  const cleanCode = code ? code.toUpperCase() : '';
  const localSource = LOCAL_SVG_MAP[cleanCode];

  if (localSource) {
    return (
      <View style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: '#ffffff',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden'
      }}>
        <LocalSvgIcon source={localSource} size={size} />
      </View>
    );
  }

  // Consistent fallback logo for other banks: white background and symbols in green (#2dba4e)
  return (
    <View style={{
      width: size,
      height: size,
      borderRadius: size / 2,
      backgroundColor: '#ffffff',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: 'rgba(45, 186, 78, 0.15)',
    }}>
      <MaterialCommunityIcons name="bank" size={size * 0.55} color="#2dba4e" />
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
  useNotificationStore
} from '../store';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
import { notificationService } from '../services/notificationService';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
import { WelcomeScreen, LoginScreen, SignupScreen } from './authScreens';
import { syncService } from '../services/syncService';
import { BankDetailsModal } from './BankDetailsModal';
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

const AddBankModal = ({ visible, onClose, onSuccess }: AddBankModalProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const user = useAuthStore((state) => state.user);

  const [banksList, setBanksList] = useState<{ [key: string]: string }>(bankNamesJson as { [key: string]: string });
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
    if (!visible) {
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

  const sortedAllBanks = useMemo(() => {
    return Object.entries(banksList)
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [banksList]);

  const filteredBanks = useMemo(() => {
    if (!searchQuery.trim()) {
      return sortedAllBanks;
    }
    const query = searchQuery.toLowerCase();
    return sortedAllBanks.filter(bank => 
      bank.name.toLowerCase().includes(query) || 
      bank.code.toLowerCase().includes(query)
    );
  }, [sortedAllBanks, searchQuery]);

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
        } else {
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
              onPress={onClose} 
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
                      <BankIcon code={item.code} name={item.name} size={38} />
                      <View style={styles.bankMeta}>
                        <Text style={styles.bankNameText} numberOfLines={1}>{item.name}</Text>
                        <Text style={styles.bankCodeText}>{item.code}</Text>
                      </View>
                      <Feather name="chevron-right" size={16} color="#8E8E9F" />
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

const DashboardScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [notificationsVisible, setNotificationsVisible] = useState(false);
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
    if (bankProfiles.length >= 3) {
      Alert.alert(
        'Limit Reached',
        'You can link a maximum of 3 bank accounts. Please remove an existing account first.',
        [{ text: 'OK' }]
      );
      return;
    }
    setAddBankModalVisible(true);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await syncService.sync();
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

  const [snapshots, setSnapshots] = useState<any[]>([]);
  const [loadingSnapshots, setLoadingSnapshots] = useState(false);
  const [incomeCurrentMonth, setIncomeCurrentMonth] = useState(95000);

  // Fetch data on screen focus
  useFocusEffect(
    useCallback(() => {
      sync();
      fetchSnapshots();
      fetchIncome();
    }, [sync])
  );

  const fetchSnapshots = async () => {
    setLoadingSnapshots(true);
    try {
      const user = useAuthStore.getState().user;
      const token = authService.getAccessToken();
      if (!user || !token) return;
      
      const response = await fetch(`${BACKEND_URL}/sync/net-worth-snapshots`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Sync API returned error status');
      const data = await response.json();
      
      const sorted = [...(data || [])].sort((a: any, b: any) => Number(a.timestamp) - Number(b.timestamp));
      setSnapshots(sorted.map((s: any) => ({
        timestamp: Number(s.timestamp),
        netWorth: parseFloat(s.netWorth ?? s.net_worth ?? 0),
        monthLabel: new Date(Number(s.timestamp)).toLocaleDateString('en-IN', { month: 'short' }),
      })));
    } catch (e) {
      console.error('Error fetching snapshots:', e);
    } finally {
      setLoadingSnapshots(false);
    }
  };

  const fetchIncome = async () => {
    try {
      const user = useAuthStore.getState().user;
      const token = authService.getAccessToken();
      if (!user || !token) return;
      
      const response = await fetch(`${BACKEND_URL}/sync/income-records`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Sync API returned error status');
      const data = await response.json();
      
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const currentMonthIncome = (data || [])
        .filter((inc: any) => Number(inc.timestamp) >= startOfMonth)
        .reduce((sum: number, inc: any) => sum + parseFloat(inc.amount || 0), 0);
      setIncomeCurrentMonth(currentMonthIncome || 95000);
    } catch (e) {
      console.error(e);
    }
  };

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
      <ScrollView 
        style={styles.container} 
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dba4e" colors={["#2dba4e"]} />
        }
      >
        {/* Header */}
        <View style={styles.dashboardHeader}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.headerLogoBadge}>
              <Image 
                source={require('../../assets/icon.png')} 
                style={styles.headerLogoImage}
              />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.headerTitleSmall}>REGENT</Text>
              <Text style={styles.headerTitle}>MONEY</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bankProfiles.length === 0 && (
              <TouchableOpacity 
                style={[styles.bankAlertBtn, { marginRight: 12 }]} 
                onPress={handleOpenAddBank}
                activeOpacity={0.7}
              >
                <Feather name="alert-circle" size={18} color="#FF5252" />
                <View style={styles.badgePulseDot} />
              </TouchableOpacity>
            )}
            {/* Notifications Bell */}
            <TouchableOpacity 
              style={[styles.bellBtn, { marginRight: 12 }]} 
              onPress={() => setNotificationsVisible(true)}
              activeOpacity={0.7}
            >
              <Feather name="bell" size={20} color={colors.text} />
              {unreadCount > 0 && (
                <View style={styles.bellBadge}>
                  <Text style={styles.bellBadgeText}>{unreadCount}</Text>
                </View>
              )}
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.profileBtn} 
              onPress={() => setProfileModalVisible(true)}
              activeOpacity={0.7}
            >
              {user?.name ? (
                <Text style={{ color: '#2dba4e', fontWeight: '800', fontSize: 13 }}>
                  {user.name.charAt(0).toUpperCase()}
                </Text>
              ) : (
                <Feather name="user" size={20} color="#2dba4e" />
              )}
            </TouchableOpacity>
          </View>
        </View>

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
            <View style={{ width: 140, height: 140 }}>
              <PolarChart
                data={donutData}
                labelKey="label"
                valueKey="value"
                colorKey="color"
              >
                <Pie.Chart innerRadius="65%" />
              </PolarChart>
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
        {isLoading ? (
          <ActivityIndicator color="#2dba4e" style={{ marginTop: 20 }} />
        ) : recentTransactions.length === 0 ? (
          <Text style={styles.emptyText}>No transactions found for filter.</Text>
        ) : (
          recentTransactions.map((tx) => (
            <View key={tx.id} style={styles.txItem}>
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
          ))
        )}
      </View>
    </ScrollView>

    {/* Profile Modal Sheet */}
    <Modal
      visible={profileModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => setProfileModalVisible(false)}
    >
      <View style={navStyles.modalOverlay}>
        <View style={navStyles.modalCard}>
          <View style={navStyles.modalHeader}>
            <Text style={navStyles.modalTitle}>User Profile</Text>
            <TouchableOpacity onPress={() => setProfileModalVisible(false)} style={navStyles.closeBtn}>
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
              setProfileModalVisible(false);
              authService.logOut();
            }}
          >
            <Feather name="log-out" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
            <Text style={navStyles.logoutBtnText}>Log Out Session</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>

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
      loading={loadingSnapshots}
    />

    {/* Notifications Modal */}
    <NotificationsModal
      visible={notificationsVisible}
      onClose={() => setNotificationsVisible(false)}
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
    if (!Voice) {
      console.warn('[Voice] Voice module is not available on this platform/device.');
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
      if (Voice) {
        Voice.destroy().then(Voice.removeAllListeners).catch((err: any) => 
          console.log('[Voice] Cleanup error:', err.message)
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
      // Gather sanitized Context
      const rawRecentTxs = transactions.slice(0, 10).map((t) => ({
        amount: t.amount,
        category: t.category,
        merchant: t.merchant,
        timestamp: t.timestamp,
        type: 'debit' as const
      }));

      const recentTxs = sanitizeTransactions(rawRecentTxs);

      const budgetContext = budgets.map((b) => ({
        category: b.category,
        limit: b.limitAmount,
        spent: b.spentAmount
      }));

      const context = {
        budgets: budgetContext,
        recentTransactions: recentTxs
      };

      // Call Groq
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
      style={[styles.container, { paddingTop: insets.top }]}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>AI Assistant</Text>
        <Text style={styles.subtitle}>Powered by Groq Llama 3</Text>
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
// 3. Goals Screen & Compound Interest Simulator
// ----------------------------------------------------
const GoalsScreen = () => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const goals = useGoalsStore((state) => state.goals);

  // Simulator values
  const [monthlyContribution, setMonthlyContribution] = useState(5000);
  const [expectedReturn, setExpectedReturn] = useState(12); // in %
  const [duration, setDuration] = useState(15); // in years

  useFocusEffect(
    useCallback(() => {
      sync();
    }, [sync])
  );

  // Generate Compound Interest projection points for Line Chart
  const projectionData = useMemo(() => {
    const data = [];
    const monthlyRate = expectedReturn / 12 / 100;
    
    for (let i = 0; i <= duration; i++) {
      const months = i * 12;
      let totalValue = 0;
      if (monthlyRate > 0 && months > 0) {
        totalValue = monthlyContribution * ((Math.pow(1 + monthlyRate, months) - 1) / monthlyRate);
      } else if (months > 0) {
        totalValue = monthlyContribution * months;
      }
      const totalInvested = monthlyContribution * months;
      data.push({
        year: i,
        value: Math.round(totalValue),
        invested: totalInvested,
      });
    }
    return data;
  }, [monthlyContribution, expectedReturn, duration]);

  const latestStats = useMemo(() => {
    const last = projectionData[projectionData.length - 1];
    if (last) {
      return {
        total: last.value,
        invested: last.invested,
        gained: Math.max(0, last.value - last.invested),
      };
    }
    return { total: 0, invested: 0, gained: 0 };
  }, [projectionData]);

  // Adjust sliders
  const changeContribution = (val: number) => {
    setMonthlyContribution((prev) => Math.max(0, prev + val));
  };
  
  const changeReturn = (val: number) => {
    setExpectedReturn((prev) => Math.min(30, Math.max(1, prev + val)));
  };

  const changeDuration = (val: number) => {
    setDuration((prev) => Math.min(40, Math.max(1, prev + val)));
  };

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
    >
      <Text style={styles.headerTitle}>Savings Goals</Text>
      <Text style={styles.subtitle}>Grow your money automatically</Text>

      {/* Goal Cards */}
      {goals.length === 0 ? (
        <View style={styles.card}>
          <Text style={styles.emptyText}>No goals set. Click "Seed Mock Data" in settings.</Text>
        </View>
      ) : (
        goals.map((goal) => {
          const progress = Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100));
          return (
            <View key={goal.id} style={styles.card}>
              <View style={styles.goalHeader}>
                <Text style={styles.cardTitle}>{goal.name}</Text>
                <Text style={styles.goalPercentage}>{progress}%</Text>
              </View>
              <Text style={styles.cardBigNumberSmall}>
                ₹{goal.currentAmount.toLocaleString('en-IN')}{' '}
                <Text style={styles.goalTargetText}>of ₹{goal.targetAmount.toLocaleString('en-IN')}</Text>
              </Text>
              <View style={styles.progressBarBg}>
                <View style={[styles.progressBarFill, { width: `${progress}%`, backgroundColor: '#2dba4e' }]} />
              </View>
            </View>
          );
        })
      )}

      {/* Simulator Section */}
      <Text style={[styles.headerTitle, { marginTop: 24 }]}>What-If Simulator</Text>
      <Text style={styles.subtitle}>Visualize compound interest curves</Text>

      <View style={styles.card}>
        <Text style={styles.chartTitle}>Wealth Simulator Projection</Text>
        
        {/* Sliders (using custom touch handlers since standard sliders look basic) */}
        <View style={styles.sliderControl}>
          <Text style={styles.sliderLabel}>Monthly Contribution: ₹{monthlyContribution.toLocaleString('en-IN')}</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeContribution(-1000)}>
              <Text style={styles.sliderBtnText}>-1K</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeContribution(5000)}>
              <Text style={styles.sliderBtnText}>+5K</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeContribution(10000)}>
              <Text style={styles.sliderBtnText}>+10K</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sliderControl}>
          <Text style={styles.sliderLabel}>Expected Annual Return: {expectedReturn}%</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeReturn(-1)}>
              <Text style={styles.sliderBtnText}>-1%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeReturn(1)}>
              <Text style={styles.sliderBtnText}>+1%</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeReturn(5)}>
              <Text style={styles.sliderBtnText}>+5%</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.sliderControl}>
          <Text style={styles.sliderLabel}>Duration: {duration} Years</Text>
          <View style={styles.sliderRow}>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeDuration(-1)}>
              <Text style={styles.sliderBtnText}>-1Yr</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeDuration(1)}>
              <Text style={styles.sliderBtnText}>+1Yr</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.sliderBtn} onPress={() => changeDuration(5)}>
              <Text style={styles.sliderBtnText}>+5Yrs</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Projection Chart */}
        <View style={{ height: 160, marginTop: 20 }}>
          <CartesianChart
            data={projectionData}
            xKey="year"
            yKeys={["value", "invested"]}
          >
            {({ points }) => (
              <>
                 <Line points={points.value} color="#2dba4e" strokeWidth={3} animate={{ type: "timing", duration: 250 }} />
                 <Line points={points.invested} color="rgba(250, 251, 252, 0.5)" strokeWidth={2} animate={{ type: "timing", duration: 250 }} />
              </>
            )}
          </CartesianChart>
        </View>

        {/* Simulation Outputs */}
        <View style={styles.simResults}>
          <View style={styles.simResultBox}>
            <Text style={styles.simResultLabel}>Total Invested</Text>
            <Text style={[styles.simResultVal, { color: '#fafbfc' }]}>
              ₹{latestStats.invested.toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.simResultBox}>
            <Text style={styles.simResultLabel}>Wealth Gained</Text>
            <Text style={[styles.simResultVal, { color: '#2dba4e' }]}>
              ₹{latestStats.gained.toLocaleString('en-IN')}
            </Text>
          </View>
          <View style={styles.simResultBox}>
            <Text style={styles.simResultLabel}>Projected Value</Text>
            <Text style={[styles.simResultVal, { color: '#ffffff' }]}>
              ₹{latestStats.total.toLocaleString('en-IN')}
            </Text>
          </View>
        </View>
      </View>
    </ScrollView>
  );
};

// ----------------------------------------------------
// 4. Settings Screen Component
// ----------------------------------------------------
const SettingsScreen = () => {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);
  const { colors } = useTheme();
  const styles = getStyles(colors);
  
  const [biometricsEnabled, setBiometricsEnabled] = useState(true);

  return (
    <ScrollView 
      style={styles.container} 
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.headerTitle}>Settings</Text>
      <Text style={styles.subtitle}>Privacy & Security</Text>

      {/* User Profile Card */}
      <View style={styles.card}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
            <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 18 }}>
              {user?.name?.charAt(0).toUpperCase() || 'U'}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 15, fontWeight: '700' }}>{user?.name || 'Guest User'}</Text>
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>{user?.email || user?.phone || 'Offline Session'}</Text>
          </View>
          <View style={{ backgroundColor: colors.accentMuted, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
            <Text style={{ color: colors.accent, fontSize: 10, fontWeight: '700', textTransform: 'uppercase' }}>
              {user?.authProvider || 'Local'}
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.buttonSecondaryBackground, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, borderRadius: 10, marginTop: 8 }}
          onPress={() => authService.logOut()}
        >
          <Feather name="log-out" size={14} color={colors.text} style={{ marginRight: 6 }} />
          <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>Log Out Session</Text>
        </TouchableOpacity>
      </View>

      {/* Appearance */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Appearance Setting</Text>
        <Text style={styles.settingDesc}>
          Choose your interface appearance preference.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 12 }}>
          {(['light', 'dark', 'system'] as const).map((mode) => {
            const isSelected = theme === mode;
            return (
              <TouchableOpacity
                key={mode}
                onPress={() => setTheme(mode)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 10,
                  backgroundColor: isSelected ? colors.accent : colors.buttonSecondaryBackground,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: isSelected ? colors.accent : colors.border,
                }}
                activeOpacity={0.7}
              >
                <Text
                  style={{
                    color: isSelected ? '#ffffff' : colors.text,
                    fontSize: 13,
                    fontWeight: '700',
                    textTransform: 'capitalize',
                  }}
                >
                  {mode}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>

      {/* Security */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Security Settings</Text>
        <View style={styles.settingRow}>
          <Text style={styles.settingLabel}>Enable Biometric Lock</Text>
          <Switch 
            value={biometricsEnabled}
            onValueChange={setBiometricsEnabled}
            thumbColor={biometricsEnabled ? colors.accent : colors.text}
            trackColor={{ false: colors.buttonSecondaryBackground, true: colors.accentMuted }}
          />
        </View>
      </View>
    </ScrollView>
  );
};

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
    if (bankProfiles.length >= 3) {
      Alert.alert(
        'Limit Reached',
        'You can link a maximum of 3 bank accounts. Please remove an existing account first.',
        [{ text: 'OK' }]
      );
      return;
    }
    setAddBankModalVisible(true);
  };

  const handleRemoveBank = (id: string, bankName: string, suffix: string) => {
    Alert.alert(
      'Remove Bank Account',
      `Are you sure you want to remove your ${bankName} account ending in ${suffix}? This will unlink it from your profile.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setRemovingId(id);
            try {
              const token = authService.getAccessToken();
              const response = await fetch(`${BACKEND_URL}/sync/bank-profile/${id}`, {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${token}`,
                  'Content-Type': 'application/json',
                },
              });

              if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.message || 'Failed to remove bank account on backend');
              }

              await sync();
              Alert.alert('Success', `${bankName} account removed successfully.`);
            } catch (e: any) {
              Alert.alert('Error', e.message || 'Failed to remove bank account.');
            } finally {
              setRemovingId(null);
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 100 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.headerTitle}>My Banks</Text>
        <Text style={styles.subtitle}>
          {bankProfiles.length === 0
            ? 'No bank accounts linked yet.'
            : `Linked ${bankProfiles.length} of 3 maximum bank accounts.`
          }
        </Text>

        {/* Bank List */}
        <View style={{ marginTop: 15 }}>
          {bankProfiles.map((bank) => (
            <TouchableOpacity 
              key={bank.id} 
              style={[styles.card, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 16 }]}
              onPress={() => {
                setSelectedBank(bank);
                setDetailsVisible(true);
              }}
              activeOpacity={0.8}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <BankIcon code={getBankCode(bank.bankName)} name={bank.bankName} size={42} />
                <View style={{ marginLeft: 12, flex: 1 }}>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '700' }} numberOfLines={1}>
                    {bank.bankName}
                  </Text>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 2 }}>
                    Savings Account •••• {bank.accountNumberSuffix}
                  </Text>
                  <Text style={{ color: colors.accent, fontSize: 14, fontWeight: '700', marginTop: 4 }}>
                    ₹{bank.currentBalance.toLocaleString('en-IN')}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={() => handleRemoveBank(bank.id, bank.bankName, bank.accountNumberSuffix)}
                disabled={removingId !== null}
                style={{ padding: 8 }}
                activeOpacity={0.7}
              >
                {removingId === bank.id ? (
                  <ActivityIndicator size="small" color="#FF5252" />
                ) : (
                  <Feather name="trash-2" size={20} color="#FF5252" />
                )}
              </TouchableOpacity>
            </TouchableOpacity>
          ))}
        </View>

        {/* Add Bank Button */}
        {bankProfiles.length < 3 ? (
          <TouchableOpacity
            style={[styles.submitBankBtn, { marginTop: 20, width: '100%' }]}
            onPress={handleOpenAddBank}
            activeOpacity={0.8}
          >
            <Feather name="plus-circle" size={16} color="#24292e" style={{ marginRight: 6 }} />
            <Text style={styles.submitBankBtnText}>Link New Bank Account</Text>
          </TouchableOpacity>
        ) : (
          <View style={[styles.card, { borderStyle: 'dashed', borderColor: colors.border, borderWidth: 1, backgroundColor: 'transparent', alignItems: 'center', padding: 16, marginTop: 20 }]}>
            <Feather name="info" size={20} color="#FFD700" style={{ marginBottom: 6 }} />
            <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18 }}>
              You have linked the maximum limit of 3 bank accounts. Remove an existing account to link a new one.
            </Text>
          </View>
        )}
      </ScrollView>

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
    </View>
  );
};

// ----------------------------------------------------
// Navigators & Navigation Container
// ----------------------------------------------------
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabIcon = ({ 
  focused, 
  activeIcon, 
  inactiveIcon, 
  label, 
  size = 20 
}: { 
  focused: boolean; 
  activeIcon: any; 
  inactiveIcon: any; 
  label: string; 
  size?: number 
}) => {
  const { colors, isDark } = useTheme();
  
  if (focused) {
    return (
      <View style={{
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: isDark ? 'rgba(45, 186, 78, 0.15)' : 'rgba(45, 186, 78, 0.08)',
        paddingHorizontal: 16,
        paddingVertical: 5,
        borderRadius: 18,
        borderWidth: 1,
        borderColor: isDark ? 'rgba(45, 186, 78, 0.3)' : 'rgba(45, 186, 78, 0.2)',
        minWidth: 56,
      }}>
        <Ionicons 
          name={activeIcon} 
          size={size} 
          color="#2dba4e" 
        />
        <Text style={{
          color: '#2dba4e',
          fontSize: 9,
          fontWeight: '800',
          marginTop: 2,
          letterSpacing: 0.3,
        }}>
          {label}
        </Text>
      </View>
    );
  }

  return (
    <View style={{
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Ionicons 
        name={inactiveIcon} 
        size={size} 
        color={colors.textTertiary} 
      />
      <Text style={{
        color: colors.textTertiary,
        fontSize: 9,
        fontWeight: '600',
        marginTop: 2,
      }}>
        {label}
      </Text>
    </View>
  );
};

function TabNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: {
          position: 'absolute',
          bottom: Platform.OS === 'ios' ? 34 : 18,
          left: 180,
          right: 180,
          borderRadius: 30,
          backgroundColor: isDark ? 'rgba(15, 15, 22, 0.97)' : 'rgba(255, 255, 255, 0.98)',
          borderTopWidth: 0,
          elevation: 16,
          height: 64,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 16,
          paddingBottom: 0,
          paddingTop: 0,
          borderWidth: 1,
          borderColor: isDark ? 'rgba(255, 255, 255, 0.07)' : 'rgba(0, 0, 0, 0.06)',
          overflow: 'hidden',
        },
        tabBarIconStyle: {
          width: '100%',
          height: '100%',
          justifyContent: 'center',
          alignItems: 'center',
        },
      }}
    >
      <Tab.Screen 
        name="Home" 
        component={DashboardScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="home" inactiveIcon="home-outline" label="Home" />
          )
        }}
      />
      <Tab.Screen 
        name="Goals" 
        component={GoalsScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="trophy" inactiveIcon="trophy-outline" label="Goals" size={19} />
          )
        }}
      />
      <Tab.Screen 
        name="Banks" 
        component={BanksScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="wallet" inactiveIcon="wallet-outline" label="Banks" />
          )
        }}
      />
      <Tab.Screen 
        name="AI Chat" 
        component={ChatScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="sparkles" inactiveIcon="sparkles-outline" label="AI Chat" />
          )
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="options" inactiveIcon="options-outline" label="Settings" />
          )
        }}
      />
    </Tab.Navigator>
  );
}

export default function AppNavigator() {
  const user = useAuthStore((state) => state.user);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { colors, isDark } = useTheme();

  useEffect(() => {
    const initAndCheck = async () => {
      await mmkvStorage.initialize();
      // Restore persisted theme after MMKV async fallback loads
      await useThemeStore.getState().rehydrateTheme();
      await authService.checkSession();
    };
    initAndCheck();
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
      <NavigationContainer theme={navTheme}>
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
  },
  modalCardFull: {
    backgroundColor: colors.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 24,
    height: '85%',
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
    paddingHorizontal: 12,
    height: 64,
    marginVertical: 5,
  },
  bankLogoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  bankLogoText: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 14,
  },
  bankMeta: {
    flex: 1,
  },
  bankNameText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  bankCodeText: {
    color: colors.textTertiary,
    fontSize: 11,
    marginTop: 2,
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
