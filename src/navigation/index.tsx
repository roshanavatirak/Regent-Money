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
  Modal
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
import { LinearGradient, vec } from '@shopify/react-native-skia';
import Voice from '@react-native-voice/voice';

import { useSyncDb } from '../services/useSyncDb';
import { 
  useTransactionStore, 
  useBudgetStore, 
  useGoalsStore, 
  useAIStore,
  useAuthStore,
  useBankStore,
  useThemeStore,
  useTheme
} from '../store';
import { StatusBar } from 'expo-status-bar';
import { authService } from '../services/authService';
const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';
import { WelcomeScreen, LoginScreen, SignupScreen } from './authScreens';
import { syncService } from '../services/syncService';
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
const DashboardScreen = () => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);
  const navStyles = getNavStyles(colors);
  const insets = useSafeAreaInsets();
  const { sync } = useSyncDb();

  const user = useAuthStore((state) => state.user);
  const [profileModalVisible, setProfileModalVisible] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Bank profile state management
  const bankProfiles = useBankStore((state) => state.bankProfiles);
  const [addBankModalVisible, setAddBankModalVisible] = useState(false);
  const [banksList, setBanksList] = useState<{ [key: string]: string }>({});
  const [loadingBanks, setLoadingBanks] = useState(false);
  const [selectedBank, setSelectedBank] = useState<{ code: string; name: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [accountSuffix, setAccountSuffix] = useState('');
  const [balance, setBalance] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formStep, setFormStep] = useState(1);

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

  const fetchBanksList = async () => {
    setLoadingBanks(true);
    try {
      const response = await fetch('https://raw.githubusercontent.com/razorpay/ifsc/master/src/banknames.json');
      const data = await response.json();
      setBanksList(data);
    } catch (e) {
      console.error('Failed to load bank list registry:', e);
    } finally {
      setLoadingBanks(false);
    }
  };

  const filteredBanks = useMemo(() => {
    const list = Object.entries(banksList).map(([code, name]) => ({ code, name }));
    if (!searchQuery.trim()) return list.slice(0, 15); // first 15 banks when search is empty
    return list.filter(bank => 
      bank.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      bank.code.toLowerCase().includes(searchQuery.toLowerCase())
    ).slice(0, 30);
  }, [banksList, searchQuery]);

  const handleOpenAddBank = () => {
    setAddBankModalVisible(true);
    fetchBanksList();
  };

  const resetForm = () => {
    setSelectedBank(null);
    setSearchQuery('');
    setAccountSuffix('');
    setBalance('');
    setFormError('');
    setFormStep(1);
  };

  const getBankColor = (code: string) => {
    const clean = code.toLowerCase();
    if (clean.includes('hdfc')) return '#cf222e';
    if (clean.includes('sbi') || clean.includes('sbin')) return '#00a9e0';
    if (clean.includes('icic')) return '#ff8200';
    if (clean.includes('utib') || clean.includes('axis')) return '#97144d';
    if (clean.includes('kkbk') || clean.includes('kotak')) return '#e50914';
    // Generate color from code string hash
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = code.charCodeAt(i) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360}, 65%, 45%)`;
  };

  const handleSelectBank = (bank: { code: string; name: string }) => {
    setSelectedBank(bank);
    setFormStep(2);
  };

  const getBankGradient = (bankName: string) => {
    const name = bankName.toLowerCase();
    if (name.includes('hdfc')) return ['#cf222e', '#f6f8fa']; // HDFC Red
    if (name.includes('state bank') || name.includes('sbi')) return ['#00a9e0', '#0033a0']; // SBI Blue
    if (name.includes('icici')) return ['#ff8200', '#8a1538']; // ICICI Orange/Maroon
    if (name.includes('axis')) return ['#97144d', '#ae285d']; // Axis Burgundy
    if (name.includes('kotak')) return ['#e50914', '#0033a0']; // Kotak Red/Blue
    // Default dynamic linear gradient colors based on bank name hash
    let hash = 0;
    for (let i = 0; i < bankName.length; i++) {
      hash = bankName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color1 = `hsl(${Math.abs(hash) % 360}, 70%, 45%)`;
    const color2 = `hsl(${(Math.abs(hash) + 60) % 360}, 80%, 35%)`;
    return [color1, color2];
  };

  const handleSubmitBank = async () => {
    if (!accountSuffix.trim() || !balance.trim()) {
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
      const user = useAuthStore.getState().user;
      if (!user) {
        throw new Error('No active user session');
      }

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
          bankName: selectedBank?.name || 'Unknown Bank',
          accountNumberSuffix: accountSuffix.trim(),
          currentBalance: parseFloat(balance),
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || 'Failed to connect bank account on backend');
      }

      setAddBankModalVisible(false);
      resetForm();
      await sync();
      console.log('[BankCreation] Successfully created bank account on Supabase');
    } catch (e: any) {
      setFormError('Database save failed: ' + e.message);
    } finally {
      setSubmitting(false);
    }
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
  const latestNetWorth = useMemo(() => {
    if (snapshots.length > 0) {
      return snapshots[snapshots.length - 1].netWorth;
    }
    return 184320; // fallback
  }, [snapshots]);

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
        contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#2dba4e" colors={["#2dba4e"]} />
        }
      >
        {/* Header */}
        <View style={styles.dashboardHeader}>
          <View>
            <Text style={styles.headerTitleSmall}>REGENT</Text>
            <Text style={styles.headerTitle}>MONEY</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {bankProfiles.length === 0 && (
              <TouchableOpacity 
                style={[styles.bankAlertBtn, { marginRight: 12 }]} 
                onPress={() => {
                  resetForm();
                  setAddBankModalVisible(true);
                }}
                activeOpacity={0.7}
              >
                <Feather name="alert-circle" size={18} color="#FF5252" />
                <View style={styles.badgePulseDot} />
              </TouchableOpacity>
            )}
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
              onPress={() => {
                resetForm();
                setAddBankModalVisible(true);
              }}
              activeOpacity={0.8}
            >
              <Text style={styles.bannerActionText}>Add Bank</Text>
            </TouchableOpacity>
          </Animated.View>
        )}

      {/* Net Worth Card (Neon shadow style) */}
      <View style={[styles.card, styles.neonCard]}>
        <Text style={styles.cardTitle}>Total Net Worth</Text>
        <Text style={styles.cardBigNumber}>₹{latestNetWorth.toLocaleString('en-IN')}</Text>
        <Text style={styles.cardFooter}>Active Wealth Compounder</Text>
      </View>

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
    <Modal
      visible={addBankModalVisible}
      transparent
      animationType="slide"
      onRequestClose={() => {
        if (formStep === 2) {
          setFormStep(1);
        } else {
          setAddBankModalVisible(false);
          resetForm();
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
                setAddBankModalVisible(false);
                resetForm();
              }} 
              style={navStyles.closeBtn}
            >
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          {formStep === 1 ? (
            <View style={{ flex: 1 }}>
              <TextInput
                style={styles.bankSearchInput}
                placeholder="Search Bank Name or Code..."
                placeholderTextColor="#666"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoCapitalize="none"
              />

              {loadingBanks ? (
                <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                  <ActivityIndicator size="large" color="#2dba4e" />
                  <Text style={{ color: 'rgba(250, 251, 252, 0.6)', marginTop: 10, fontSize: 13 }}>
                    Fetching banks from Razorpay...
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredBanks}
                  keyExtractor={(item, index) => item.code + '_' + index}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={{ paddingBottom: 20 }}
                  ListEmptyComponent={
                    <Text style={{ color: 'rgba(250, 251, 252, 0.5)', textAlign: 'center', marginTop: 30 }}>
                      No banks found matching "{searchQuery}"
                    </Text>
                  }
                  renderItem={({ item }) => {
                    const initials = item.code.substring(0, 2).toUpperCase();
                    const bgColor = getBankColor(item.code);
                    return (
                      <TouchableOpacity
                        style={styles.bankListItem}
                        onPress={() => handleSelectBank(item)}
                        activeOpacity={0.7}
                      >
                        <View style={[styles.bankLogoBadge, { backgroundColor: bgColor }]}>
                          <Text style={styles.bankLogoText}>{initials}</Text>
                        </View>
                        <View style={styles.bankMeta}>
                          <Text style={styles.bankNameText} numberOfLines={1}>{item.name}</Text>
                          <Text style={styles.bankCodeText}>{item.code}</Text>
                        </View>
                        <Feather name="chevron-right" size={16} color="#8E8E9F" />
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
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
                <View style={[styles.bankLogoBadge, { width: 50, height: 50, borderRadius: 25, backgroundColor: getBankColor(selectedBank?.code || '') }]}>
                  <Text style={[styles.bankLogoText, { fontSize: 18 }]}>
                    {selectedBank?.code.substring(0, 2).toUpperCase() || 'BK'}
                  </Text>
                </View>
                <Text style={styles.bankFormTitle}>{selectedBank?.name}</Text>
                <Text style={styles.bankFormSubtitle}>Enter your account details to connect</Text>
              </View>

              {formError ? (
                <View style={[styles.errorContainer, { marginVertical: 12 }]}>
                  <Feather name="alert-circle" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
                  <Text style={styles.errorTextInline}>{formError}</Text>
                </View>
              ) : null}

              <View style={styles.formFieldContainer}>
                <Text style={styles.formFieldLabel}>Bank Name</Text>
                <View style={styles.formInputGroup}>
                  <Feather name="briefcase" size={16} color="rgba(250, 251, 252, 0.4)" style={styles.formInputIcon} />
                  <TextInput
                    style={styles.formInputFieldDisabled}
                    value={selectedBank?.name}
                    editable={false}
                  />
                </View>
              </View>

              <View style={styles.formFieldContainer}>
                <Text style={styles.formFieldLabel}>Account Suffix (Last 4 Digits)</Text>
                <View style={styles.formInputGroup}>
                  <Feather name="credit-card" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                  <TextInput
                    style={styles.formInputField}
                    placeholder="e.g. 9876"
                    placeholderTextColor="#555"
                    keyboardType="number-pad"
                    maxLength={4}
                    value={accountSuffix}
                    onChangeText={setAccountSuffix}
                  />
                </View>
              </View>

              <View style={styles.formFieldContainer}>
                <Text style={styles.formFieldLabel}>Current Balance (INR)</Text>
                <View style={styles.formInputGroup}>
                  <Feather name="dollar-sign" size={16} color="#8E8E9F" style={styles.formInputIcon} />
                  <TextInput
                    style={styles.formInputField}
                    placeholder="e.g. 25000"
                    placeholderTextColor="#555"
                    keyboardType="numeric"
                    value={balance}
                    onChangeText={setBalance}
                  />
                </View>
              </View>

              {submitting ? (
                <ActivityIndicator size="large" color="#2dba4e" style={{ marginTop: 20 }} />
              ) : (
                <TouchableOpacity
                  style={styles.submitBankBtn}
                  onPress={handleSubmitBank}
                  activeOpacity={0.8}
                >
                  <Text style={styles.submitBankBtnText}>Connect Account</Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
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
          contentContainerStyle={styles.chatList}
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

      <View style={[styles.inputArea, { paddingBottom: insets.bottom + 10 }]}>
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
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
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
      contentContainerStyle={[styles.contentContainer, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
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
// Navigators & Navigation Container
// ----------------------------------------------------
const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

const TabIcon = ({ focused, activeIcon, inactiveIcon, size = 22 }: { focused: boolean; activeIcon: any; inactiveIcon: any; size?: number }) => {
  const { colors } = useTheme();
  return (
    <View style={{
      backgroundColor: focused ? colors.accentMuted : 'transparent',
      width: 55,
      height: 32,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      <Ionicons 
        name={focused ? activeIcon : inactiveIcon} 
        size={size} 
        color={focused ? colors.accent : colors.textTertiary} 
      />
    </View>
  );
};

function TabNavigator() {
  const { colors } = useTheme();
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 12,
          height: Platform.OS === 'ios' ? 90 : 70,
          paddingBottom: Platform.OS === 'ios' ? 24 : 8,
          paddingTop: 8,
          shadowColor: colors.shadowColor,
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 0.5,
          marginTop: 4,
        },
      }}
    >
      <Tab.Screen 
        name="Dashboard" 
        component={DashboardScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="analytics" inactiveIcon="analytics-outline" />
          )
        }}
      />
      <Tab.Screen 
        name="Goals" 
        component={GoalsScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="trophy" inactiveIcon="trophy-outline" size={20} />
          )
        }}
      />
      <Tab.Screen 
        name="AI Chat" 
        component={ChatScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="sparkles" inactiveIcon="sparkles-outline" />
          )
        }}
      />
      <Tab.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} activeIcon="options" inactiveIcon="options-outline" />
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
    authService.checkSession();
  }, []);

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style={colors.statusBar} />
        <ActivityIndicator size="large" color={colors.accent} />
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
  bankSearchInput: {
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 46,
    paddingHorizontal: 12,
    color: colors.text,
    fontSize: 14,
    marginBottom: 16,
  },
  bankListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    padding: 12,
    marginVertical: 6,
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
