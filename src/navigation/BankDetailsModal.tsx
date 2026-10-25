// src/navigation/BankDetailsModal.tsx
//
// Account details: brand card with balance, quick money in/out, imports,
// and the account's transactions grouped by month.

import React, { useState, useEffect, useMemo } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  ActivityIndicator,
  Alert,
  StyleSheet,
  SectionList,
  Switch,
  Platform,
  PermissionsAndroid,
  Linking,
  NativeModules,
} from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { BankIcon } from '../components/BankIcon';
import { CategoryIcon } from '../components/CategoryIcon';
import { getCategory } from '../constants/categories';
import { bankBrandColor, getBankCode, niceName } from '../constants/bankBrand';
import { useTheme, useBankStore, useTransactionStore, useIncomeStore } from '../store';
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { getBackendUrl } from '../config/api';
import { ReviewTransactionsModal } from './ReviewTransactionsModal';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { EditBankScreen } from './EditBankScreen';
import { ManualTransactionScreen } from './ManualTransactionScreen';
import { smsCatchupService } from '../services/smsCatchupService';
import { smsPermissionService } from '../services/smsPermissionService';
import { uploadFile, UploadError, isPasswordRequired } from '../services/uploadFile';
import { statementVaultService } from '../services/statementVaultService';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

type Tab = 'all' | 'debits' | 'credits';

interface BankDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: any | null;
}

const inr = (n: number, dp = 0) =>
  `₹${Math.abs(n).toLocaleString('en-IN', { minimumFractionDigits: dp, maximumFractionDigits: dp || 2 })}`;

/* ------------------------------------------------------------------ */
/* Bottom sheet used for options, password, consent and errors          */
/* ------------------------------------------------------------------ */

const Sheet: React.FC<{
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  bg: string;
  dark: boolean;
}> = ({ visible, onClose, children, bg, dark }) => {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={sheet.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close" />
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <View style={[sheet.card, { backgroundColor: bg, paddingBottom: Math.max(insets.bottom, 16) + 12 }]}>
            <View style={[sheet.grabber, { backgroundColor: dark ? 'rgba(255,255,255,0.18)' : '#D5DED9' }]} />
            {children}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const sheet = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 20, paddingTop: 10, width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 18 },
});

/* ------------------------------------------------------------------ */
/* Screen                                                              */
/* ------------------------------------------------------------------ */

export const BankDetailsModal = ({ visible, onClose, bank }: BankDetailsModalProps) => {
  const insets = useSafeAreaInsets();
  const { colors, isDark } = useTheme();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;

  const transactions = useTransactionStore((s) => s.transactions);
  const allIncomeRecords = useIncomeStore((s) => s.incomeRecords);

  const [localBank, setLocalBank] = useState<any>(bank);
  useEffect(() => setLocalBank(bank), [bank]);
  const activeBank = localBank || bank;

  const [activeTab, setActiveTab] = useState<Tab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isRevalidatingIncome, setIsRevalidatingIncome] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');

  const [passwordSheet, setPasswordSheet] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<any | null>(null);
  const [errorSheet, setErrorSheet] = useState<{ title: string; message: string } | null>(null);
  const [reviewVisible, setReviewVisible] = useState(false);
  const [extracted, setExtracted] = useState<any[]>([]);
  const [detectedFinalBalance, setDetectedFinalBalance] = useState<number | null>(null);
  const [selectedTx, setSelectedTx] = useState<any | null>(null);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [manualTxType, setManualTxType] = useState<'credit' | 'debit' | null>(null);

  const [smsConsent, setSmsConsent] = useState(activeBank?.smsConsent || false);
  const [consentSheet, setConsentSheet] = useState(false);
  const [optionsSheet, setOptionsSheet] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [isSyncingSms, setIsSyncingSms] = useState(false);
  const [hasEntered, setHasEntered] = useState(false);

  useEffect(() => {
    if (!visible) {
      setIsEditingBank(false);
      setManualTxType(null);
      setSelectedTx(null);
      setSearchQuery('');
      setActiveTab('all');
      setHasEntered(false);
    } else {
      const timer = setTimeout(() => {
        setHasEntered(true);
      }, 550);
      return () => clearTimeout(timer);
    }
  }, [visible]);

  useEffect(() => {
    if (activeBank) setSmsConsent(activeBank.smsConsent || false);
  }, [activeBank]);

  /* ---------------- Data ---------------- */

  const fetchIncomeRecords = async () => {
    const currentId = activeBank?.id || bank?.id;
    if (!currentId) return;
    setIsRevalidatingIncome(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;
      const response = await fetch(`${BACKEND_URL}/sync/income-records`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) throw new Error('Failed to fetch income records');
      const data = await response.json();
      const mapped = (data || []).map((inc: any) => ({
        id: inc.id,
        amount: parseFloat(inc.amount || 0),
        category: inc.category || 'income',
        merchant: inc.source || inc.merchant || 'Income',
        source: inc.source || inc.merchant || 'Income',
        timestamp: Number(inc.timestamp || Date.now()),
        bankProfileId: inc.bankProfileId ?? inc.bank_profile_id ?? null,
        updatedAt: inc.updatedAt ? Number(inc.updatedAt) : undefined,
        type: 'credit' as const,
      }));
      useIncomeStore.getState().setIncomeRecords(mapped);
    } catch (e) {
      console.warn('Error fetching income records in background:', e);
    } finally {
      setIsRevalidatingIncome(false);
    }
  };

  useEffect(() => {
    if (visible && (bank || activeBank)) fetchIncomeRecords();
  }, [visible, bank?.id, activeBank?.id]);

  const currentBankId = activeBank?.id || bank?.id;

  const merged = useMemo(() => {
    if (!currentBankId) return [];
    const debits = transactions
      .filter((tx) => tx.bankProfileId === currentBankId)
      .map((tx) => ({ ...tx, type: 'debit' as const }));
    const credits = allIncomeRecords
      .filter((inc) => (inc.bankProfileId ?? (inc as any).bank_profile_id) === currentBankId)
      .map((inc) => ({
        ...inc,
        merchant: inc.merchant || inc.source || 'Income',
        source: inc.source || inc.merchant || 'Income',
        type: 'credit' as const,
      }));
    const sorted = [...debits, ...credits].sort((a, b) => {
      const diff = (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
      if (diff !== 0) return diff;
      // Secondary tie-breaker: keep sister transactions with matching merchant and amount strictly together
      const aMerchant = (a.merchant || (a as any).source || '').toLowerCase().trim();
      const bMerchant = (b.merchant || (b as any).source || '').toLowerCase().trim();
      if (aMerchant !== bMerchant) {
        return aMerchant.localeCompare(bMerchant);
      }
      const amtDiff = (Number(b.amount) || 0) - (Number(a.amount) || 0);
      if (amtDiff !== 0) return amtDiff;
      return Number((b as any).updatedAt || 0) - Number((a as any).updatedAt || 0);
    });

    // De-duplicate by id or verified reference id
    const seenIds = new Set<string>();
    const seenRefs = new Set<string>();
    const out: any[] = [];
    for (const item of sorted as any[]) {
      if (!item) continue;
      if (item.id) {
        if (seenIds.has(item.id)) continue;
        seenIds.add(item.id);
      }
      const ref = item.referenceId || (item.smsId && item.smsId.startsWith('ref_') ? item.smsId : null);
      if (ref) {
        if (seenRefs.has(ref)) continue;
        seenRefs.add(ref);
      }
      out.push(item);
    }
    return out;
  }, [transactions, allIncomeRecords, currentBankId]);

  const sections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = merged.filter((item) => {
      if (activeTab === 'debits' && item.type !== 'debit') return false;
      if (activeTab === 'credits' && item.type !== 'credit') return false;
      if (!q) return true;
      return (
        item.merchant?.toLowerCase().includes(q) ||
        item.category?.toLowerCase().includes(q) ||
        getCategory(item.category).label.toLowerCase().includes(q)
      );
    });

    const groups: Record<string, { title: string; spent: number; received: number; data: any[] }> = {};
    const order: string[] = [];
    for (const item of filtered) {
      const t = typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime();
      const d = isNaN(t) ? new Date() : new Date(t);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (!groups[key]) {
        groups[key] = { title: format(d, 'MMMM yyyy'), spent: 0, received: 0, data: [] };
        order.push(key);
      }
      groups[key].data.push(item);
      const amt = Number(item.amount) || 0;
      if (item.type === 'debit') groups[key].spent += amt;
      else groups[key].received += amt;
    }
    return order.map((k) => groups[k]);
  }, [merged, activeTab, searchQuery]);

  /* ---------------- SMS consent ---------------- */

  const saveSmsConsent = async (val: boolean) => {
    if (!activeBank) return;
    setSmsConsent(val);
    try {
      const token = authService.getAccessToken();
      if (!token) return;
      const response = await fetch(`${BACKEND_URL}/sync/bank-profile/${activeBank.id}/consent`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ smsConsent: val }),
      });
      if (!response.ok) throw new Error('Could not update auto-tracking. Try again.');
      await syncService.sync();
    } catch (e: any) {
      setSmsConsent(!val);
      setErrorSheet({ title: 'Auto-tracking not changed', message: e.message || 'Try again in a moment.' });
    }
  };

  const toggleSmsConsent = async (val: boolean) => {
    setOptionsSheet(false);
    if (val) setConsentSheet(true);
    else await saveSmsConsent(false);
  };

  const agreeToConsent = async () => {
    setConsentSheet(false);
    if (Platform.OS === 'android') {
      try {
        const granted = await PermissionsAndroid.requestMultiple([
          PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
          PermissionsAndroid.PERMISSIONS.READ_SMS,
        ]);
        const ok =
          granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
          granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
        if (!ok) {
          setSmsConsent(false);
          Alert.alert('SMS access needed', 'Allow SMS access in Settings to turn on auto-tracking.', [
            { text: 'Not now', style: 'cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ]);
          return;
        }
      } catch {
        setSmsConsent(false);
        return;
      }
    }
    await saveSmsConsent(true);
  };

  /* ---------------- Remove account ---------------- */

  const removeAccount = async () => {
    if (!activeBank) return;
    setRemoving(true);
    try {
      const token = authService.getAccessToken();
      if (token) {
        await fetch(`${BACKEND_URL}/sync/bank-profile/${activeBank.id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
      }
    } catch (err: any) {
      console.warn('[BankDetails] Remove failed, removing locally:', err?.message);
    } finally {
      useBankStore.getState().removeBankProfileState(activeBank.id);
      await syncService.sync().catch(() => {});
      setRemoving(false);
      setConfirmRemove(false);
      setOptionsSheet(false);
      onClose();
    }
  };

  /* ---------------- SMS catch-up ---------------- */

  const scanLast48h = async () => {
    if (!activeBank) return;
    setOptionsSheet(false);
    if (Platform.OS !== 'android') {
      setErrorSheet({ title: 'Android only', message: 'Checking bank messages works on Android phones.' });
      return;
    }
    setIsSyncingSms(true);
    setProcessing(true);
    setStatusText('Checking the last 48 hours of bank messages');
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (!granted) {
        setErrorSheet({ title: 'SMS access needed', message: 'Allow SMS access in Settings so Regent can read bank alerts.' });
        return;
      }
      const Sms = NativeModules.Sms;
      if (!Sms || typeof Sms.list !== 'function') {
        setErrorSheet({ title: 'Not available in this build', message: 'This version of the app can’t read SMS. Update to the latest version.' });
        return;
      }
      const res = await smsCatchupService.reconcile(true, 48, activeBank.id);
      await fetchIncomeRecords();
      await syncService.sync(true).catch(() => {});
      Alert.alert(
        res && res.syncedCount > 0 ? `${res.syncedCount} transaction${res.syncedCount > 1 ? 's' : ''} added` : 'You’re up to date',
        res && res.syncedCount > 0
          ? `Missed transactions for •• ${activeBank.accountNumberSuffix} were added and the balance updated.`
          : `No missed transactions for •• ${activeBank.accountNumberSuffix} in the last 48 hours.`
      );
    } catch (err: any) {
      setErrorSheet({ title: 'Check failed', message: err?.message || 'Could not read bank messages. Try again.' });
    } finally {
      setIsSyncingSms(false);
      setProcessing(false);
      setStatusText('');
    }
  };

  /* ---------------- Imports ---------------- */

  const uploadStatementFile = async (fileAsset: any, password?: string) => {
    setProcessing(true);
    setStatusText(password ? 'Unlocking and reading your statement' : 'Reading your statement');
    try {
      const token = authService.getAccessToken();
      if (!token) throw new UploadError('Sign in again to import statements.', 401);
      const json = await uploadFile({
        url: `${BACKEND_URL}/sync/upload-statement`,
        fileUri: fileAsset.uri,
        fileName: fileAsset.name || 'statement.pdf',
        webFile: fileAsset.file,
        fields: { bankProfileId: activeBank?.id, password: password || undefined },
        headers: { Authorization: `Bearer ${token}` },
        maxBytes: 25 * 1024 * 1024,
        timeoutMs: 120_000,
      });
      const txs = json.transactions || [];
      if (txs.length === 0) throw new UploadError('No transactions were found in this statement.', 422);

      // Successfully unlocked: save password into on-device hardware KeyStore so user never has to re-type it
      if (password && activeBank?.id) {
        statementVaultService.savePassword(activeBank.id, password).catch(() => {});
      }

      setExtracted(txs);
      setDetectedFinalBalance(json.detectedFinalBalance ?? null);
      setPasswordError(null);
      setReviewVisible(true);
    } catch (e: any) {
      if (e instanceof UploadError && isPasswordRequired(e.body)) {
        // If a stored password failed, clear it so user can supply the new password
        if (password && activeBank?.id) {
          statementVaultService.clearPassword(activeBank.id).catch(() => {});
        }
        setPasswordError(password ? 'That password didn’t work. Try again.' : null);
        setPendingPdf(fileAsset);
        setPasswordSheet(true);
        return;
      }
      const isValidation = e instanceof UploadError && e.status != null && e.status >= 400 && e.status < 500;
      setErrorSheet({
        title: isValidation ? 'Couldn’t read this statement' : 'Upload failed',
        message: e?.message || 'Try again with a different file.',
      });
    } finally {
      setProcessing(false);
      setStatusText('');
    }
  };

  const submitPassword = () => {
    const trimmed = pdfPassword.trim();
    if (!trimmed) {
      setPasswordError('Enter the PDF password.');
      return;
    }
    if (!pendingPdf) return;
    setPasswordSheet(false);
    uploadStatementFile(pendingPdf, trimmed);
    setPdfPassword('');
  };

  const importScreenshot = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: false, quality: 1 });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setProcessing(true);
      setStatusText('Reading your screenshot');
      const token = authService.getAccessToken();
      if (!token) throw new UploadError('Sign in again to import screenshots.', 401);
      const asset = result.assets[0];
      const json = await uploadFile({
        url: `${BACKEND_URL}/sync/upload-screenshot`,
        fileUri: asset.uri,
        fileName: asset.fileName || 'screenshot.jpg',
        webFile: (asset as any).file,
        fields: { bankProfileId: activeBank?.id },
        headers: { Authorization: `Bearer ${token}` },
        maxBytes: 15 * 1024 * 1024,
        timeoutMs: 60_000,
      });
      const txs = json.transactions || [];
      if (txs.length === 0) throw new UploadError('No transactions were found in this screenshot.', 422);
      setExtracted(txs);
      setDetectedFinalBalance(json.detectedFinalBalance ?? null);
      setReviewVisible(true);
    } catch (e: any) {
      const msg = e?.message || 'Try a clearer screenshot of your bank app.';
      const lower = msg.toLowerCase();
      let title = 'Couldn’t read this screenshot';
      if (lower.includes('selfie') || lower.includes('personal photo')) title = 'This looks like a personal photo';
      else if (lower.includes('blurry') || lower.includes('low quality') || lower.includes('unreadable')) title = 'Screenshot is too blurry';
      else if (lower.includes('not contain') || lower.includes('unrelated')) title = 'No bank details found';
      setErrorSheet({ title, message: msg });
    } finally {
      setProcessing(false);
      setStatusText('');
    }
  };

  const importStatement = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true });
      if (doc.canceled || !doc.assets?.[0]?.uri) return;
      setPasswordError(null);

      // Check on-device hardware KeyStore for previously saved password
      let savedPwd: string | null = null;
      if (activeBank?.id) {
        savedPwd = await statementVaultService.getSavedPassword(activeBank.id);
      }

      await uploadStatementFile(doc.assets[0], savedPwd || undefined);
    } catch (e: any) {
      setProcessing(false);
      setErrorSheet({ title: 'Couldn’t open the file', message: e?.message || 'Pick a PDF or an image of your statement.' });
    }
  };

  if (!visible || !activeBank) return null;

  /* ---------------- Render ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const brand = bankBrandColor(activeBank.bankName);
  const balance = Number(activeBank.currentBalance) || 0;
  const red = isDark ? '#FFA8A8' : '#C92A2A';
  const syncedAt = activeBank.lastSyncTimestamp ? format(new Date(activeBank.lastSyncTimestamp), 'HH:mm') : null;

  const renderHeader = () => (
    <View>
      {/* Brand card */}
      <Animated.View entering={hasEntered ? undefined : FadeInDown.duration(380)} style={[s.brandCard, { backgroundColor: brand }]}>
        <View pointerEvents="none" style={[s.ring, { width: 220, height: 220, borderRadius: 110, right: -80, top: -100 }]} />
        <View pointerEvents="none" style={[s.ring, { width: 140, height: 140, borderRadius: 70, right: -40, top: -60, borderColor: 'rgba(255,255,255,0.2)' }]} />
        <View style={s.brandTop}>
          <BankIcon code={getBankCode(activeBank.bankName)} name={activeBank.bankName} size={40} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brandName} numberOfLines={1}>{activeBank.bankName}</Text>
            <Text style={s.brandSub}>{activeBank.accountType || 'Savings'} •• {activeBank.accountNumberSuffix}</Text>
          </View>
          <Pressable onPress={() => setOptionsSheet(true)} style={s.ghostBtn} accessibilityLabel="Account options">
            <Feather name="more-horizontal" size={18} color="#FFFFFF" />
          </Pressable>
        </View>
        <View style={s.brandBottom}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.brandLabel}>{syncedAt ? `Balance, synced ${syncedAt}` : 'Balance'}</Text>
            <Text style={[s.brandBalance, { fontFamily: display, fontWeight: display ? undefined : '800' }]} numberOfLines={1} adjustsFontSizeToFit>
              {balance < 0 ? '−' : ''}{inr(balance, 2)}
            </Text>
          </View>
          <Pressable onPress={() => setManualTxType('credit')} style={s.ghostBtnLg} accessibilityLabel="Add money in">
            <Feather name="arrow-down-left" size={18} color="#FFFFFF" />
          </Pressable>
          <Pressable onPress={() => setManualTxType('debit')} style={s.solidBtnLg} accessibilityLabel="Add money out">
            <Feather name="arrow-up-right" size={18} color={brand} />
          </Pressable>
        </View>
      </Animated.View>

      {/* Imports */}
      <Animated.View entering={hasEntered ? undefined : FadeInDown.delay(80).duration(380)} style={s.importRow}>
        <Pressable onPress={importScreenshot} style={({ pressed }) => [s.importBtn, { backgroundColor: surface, borderColor: line }, pressed && { opacity: 0.7 }]}>
          <Feather name="image" size={16} color={ink} />
          <Text style={[s.importText, { color: ink }]}>Import screenshot</Text>
        </Pressable>
        <Pressable onPress={importStatement} style={({ pressed }) => [s.importBtn, { backgroundColor: surface, borderColor: line }, pressed && { opacity: 0.7 }]}>
          <Feather name="file-text" size={16} color={ink} />
          <Text style={[s.importText, { color: ink }]}>Import statement</Text>
        </Pressable>
      </Animated.View>

      {/* Search + filter */}
      <Animated.View entering={hasEntered ? undefined : FadeInDown.delay(140).duration(380)} style={s.filterRow}>
        <View style={[s.search, { backgroundColor: surface, borderColor: line }]}>
          <Feather name="search" size={16} color={muted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor={muted}
            style={[s.searchInput, { color: ink }]}
            accessibilityLabel="Search transactions"
          />
          {searchQuery ? (
            <Pressable onPress={() => setSearchQuery('')} hitSlop={10} accessibilityLabel="Clear search">
              <Feather name="x-circle" size={15} color={muted} />
            </Pressable>
          ) : null}
        </View>
        <View style={[s.segment, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
          {(['all', 'debits', 'credits'] as Tab[]).map((t) => {
            const on = activeTab === t;
            return (
              <Pressable
                key={t}
                onPress={() => setActiveTab(t)}
                style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }, on && !isDark && s.segShadow]}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
              >
                <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>
                  {t === 'all' ? 'All' : t === 'debits' ? 'Out' : 'In'}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );

  return (
    <>
      <Modal visible={visible} transparent animationType="slide" statusBarTranslucent onRequestClose={onClose}>
        <View style={s.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close account" />
          <View style={[s.container, { backgroundColor: pageBg }]}>
            <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#C9D4CE' }]} />

            <SectionList
              sections={sections}
              keyExtractor={(item, i) => item.id || `tx-${i}`}
              stickySectionHeadersEnabled
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: Math.max(insets.bottom, 16) + 24 }}
              ListHeaderComponent={renderHeader()}
              ListEmptyComponent={
                isRevalidatingIncome ? (
                  <ActivityIndicator color={isDark ? LIME : FOREST} style={{ marginTop: 32 }} />
                ) : (
                  <View style={s.empty}>
                    <View style={[s.emptyIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.12)' : '#E3F2E8' }]}>
                      <Feather name="inbox" size={22} color={isDark ? LIME : FOREST} />
                    </View>
                    <Text style={[s.emptyTitle, { color: ink }]}>{searchQuery ? 'Nothing matches' : 'No transactions yet'}</Text>
                    <Text style={[s.emptyText, { color: muted }]}>
                      {searchQuery ? 'Try a different name or category.' : 'Add one with the arrows above, or import a statement.'}
                    </Text>
                  </View>
                )
              }
              renderSectionHeader={({ section }) => (
                <View style={[s.monthHeader, { backgroundColor: pageBg }]}>
                  <Text style={[s.monthTitle, { color: ink }]}>{section.title}</Text>
                  <Text style={[s.monthMeta, { color: muted }]}>
                    {activeTab !== 'credits' && section.spent > 0 ? (
                      <>
                        <Text style={{ color: ink, fontWeight: '700' }}>{inr(section.spent)}</Text> out
                      </>
                    ) : null}
                    {activeTab !== 'debits' && section.received > 0 ? (
                      <>
                        {'   '}
                        <Text style={{ color: isDark ? LIME : '#0B6B3A', fontWeight: '700' }}>{inr(section.received)}</Text> in
                      </>
                    ) : null}
                  </Text>
                </View>
              )}
              renderItem={({ item, index, section }) => {
                const isCredit = item.type === 'credit';
                const catKey = isCredit && (!item.category || item.category === 'income') ? 'money_received' : item.category;
                const first = index === 0;
                const last = index === section.data.length - 1;
                const ts = Number(item.timestamp);
                return (
                  <Pressable
                    onPress={() => setSelectedTx(item)}
                    style={({ pressed }) => [
                      s.row,
                      {
                        backgroundColor: surface,
                        borderColor: line,
                        borderTopLeftRadius: first ? 20 : 0,
                        borderTopRightRadius: first ? 20 : 0,
                        borderBottomLeftRadius: last ? 20 : 0,
                        borderBottomRightRadius: last ? 20 : 0,
                        borderTopWidth: first ? 1 : 0,
                        borderBottomWidth: last ? 1 : 0,
                      },
                      pressed && { opacity: 0.7 },
                    ]}
                    accessibilityRole="button"
                  >
                    <CategoryIcon category={catKey} variant="soft" size={40} />
                    <View style={[s.rowBody, !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }]}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[s.rowName, { color: ink }]} numberOfLines={1}>
                          {niceName(item.merchant) || (isCredit ? 'Money received' : 'Payment')}
                        </Text>
                        <Text style={[s.rowSub, { color: muted }]}>{isNaN(ts) ? '' : format(new Date(ts), 'd MMM')}</Text>
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        <Text style={[s.rowAmt, { color: isCredit ? (isDark ? LIME : '#0B6B3A') : ink }]}>
                          {isCredit ? '+' : '−'}{inr(Number(item.amount) || 0)}
                        </Text>
                        <Text style={[s.rowSub, { color: muted }]} numberOfLines={1}>{getCategory(catKey).label}</Text>
                      </View>
                    </View>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>

        {/* Working */}
        {processing && (
          <Animated.View entering={FadeIn.duration(200)} style={s.workingOverlay}>
            <View style={[s.workingCard, { backgroundColor: surface }]}>
              <ActivityIndicator size="large" color={isDark ? LIME : FOREST} />
              <Text style={[s.workingText, { color: ink }]}>{statusText}</Text>
            </View>
          </Animated.View>
        )}

        {selectedTx && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: pageBg }]}>
            <TransactionDetailScreen
              transaction={selectedTx}
              bankName={activeBank.bankName}
              accountNumberSuffix={activeBank.accountNumberSuffix}
              onBack={() => setSelectedTx(null)}
              onSuccess={() => {
                setSelectedTx(null);
                fetchIncomeRecords();
              }}
            />
          </View>
        )}

        {isEditingBank && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: pageBg }]}>
            <EditBankScreen
              bank={activeBank}
              onBack={() => setIsEditingBank(false)}
              onSuccess={(updated: any) => {
                setIsEditingBank(false);
                setLocalBank(updated);
              }}
            />
          </View>
        )}

        {manualTxType && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: pageBg }]}>
            <ManualTransactionScreen
              bank={activeBank}
              initialType={manualTxType}
              onBack={() => setManualTxType(null)}
              onSuccess={() => {
                setManualTxType(null);
                fetchIncomeRecords();
              }}
            />
          </View>
        )}
      </Modal>

      {/* Account options */}
      <Sheet
        visible={optionsSheet && !isEditingBank && !manualTxType}
        onClose={() => {
          setOptionsSheet(false);
          setConfirmRemove(false);
        }}
        bg={surface}
        dark={isDark}
      >
        {confirmRemove ? (
          <Animated.View entering={FadeIn.duration(200)}>
            <View style={[s.sheetIcon, { backgroundColor: isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3' }]}>
              <Feather name="trash-2" size={22} color={red} />
            </View>
            <Text style={[s.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
              Remove {activeBank.bankName} •• {activeBank.accountNumberSuffix}?
            </Text>
            <Text style={[s.sheetText, { color: muted }]}>
              It stops syncing and leaves your totals. Past transactions stay in your history.
            </Text>
            <Pressable onPress={removeAccount} disabled={removing} style={[s.sheetPrimary, { backgroundColor: '#E03131' }]}>
              {removing ? <ActivityIndicator color="#FFFFFF" /> : <Text style={[s.sheetPrimaryText, { color: '#FFFFFF' }]}>Remove account</Text>}
            </Pressable>
            <Pressable onPress={() => setConfirmRemove(false)} disabled={removing} style={[s.sheetSecondary, { borderColor: line }]}>
              <Text style={[s.sheetSecondaryText, { color: ink }]}>Keep it</Text>
            </Pressable>
          </Animated.View>
        ) : (
          <View>
            <View style={s.sheetHeadRow}>
              <BankIcon code={getBankCode(activeBank.bankName)} name={activeBank.bankName} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={[s.optTitle, { color: ink }]} numberOfLines={1}>{activeBank.bankName}</Text>
                <Text style={[s.optSub, { color: muted }]}>{activeBank.accountType || 'Savings'} •• {activeBank.accountNumberSuffix}</Text>
              </View>
            </View>
            <View style={[s.optGroup, { borderColor: line }]}>
              <Pressable
                onPress={() => {
                  setOptionsSheet(false);
                  setIsEditingBank(true);
                }}
                style={[s.optRow, { borderBottomColor: line }]}
              >
                <Feather name="edit-3" size={18} color={ink} />
                <Text style={[s.optLabel, { color: ink }]}>Edit account details</Text>
                <Feather name="chevron-right" size={16} color={muted} />
              </Pressable>
              <Pressable onPress={scanLast48h} disabled={isSyncingSms} style={[s.optRow, { borderBottomColor: line }]}>
                {isSyncingSms ? <ActivityIndicator size="small" color={ink} /> : <Feather name="refresh-cw" size={18} color={ink} />}
                <View style={{ flex: 1 }}>
                  <Text style={[s.optLabel, { color: ink, flex: 0 }]}>Check missed transactions</Text>
                  <Text style={[s.optSub, { color: muted }]}>Reads the last 48 hours of bank messages</Text>
                </View>
                <Feather name="chevron-right" size={16} color={muted} />
              </Pressable>
              <View style={[s.optRow, { borderBottomWidth: 0 }]}>
                <Feather name="message-square" size={18} color={ink} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.optLabel, { color: ink, flex: 0 }]}>Auto-track from SMS</Text>
                  <Text style={[s.optSub, { color: muted }]}>Updates balance from new bank alerts</Text>
                </View>
                <Switch
                  value={smsConsent}
                  onValueChange={toggleSmsConsent}
                  trackColor={{ false: isDark ? '#3A3A3C' : '#D1D5DB', true: '#16A34A' }}
                  thumbColor="#FFFFFF"
                  ios_backgroundColor={isDark ? '#3A3A3C' : '#D1D5DB'}
                />
              </View>
            </View>
            <Pressable onPress={() => setConfirmRemove(true)} style={[s.removeRow, { borderColor: line }]}>
              <Feather name="trash-2" size={18} color={red} />
              <Text style={[s.optLabel, { color: red }]}>Remove account</Text>
            </Pressable>
          </View>
        )}
      </Sheet>

      {/* PDF password */}
      <Sheet
        visible={passwordSheet}
        onClose={() => {
          setPasswordSheet(false);
          setPendingPdf(null);
          setPdfPassword('');
          setPasswordError(null);
        }}
        bg={surface}
        dark={isDark}
      >
        <View style={[s.sheetIcon, { backgroundColor: passwordError ? (isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3') : isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
          <Feather name={passwordError ? 'alert-circle' : 'lock'} size={22} color={passwordError ? red : isDark ? LIME : FOREST} />
        </View>
        <Text style={[s.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
          This statement is locked
        </Text>
        <Text style={[s.sheetText, { color: passwordError ? red : muted }]}>
          {passwordError || 'Enter the PDF password from your bank to read it.'}
        </Text>
        <TextInput
          value={pdfPassword}
          onChangeText={(v) => {
            setPdfPassword(v);
            if (passwordError) setPasswordError(null);
          }}
          placeholder="PDF password"
          placeholderTextColor={muted}
          secureTextEntry
          autoFocus
          onSubmitEditing={submitPassword}
          style={[s.pwdInput, { color: ink, borderColor: passwordError ? red : line, backgroundColor: pageBg }]}
          accessibilityLabel="PDF password"
        />
        <Pressable onPress={submitPassword} style={[s.sheetPrimary, { backgroundColor: isDark ? LIME : FOREST }]}>
          <Text style={[s.sheetPrimaryText, { color: isDark ? FOREST : LIME }]}>Unlock statement</Text>
        </Pressable>
      </Sheet>

      {/* SMS consent */}
      <Sheet
        visible={consentSheet}
        onClose={() => {
          setConsentSheet(false);
          setSmsConsent(false);
        }}
        bg={surface}
        dark={isDark}
      >
        <View style={[s.sheetIcon, { backgroundColor: isDark ? 'rgba(184,243,107,0.14)' : '#E3F2E8' }]}>
          <Feather name="shield" size={22} color={isDark ? LIME : FOREST} />
        </View>
        <Text style={[s.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
          Track this account from SMS?
        </Text>
        <Text style={[s.sheetText, { color: muted }]}>
          Regent reads only transaction alerts from {activeBank.bankName} to keep your balance and history up to date. Personal messages are never read.
        </Text>
        <Pressable onPress={agreeToConsent} style={[s.sheetPrimary, { backgroundColor: isDark ? LIME : FOREST }]}>
          <Text style={[s.sheetPrimaryText, { color: isDark ? FOREST : LIME }]}>Turn on auto-tracking</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setConsentSheet(false);
            setSmsConsent(false);
          }}
          style={[s.sheetSecondary, { borderColor: line }]}
        >
          <Text style={[s.sheetSecondaryText, { color: ink }]}>Not now</Text>
        </Pressable>
      </Sheet>

      {/* Errors */}
      <Sheet visible={errorSheet !== null} onClose={() => setErrorSheet(null)} bg={surface} dark={isDark}>
        <View style={[s.sheetIcon, { backgroundColor: isDark ? 'rgba(224,49,49,0.2)' : '#FFE3E3' }]}>
          <Feather name="alert-triangle" size={22} color={red} />
        </View>
        <Text style={[s.sheetTitle, { color: ink, fontFamily: display, fontWeight: display ? undefined : '800' }]}>
          {errorSheet?.title}
        </Text>
        <Text style={[s.sheetText, { color: muted }]}>{errorSheet?.message}</Text>
        <Pressable onPress={() => setErrorSheet(null)} style={[s.sheetPrimary, { backgroundColor: isDark ? LIME : FOREST }]}>
          <Text style={[s.sheetPrimaryText, { color: isDark ? FOREST : LIME }]}>OK</Text>
        </Pressable>
      </Sheet>

      <ReviewTransactionsModal
        visible={reviewVisible}
        onClose={() => setReviewVisible(false)}
        bank={activeBank}
        rawTransactions={extracted}
        detectedFinalBalance={detectedFinalBalance}
        onConfirmSuccess={async (summary: any) => {
          await syncService.sync();
          await fetchIncomeRecords();
          Alert.alert(
            'Import complete',
            `${summary.addedTransactionsCount} out and ${summary.addedIncomeCount} in added. Balance is now ${inr(summary.updatedBalance, 2)}.`
          );
        }}
      />
    </>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  container: { height: '92%', borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, overflow: 'hidden', width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 12 },

  brandCard: { height: 176, borderRadius: 26, padding: 18, overflow: 'hidden' },
  ring: { position: 'absolute', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  brandTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brandName: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  brandSub: { color: 'rgba(255,255,255,0.78)', fontSize: 12, marginTop: 2 },
  brandBottom: { flexDirection: 'row', alignItems: 'flex-end', marginTop: 'auto', gap: 8 },
  brandLabel: { color: 'rgba(255,255,255,0.78)', fontSize: 12 },
  brandBalance: { color: '#FFFFFF', fontSize: 32, letterSpacing: -0.8, fontVariant: ['tabular-nums'] },
  ghostBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  ghostBtnLg: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  solidBtnLg: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },

  importRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  importBtn: { flex: 1, height: 44, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  importText: { fontSize: 13, fontWeight: '600' },

  filterRow: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 6 },
  search: { flex: 1, height: 42, borderRadius: 14, borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  searchInput: { flex: 1, fontSize: 14, paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  segment: { flexDirection: 'row', borderRadius: 14, padding: 3 },
  segBtn: { height: 36, paddingHorizontal: 12, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  segShadow: { shadowColor: '#0B1F17', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.12, shadowRadius: 3, elevation: 1 },
  segText: { fontSize: 13, fontWeight: '600' },

  monthHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: 4, paddingTop: 16, paddingBottom: 8 },
  monthTitle: { fontSize: 15, fontWeight: '700' },
  monthMeta: { fontSize: 12 },

  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 14, borderLeftWidth: 1, borderRightWidth: 1 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 12, paddingRight: 14 },
  rowName: { fontSize: 15, fontWeight: '600' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowAmt: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  empty: { alignItems: 'center', paddingTop: 40, paddingHorizontal: 24 },
  emptyIcon: { width: 52, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  emptyText: { fontSize: 13, marginTop: 4, textAlign: 'center' },

  workingOverlay: { ...(StyleSheet.absoluteFill as object), backgroundColor: 'rgba(7, 17, 13, 0.55)', alignItems: 'center', justifyContent: 'center', padding: 32 },
  workingCard: { borderRadius: 24, paddingVertical: 28, paddingHorizontal: 24, alignItems: 'center', minWidth: 240 },
  workingText: { fontSize: 15, fontWeight: '600', marginTop: 14, textAlign: 'center' },

  sheetIcon: { width: 52, height: 52, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  sheetTitle: { fontSize: 22, letterSpacing: -0.4, marginTop: 16 },
  sheetText: { fontSize: 15, lineHeight: 22, marginTop: 6 },
  sheetPrimary: { height: 54, borderRadius: 27, alignItems: 'center', justifyContent: 'center', marginTop: 22 },
  sheetPrimaryText: { fontSize: 15, fontWeight: '700' },
  sheetSecondary: { height: 54, borderRadius: 27, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginTop: 10 },
  sheetSecondaryText: { fontSize: 15, fontWeight: '600' },
  pwdInput: { height: 52, borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, fontSize: 16, marginTop: 18, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },

  sheetHeadRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  optTitle: { fontSize: 16, fontWeight: '700' },
  optSub: { fontSize: 12, marginTop: 2 },
  optGroup: { borderWidth: 1, borderRadius: 20, overflow: 'hidden' },
  optRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, minHeight: 56, borderBottomWidth: StyleSheet.hairlineWidth },
  optLabel: { flex: 1, fontSize: 15, fontWeight: '600' },
  removeRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, height: 56, borderRadius: 20, borderWidth: 1, marginTop: 12 },
});