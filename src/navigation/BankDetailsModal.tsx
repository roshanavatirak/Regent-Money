import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Modal, 
  View, 
  Text, 
  TouchableOpacity, 
  ScrollView, 
  TextInput, 
  ActivityIndicator, 
  Alert, 
  StyleSheet, 
  FlatList,
  SectionList,
  Switch,
  KeyboardAvoidingView,
  Platform,
  PermissionsAndroid,
  Linking,
  NativeModules
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { useNavigation } from '@react-navigation/native';
import { useTheme, useBankStore } from '../store';
import { useTransactionStore } from '../store';
import { authService } from '../services/authService';
import { parseStatementTextWithAI } from '../services/aiService';
import { syncService } from '../services/syncService';
import { getBackendUrl } from '../config/api';
import { ReviewTransactionsModal } from './ReviewTransactionsModal';
import { TransactionDetailScreen } from './TransactionDetailScreen';
import { EditBankScreen } from './EditBankScreen';
import { ManualTransactionScreen } from './ManualTransactionScreen';
import { smsCatchupService } from '../services/smsCatchupService';
import { smsPermissionService } from '../services/smsPermissionService';
import { uploadFile, UploadError, isPasswordRequired } from '../services/uploadFile';

const BACKEND_URL = getBackendUrl();

interface BankDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: any | null;
}

export const BankDetailsModal = ({ visible, onClose, bank }: BankDetailsModalProps) => {
  const navigation = useNavigation<any>();
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);

  const transactions = useTransactionStore((state) => state.transactions);

  const [localBank, setLocalBank] = useState<any>(bank);

  useEffect(() => {
    setLocalBank(bank);
  }, [bank]);

  const activeBank = localBank || bank;
  
  const [activeTab, setActiveTab] = useState<'all' | 'debits' | 'credits'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [incomeRecords, setIncomeRecords] = useState<any[]>([]);
  const [loadingIncome, setLoadingIncome] = useState(false);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [ocrStatusText, setOcrStatusText] = useState('');

  // Password protected PDF flow states
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [pendingPdf, setPendingPdf] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [uploadErrorModal, setUploadErrorModal] = useState<{ title: string; message: string } | null>(null);
  const [reviewModalVisible, setReviewModalVisible] = useState(false);
  const [extractedTransactions, setExtractedTransactions] = useState<any[]>([]);
  const [detectedFinalBalance, setDetectedFinalBalance] = useState<number | null>(null);
  const [selectedTransactionForDetail, setSelectedTransactionForDetail] = useState<any | null>(null);
  const [isEditingBank, setIsEditingBank] = useState(false);
  const [manualTxType, setManualTxType] = useState<'credit' | 'debit' | null>(null);

  useEffect(() => {
    if (!visible) {
      setIsEditingBank(false);
      setManualTxType(null);
      setSelectedTransactionForDetail(null);
    }
  }, [visible]);

  // SMS Consent toggle states
  const [smsConsent, setSmsConsent] = useState(activeBank?.smsConsent || false);
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [optionsMenuVisible, setOptionsMenuVisible] = useState(false);

  useEffect(() => {
    if (activeBank) {
      setSmsConsent(activeBank.smsConsent || false);
    }
  }, [activeBank]);

  const saveSmsConsent = async (val: boolean) => {
    if (!activeBank) return;
    setSmsConsent(val);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${BACKEND_URL}/sync/bank-profile/${activeBank.id}/consent`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ smsConsent: val }),
      });

      if (!response.ok) {
        throw new Error('Failed to update SMS sync consent on server.');
      }
      
      await syncService.sync();
    } catch (e: any) {
      setSmsConsent(!val);
      Alert.alert('Consent Error', e.message || 'Unable to update background sync permission.');
    }
  };

  const handleToggleSmsConsent = async (val: boolean) => {
    if (!activeBank) return;

    if (val) {
      setConsentModalVisible(true);
    } else {
      await saveSmsConsent(false);
    }
  };

  const [confirmUnlinkVisible, setConfirmUnlinkVisible] = useState(false);
  const [unlinking, setUnlinking] = useState(false);

  const executeUnlinkBank = async () => {
    if (!activeBank) return;
    setUnlinking(true);
    try {
      const token = authService.getAccessToken();
      if (token) {
        await fetch(`${BACKEND_URL}/sync/bank-profile/${activeBank.id}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        });
      }
      useBankStore.getState().removeBankProfileState(activeBank.id);
      await syncService.sync().catch(() => {});
      setConfirmUnlinkVisible(false);
      setOptionsMenuVisible(false);
      onClose();
    } catch (err: any) {
      console.warn('[BankDetailsModal] Failed to unlink bank:', err?.message || err);
      // Fallback local removal even if offline
      useBankStore.getState().removeBankProfileState(activeBank.id);
      setConfirmUnlinkVisible(false);
      setOptionsMenuVisible(false);
      onClose();
    } finally {
      setUnlinking(false);
    }
  };

  const [isSyncingSms, setIsSyncingSms] = useState(false);

  const handleSyncLast48HoursSms = async () => {
    if (!activeBank) return;
    setOptionsMenuVisible(false);

    if (Platform.OS !== 'android') {
      Alert.alert(
        'Android Device Only',
        'Automatic SMS inbox scanning is only available on Android devices.'
      );
      return;
    }

    setIsSyncingSms(true);
    try {
      const granted = await smsPermissionService.requestSmsPermissions();
      if (!granted) {
        Alert.alert(
          'SMS Permission Denied',
          'SMS read permission is required to scan your inbox for bank alerts. Please allow SMS permission in Android Settings.'
        );
        return;
      }

      const Sms = NativeModules.Sms;
      if (!Sms || typeof Sms.list !== 'function') {
        Alert.alert(
          'Module Unavailable',
          'Native SMS reader is not compiled into your currently installed build.'
        );
        return;
      }

      const res = await smsCatchupService.reconcile(true, 48, activeBank.id);
      await fetchIncomeRecords();
      await syncService.sync(true).catch(() => {});

      if (res && res.syncedCount > 0) {
        Alert.alert(
          'Sync Complete',
          `Successfully recovered and added ${res.syncedCount} missed transaction(s) for ${activeBank.bankName || 'Bank'}! Balance updated.`
        );
      } else {
        Alert.alert(
          'Inbox Up to Date',
          `Scanned SMS inbox for the last 48 hours for •••• ${activeBank.accountNumberSuffix}. No new missed transactions found. Duplicate entries avoided.`
        );
      }
    } catch (err: any) {
      Alert.alert('Scan Failed', err?.message || 'Error scanning SMS inbox.');
    } finally {
      setIsSyncingSms(false);
    }
  };

  // Fetch Income Records for Credit transactions
  const fetchIncomeRecords = async () => {
    if (!bank) return;
    setLoadingIncome(true);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${BACKEND_URL}/sync/income-records`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) throw new Error('Failed to fetch income records');
      const data = await response.json();
      
      const mappedIncome = (data || [])
        .filter((inc: any) => (inc.bankProfileId ?? inc.bank_profile_id) === bank.id)
        .map((inc: any) => ({
          id: inc.id,
          amount: parseFloat(inc.amount || 0),
          category: inc.category || 'income',
          merchant: inc.source || 'Income',
          timestamp: Number(inc.timestamp || Date.now()),
          type: 'credit',
        }));
      setIncomeRecords(mappedIncome);
    } catch (e) {
      console.warn('Error fetching income records:', e);
    } finally {
      setLoadingIncome(false);
    }
  };

  useEffect(() => {
    if (visible && bank) {
      fetchIncomeRecords();
    }
  }, [visible, bank]);

  // Filter transactions for this bank
  const currentBankId = activeBank?.id || bank?.id;
  const bankDebits = currentBankId
    ? transactions
        .filter((tx) => tx.bankProfileId === currentBankId)
        .map((tx) => ({ ...tx, type: 'debit' }))
    : [];

  const rawMergedList = [...bankDebits, ...incomeRecords].sort((a, b) => {
    const diff = (Number(b.timestamp) || 0) - (Number(a.timestamp) || 0);
    if (diff !== 0) return diff;
    return (Number(b.updatedAt || 0)) - (Number(a.updatedAt || 0));
  });

  // Deduplicate transactions by unique database ID or reference ID without dropping legitimate same-day payments
  const mergedList = useMemo(() => {
    const seen = new Set<string>();
    const result: any[] = [];
    for (const item of rawMergedList) {
      if (!item) continue;
      if (item.id && seen.has(`id:${item.id}`)) continue;
      if (item.id) seen.add(`id:${item.id}`);

      const refId = item.referenceId || (item.smsId && item.smsId.startsWith('ref_') ? item.smsId : null);
      if (refId) {
        if (seen.has(`ref:${refId}`)) continue;
        seen.add(`ref:${refId}`);
        result.push(item);
        continue;
      }

      // Fallback: only skip if identical type, amount, merchant and millisecond timestamp
      const sig = `sig:${item.type || 'debit'}_${Math.round(Number(item.amount) * 100)}_${item.timestamp}`;
      if (seen.has(sig)) continue;
      seen.add(sig);
      result.push(item);
    }
    return result;
  }, [rawMergedList]);

  const filteredData = mergedList.filter((item) => {
    if (activeTab === 'debits' && item.type !== 'debit') return false;
    if (activeTab === 'credits' && item.type !== 'credit') return false;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      const matchMerchant = item.merchant?.toLowerCase().includes(query);
      const matchCategory = item.category?.toLowerCase().includes(query);
      return matchMerchant || matchCategory;
    }
    return true;
  });

  // Group filtered transactions by Month & Year with totals for Paytm-style sticky headers
  const sections = useMemo(() => {
    const groups: { [key: string]: { title: string; totalSpent: number; totalIncome: number; data: any[] } } = {};
    const order: string[] = [];

    for (const item of filteredData) {
      const parsedTime = typeof item.timestamp === 'number' ? item.timestamp : new Date(item.timestamp).getTime();
      const date = isNaN(parsedTime) ? new Date() : new Date(parsedTime);
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

      if (!groups[key]) {
        const title = date.toLocaleDateString('en-IN', {
          month: 'long',
          year: 'numeric',
        });
        groups[key] = {
          title,
          totalSpent: 0,
          totalIncome: 0,
          data: [],
        };
        order.push(key);
      }

      groups[key].data.push(item);
      const amt = Number(item.amount) || 0;
      if (item.type === 'debit') {
        groups[key].totalSpent += amt;
      } else {
        groups[key].totalIncome += amt;
      }
    }

    return order.map((key) => groups[key]);
  }, [filteredData]);

  // Local regex matcher for common SMS transaction formats
  const parseTextLocally = (text: string) => {
    const lines = text.split('\n');
    const parsed: any[] = [];
    const debitRegexes = [
      /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s*(?:debited|spent|paid|withdrawn|sent)/i,
      /(?:debited|spent|paid|withdrawn|sent)\s*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i,
    ];
    const creditRegexes = [
      /(?:Rs\.?|INR)\s*([\d,]+(?:\.\d{2})?)\s*(?:credited|received|deposited|added)/i,
      /(?:credited|received|deposited|added)\s*(?:Rs\.?|INR)?\s*([\d,]+(?:\.\d{2})?)/i,
    ];
    const dateRegex = /(\d{2}[-/.]\d{2}[-/.]\d{2,4}|\d{4}[-/.]\d{2}[-/.]\d{2})/;
    const timeRegex = /(?:at\s+)?(\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?)/i;
    const merchantRegex = /(?:to|at|from|by|at)\s+([A-Za-z0-9\s]{3,15})/i;

    for (const line of lines) {
      if (!line.trim()) continue;
      let amount = 0;
      let type: 'debit' | 'credit' | null = null;
      let date = new Date().toISOString().split('T')[0];
      let time: string | null = null;
      let merchant = '';

      for (const rx of debitRegexes) {
        const match = line.match(rx);
        if (match) {
          amount = parseFloat(match[1].replace(/,/g, ''));
          type = 'debit';
          break;
        }
      }
      if (!type) {
        for (const rx of creditRegexes) {
          const match = line.match(rx);
          if (match) {
            amount = parseFloat(match[1].replace(/,/g, ''));
            type = 'credit';
            break;
          }
        }
      }

      if (type && amount > 0) {
        const dateMatch = line.match(dateRegex);
        if (dateMatch) {
          const rawDate = dateMatch[1];
          const parts = rawDate.split(/[-/.]/);
          if (parts.length === 3) {
            if (parts[0].length === 4) {
              date = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            } else {
              const year = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
              date = `${year}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
            }
          }
        }

        const timeMatch = line.match(timeRegex);
        if (timeMatch) {
          const rawTime = timeMatch[1].trim();
          const ampmMatch = rawTime.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
          if (ampmMatch) {
            let h = parseInt(ampmMatch[1], 10);
            const m = parseInt(ampmMatch[2], 10);
            const ampm = ampmMatch[4]?.toLowerCase();
            if (ampm === 'pm' && h < 12) h += 12;
            if (ampm === 'am' && h === 12) h = 0;
            if (!isNaN(h) && !isNaN(m)) {
              time = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
          }
        }

        const merchMatch = line.match(merchantRegex);
        if (merchMatch) {
          merchant = merchMatch[1].trim();
        } else {
          merchant = type === 'debit' ? 'Spends' : 'Credits';
        }
        parsed.push({ amount, type, date, time, merchant });
      }
    }
    return parsed;
  };

  const syncExtractedTransactions = async (parsedTxs: any[]) => {
    if (!parsedTxs || parsedTxs.length === 0) {
      throw new Error('No transactions could be extracted from this document.');
    }

    setOcrStatusText('Syncing with database...');
    const token = authService.getAccessToken();
    if (!token) throw new Error('Session authentication missing.');

    const response = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        bankProfileId: (activeBank || bank)?.id,
        transactions: parsedTxs,
      }),
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.message || 'Sync failed.');
    }

    const syncResult = await response.json();
    await syncService.sync();
    await fetchIncomeRecords();

    Alert.alert(
      'Import Successful',
      `Import summary:\n• Debits imported: ${syncResult.addedTransactionsCount}\n• Credits imported: ${syncResult.addedIncomeCount}\n\nNew Bank Balance: ₹${syncResult.updatedBalance.toLocaleString('en-IN')}`
    );
  };

  const processExtractedText = async (text: string) => {
    try {
      setOcrStatusText('Running local parser...');
      let parsedTxs = parseTextLocally(text);

      if (parsedTxs.length === 0) {
        setOcrStatusText('Structuring with server AI...');
        parsedTxs = await parseStatementTextWithAI(text);
      }

      await syncExtractedTransactions(parsedTxs);
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'Unable to complete statement ingestion.');
    } finally {
      setProcessingOcr(false);
      setOcrStatusText('');
    }
  };

  // Upload and parse statement file (PDF or image) directly on backend
  const uploadStatementFile = async (fileAsset: any, password?: string) => {
    setProcessingOcr(true);
    setOcrStatusText(password ? 'Decrypting & parsing statement on server...' : 'Processing statement on server...');

    try {
      const token = authService.getAccessToken();
      if (!token) throw new UploadError('Session credentials missing.', 401);

      const responseJson = await uploadFile({
        url: `${BACKEND_URL}/sync/upload-statement`,
        fileUri: fileAsset.uri,
        fileName: fileAsset.name || 'statement.pdf',
        webFile: fileAsset.file,
        fields: {
          bankProfileId: (activeBank || bank)?.id,
          password: password || undefined,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
        maxBytes: 25 * 1024 * 1024,
        timeoutMs: 120_000,
      });

      const txs = responseJson.transactions || [];
      if (txs.length === 0) {
        throw new UploadError('No transactions could be extracted from this statement.', 422);
      }

      setExtractedTransactions(txs);
      setDetectedFinalBalance(responseJson.detectedFinalBalance ?? null);
      setPasswordError(null);
      setReviewModalVisible(true);
    } catch (e: any) {
      if (e instanceof UploadError && isPasswordRequired(e.body)) {
        setPasswordError(password ? 'Incorrect password for this PDF statement. Please try again.' : null);
        setPendingPdf(fileAsset);
        setPasswordModalVisible(true);
        return;
      }

      const msg = e?.message || 'Unable to process statement.';
      const isValidation = e instanceof UploadError && e.status != null && e.status >= 400 && e.status < 500;
      const title = isValidation ? 'Statement Import Issue' : 'Upload Failed';

      setUploadErrorModal({
        title,
        message: msg,
      });
      Alert.alert(title, msg);
    } finally {
      setProcessingOcr(false);
      setOcrStatusText('');
    }
  };

  const handlePasswordSubmit = () => {
    if (!pdfPassword.trim()) {
      Alert.alert('Error', 'Please enter a valid password.');
      return;
    }
    if (!pendingPdf) return;

    setPasswordModalVisible(false);
    uploadStatementFile(pendingPdf, pdfPassword);
    setPdfPassword('');
  };

  // Image Upload / Ingestion using Backend AI Vision
  const handleUploadScreenshot = async () => {
    try {
      if (Platform.OS !== 'web') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera roll access is needed to upload screenshots.');
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setProcessingOcr(true);
      setOcrStatusText('Processing screenshot on server...');

      const token = authService.getAccessToken();
      if (!token) throw new UploadError('Session authentication missing.', 401);

      const asset = result.assets[0];
      const responseJson = await uploadFile({
        url: `${BACKEND_URL}/sync/upload-screenshot`,
        fileUri: asset.uri,
        fileName: asset.fileName || 'screenshot.jpg',
        webFile: (asset as any).file,
        fields: {
          bankProfileId: (activeBank || bank)?.id,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
        maxBytes: 15 * 1024 * 1024,
        timeoutMs: 60_000,
      });

      const txs = responseJson.transactions || [];
      if (txs.length === 0) {
        throw new UploadError('No transactions could be detected in this screenshot.', 422);
      }

      setExtractedTransactions(txs);
      setDetectedFinalBalance(responseJson.detectedFinalBalance ?? null);
      setReviewModalVisible(true);
    } catch (e: any) {
      const msg = e.message || 'Failed to process screenshot.';
      let title = 'Invalid Screenshot';
      const lower = msg.toLowerCase();
      if (lower.includes('selfie') || lower.includes('personal photo')) {
        title = 'Selfie / Personal Photo Detected';
      } else if (lower.includes('blurry') || lower.includes('low quality') || lower.includes('unreadable')) {
        title = 'Image Too Blurry';
      } else if (lower.includes('not contain') || lower.includes('unrelated') || lower.includes('does not contain')) {
        title = 'Non-Financial Image';
      } else if (lower.includes('no transaction') || lower.includes('no transactions')) {
        title = 'No Transactions Found';
      }

      setUploadErrorModal({
        title,
        message: msg,
      });
      Alert.alert(title, msg);
    } finally {
      setProcessingOcr(false);
      setOcrStatusText('');
    }
  };

  // Document Statement Upload (Delegates to backend for PDF or image statement)
  const handleUploadStatement = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (doc.canceled || !doc.assets?.[0]?.uri) return;

      setPasswordError(null);
      await uploadStatementFile(doc.assets[0]);
    } catch (e: any) {
      setProcessingOcr(false);
      Alert.alert('Upload Error', e.message || 'Failed to select document.');
    }
  };

  if (!visible || !activeBank) {
    return null;
  }

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="none"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            onPress={onClose}
            activeOpacity={1}
          />
          <View style={styles.cardContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.title}>{activeBank.bankName}</Text>
                <Text style={styles.subtitle}>{activeBank.accountType || 'Savings'} •••• {activeBank.accountNumberSuffix}</Text>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setOptionsMenuVisible(true)}
                  style={styles.menuBtn}
                  activeOpacity={0.7}
                  accessibilityLabel="Account Options"
                >
                  <Feather name="more-vertical" size={18} color="#8E8E9F" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Compact Balance Card with Inline Credit/Debit buttons */}
            <View style={styles.balanceCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <View>
                  <Text style={styles.balanceLabel}>Current Balance</Text>
                  <Text style={styles.balanceValue}>₹{activeBank.currentBalance.toLocaleString('en-IN')}</Text>
                  {activeBank.lastSyncTimestamp && (
                    <Text style={styles.syncText}>
                      Synced: {new Date(activeBank.lastSyncTimestamp).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>

                {/* Compact Quick Actions */}
                <View style={{ flexDirection: 'row', gap: 6 }}>
                  <TouchableOpacity
                    style={[styles.compactActionBtn, styles.compactCreditBtn]}
                    onPress={() => {
                      setManualTxType('credit');
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="plus-circle" size={13} color="#2dba4e" style={{ marginRight: 4 }} />
                    <Text style={styles.compactCreditText}>+ Credit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.compactActionBtn, styles.compactDebitBtn]}
                    onPress={() => {
                      setManualTxType('debit');
                    }}
                    activeOpacity={0.8}
                  >
                    <Feather name="minus-circle" size={13} color="#ef4444" style={{ marginRight: 4 }} />
                    <Text style={styles.compactDebitText}>- Debit</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Ingestion Action Buttons */}
            <View style={styles.ocrActionsRow}>
              <TouchableOpacity 
                style={styles.actionBtn} 
                onPress={handleUploadScreenshot}
                activeOpacity={0.8}
              >
                <Ionicons name="image-outline" size={18} color="#2dba4e" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Upload Screenshot</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={styles.actionBtn} 
                onPress={handleUploadStatement}
                activeOpacity={0.8}
              >
                <Ionicons name="document-text-outline" size={18} color="#2dba4e" style={{ marginRight: 6 }} />
                <Text style={styles.actionBtnText}>Upload Statement</Text>
              </TouchableOpacity>
            </View>


            {/* Search bar */}
            <View style={styles.searchContainer}>
              <Feather name="search" size={16} color={colors.textSecondary} style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search merchant or category..."
                placeholderTextColor={colors.textTertiary}
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <Feather name="x" size={16} color={colors.textSecondary} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filters Tab */}
            <View style={styles.tabContainer}>
              {(['all', 'debits', 'credits'] as const).map((tab) => {
                const active = activeTab === tab;
                return (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tabButton, active && styles.activeTabButton]}
                    onPress={() => setActiveTab(tab)}
                  >
                    <Text style={[styles.tabText, active && styles.activeTabText]}>
                      {tab === 'all' ? 'All' : tab === 'debits' ? 'Spendings' : 'Income'}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Transactions List with Paytm-style Sticky Month Headers */}
            {loadingIncome ? (
              <ActivityIndicator size="small" color="#2dba4e" style={{ marginTop: 20 }} />
            ) : sections.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="archive" size={32} color="#8E8E9F" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>No transactions found for this account.</Text>
              </View>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={(item, index) => item.id || `tx-${index}`}
                stickySectionHeadersEnabled={true}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 24 }}
                renderSectionHeader={({ section: { title, totalSpent, totalIncome } }) => (
                  <View style={styles.stickySectionHeader}>
                    <Text style={styles.stickySectionTitle}>{title}</Text>
                    <View style={styles.stickySectionRight}>
                      {activeTab === 'credits' ? (
                        <>
                          <Text style={styles.stickySectionLabel}>Total Received</Text>
                          <Text style={[styles.stickySectionAmount, { color: '#2dba4e' }]}>
                            +₹{Math.round(totalIncome).toLocaleString('en-IN')}
                          </Text>
                        </>
                      ) : activeTab === 'debits' ? (
                        <>
                          <Text style={styles.stickySectionLabel}>Total Spent</Text>
                          <Text style={styles.stickySectionAmount}>
                            ₹{Math.round(totalSpent).toLocaleString('en-IN')}
                          </Text>
                        </>
                      ) : (
                        <>
                          <Text style={styles.stickySectionLabel}>
                            {totalSpent > 0 ? 'Total Spent' : 'Total Received'}
                          </Text>
                          <Text
                            style={[
                              styles.stickySectionAmount,
                              totalSpent === 0 && totalIncome > 0 ? { color: '#2dba4e' } : {},
                            ]}
                          >
                            {totalSpent > 0
                              ? `₹${Math.round(totalSpent).toLocaleString('en-IN')}`
                              : `+₹${Math.round(totalIncome).toLocaleString('en-IN')}`}
                          </Text>
                        </>
                      )}
                    </View>
                  </View>
                )}
                renderItem={({ item }) => {
                  const isDebit = item.type === 'debit';
                  return (
                    <TouchableOpacity
                      style={styles.txRow}
                      onPress={() => {
                        setSelectedTransactionForDetail(item);
                      }}
                      activeOpacity={0.7}
                    >
                      <View style={styles.txLeft}>
                        <View style={[
                          styles.iconBadge, 
                          { backgroundColor: isDebit ? 'rgba(207, 34, 46, 0.08)' : 'rgba(45, 186, 78, 0.08)' }
                        ]}>
                          <Feather 
                            name={isDebit ? "arrow-down-right" : "arrow-up-left"} 
                            size={14} 
                            color={isDebit ? '#cf222e' : '#2dba4e'} 
                          />
                        </View>
                        <View>
                          <Text style={styles.txMerchant}>{item.merchant}</Text>
                          <Text style={styles.txDate}>
                            {new Date(item.timestamp).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.txRight}>
                        <Text style={[
                          styles.txAmount,
                          { color: isDebit ? colors.text : '#2dba4e' }
                        ]}>
                          {isDebit ? '-' : '+'}₹{item.amount.toLocaleString('en-IN')}
                        </Text>
                        <Text style={styles.txCategory}>{item.category}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                }}
              />
            )}
          </View>
        </View>

        {/* OCR processing screen loader */}
        {processingOcr && (
          <View style={styles.ocrLoaderOverlay}>
            <ActivityIndicator size="large" color="#2dba4e" />
            <Text style={styles.ocrLoaderText}>{ocrStatusText}</Text>
          </View>
        )}

        {/* In-place Transaction Detail overlay preserving exact bank transactions list state */}
        {selectedTransactionForDetail && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: colors.background }]}>
            <TransactionDetailScreen
              transaction={selectedTransactionForDetail}
              bankName={activeBank.bankName}
              accountNumberSuffix={activeBank.accountNumberSuffix}
              onBack={() => setSelectedTransactionForDetail(null)}
              onSuccess={() => {
                setSelectedTransactionForDetail(null);
                fetchIncomeRecords();
              }}
            />
          </View>
        )}

        {/* In-place Edit Bank Details overlay */}
        {isEditingBank && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: colors.background }]}>
            <EditBankScreen
              bank={activeBank}
              onBack={() => setIsEditingBank(false)}
              onSuccess={(updated) => {
                setIsEditingBank(false);
                setLocalBank(updated);
              }}
            />
          </View>
        )}

        {/* In-place Manual Transaction overlay */}
        {manualTxType && (
          <View style={[StyleSheet.absoluteFill, { zIndex: 9999, backgroundColor: colors.background }]}>
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

      {/* Password Prompt modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          setPasswordModalVisible(false);
          setPendingPdf(null);
          setPdfPassword('');
          setPasswordError(null);
        }}
      >
        <View style={styles.pwdOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={{ width: '100%', alignItems: 'center' }}
          >
            <View style={styles.pwdCard}>
              <View style={styles.pwdHeader}>
                <Feather
                  name={passwordError ? "alert-circle" : "lock"}
                  size={24}
                  color={passwordError ? "#ef4444" : "#FFD700"}
                  style={{ marginBottom: 10 }}
                />
                <Text style={[styles.pwdTitle, passwordError ? { color: '#ef4444' } : null]}>
                  {passwordError ? 'Incorrect Password' : 'Statement is Locked'}
                </Text>
                <Text style={[styles.pwdSubtitle, passwordError ? { color: '#ef4444' } : null]}>
                  {passwordError || 'Please enter the PDF password to open and extract transaction records.'}
                </Text>
              </View>

              <TextInput
                style={[
                  styles.pwdInput,
                  passwordError ? { borderColor: '#ef4444', borderWidth: 1 } : null,
                ]}
                placeholder="Enter PDF password"
                placeholderTextColor={colors.textTertiary}
                secureTextEntry
                value={pdfPassword}
                onChangeText={(val) => {
                  setPdfPassword(val);
                  if (passwordError) setPasswordError(null);
                }}
                autoFocus
              />

              <View style={styles.pwdButtons}>
                <TouchableOpacity 
                  style={[styles.pwdBtn, styles.pwdCancelBtn]} 
                  onPress={() => {
                    setPasswordModalVisible(false);
                    setPendingPdf(null);
                    setPdfPassword('');
                    setPasswordError(null);
                  }}
                >
                  <Text style={styles.pwdCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.pwdBtn, styles.pwdSubmitBtn]} 
                  onPress={handlePasswordSubmit}
                >
                  <Text style={styles.pwdSubmitText}>Decrypt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Custom SMS Consent Modal */}
      <Modal
        visible={consentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setConsentModalVisible(false);
          setSmsConsent(false);
        }}
      >
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdCard}>
            <View style={styles.pwdHeader}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(45, 186, 78, 0.1)', width: 48, height: 48, borderRadius: 24, marginBottom: 12, marginRight: 0 }]}>
                <Feather name="shield" size={24} color="#2dba4e" />
              </View>
              <Text style={styles.pwdTitle}>Enable SMS Sync</Text>
              <Text style={styles.pwdSubtitle}>
                Do you authorize Regent Money to read incoming transaction SMS alerts from this bank account to automatically sync your balance and transaction history in real-time?
              </Text>
            </View>

            <View style={styles.pwdButtons}>
              <TouchableOpacity 
                style={[styles.pwdBtn, styles.pwdCancelBtn]} 
                onPress={() => {
                  setConsentModalVisible(false);
                  setSmsConsent(false);
                }}
              >
                <Text style={styles.pwdCancelText}>Disagree</Text>
              </TouchableOpacity>

              <TouchableOpacity 
                style={[styles.pwdBtn, styles.pwdSubmitBtn]} 
                onPress={async () => {
                  setConsentModalVisible(false);
                  if (Platform.OS === 'android') {
                    try {
                      const granted = await PermissionsAndroid.requestMultiple([
                        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
                        PermissionsAndroid.PERMISSIONS.READ_SMS,
                      ]);
                      const receiveGranted = granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED;
                      const readGranted = granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED;

                      if (!receiveGranted || !readGranted) {
                        Alert.alert(
                          'SMS Permissions Required',
                          'To enable background sync, please grant SMS permissions. You can do this in the app details settings.',
                          [
                            { text: 'Cancel', style: 'cancel', onPress: () => setSmsConsent(false) },
                            { text: 'Open Settings', onPress: () => Linking.openSettings() }
                          ]
                        );
                        setSmsConsent(false);
                        return;
                      }
                    } catch (err) {
                      console.warn('SMS Permissions request failed:', err);
                      setSmsConsent(false);
                      return;
                    }
                  }
                  await saveSmsConsent(true);
                }}
              >
                <Text style={styles.pwdSubmitText}>Agree</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Three-Dot Options & Settings Menu Modal */}
      <Modal
        visible={optionsMenuVisible && !isEditingBank && !manualTxType}
        transparent
        animationType="none"
        onRequestClose={() => setOptionsMenuVisible(false)}
      >
        <View style={styles.optionsMenuOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              setOptionsMenuVisible(false);
              setConfirmUnlinkVisible(false);
            }}
          />
          <View style={styles.optionsMenuCard}>
            <View style={styles.optionsMenuHeader}>
              <View>
                <Text style={styles.optionsMenuTitle}>
                  {confirmUnlinkVisible ? 'Confirm Unlink' : 'Account Options'}
                </Text>
                <Text style={styles.optionsMenuSubtitle}>
                  {activeBank.bankName} ({activeBank.accountType || 'Savings'} •••• {activeBank.accountNumberSuffix})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setOptionsMenuVisible(false);
                  setConfirmUnlinkVisible(false);
                }}
                style={styles.closeBtn}
                activeOpacity={0.7}
              >
                <Feather name="x" size={16} color="#8E8E9F" />
              </TouchableOpacity>
            </View>

            {confirmUnlinkVisible ? (
              <View style={{ alignItems: 'center', paddingVertical: 10 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: isDark ? 'rgba(239, 68, 68, 0.15)' : '#fee2e2',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 14,
                  }}
                >
                  <Feather name="trash-2" size={26} color="#ef4444" />
                </View>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '800',
                    color: colors.text,
                    textAlign: 'center',
                    marginBottom: 6,
                  }}
                >
                  Unlink Bank Account?
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    color: colors.textSecondary,
                    textAlign: 'center',
                    lineHeight: 18,
                    marginBottom: 20,
                  }}
                >
                  Are you sure you want to remove{' '}
                  <Text style={{ fontWeight: '700', color: colors.text }}>
                    {activeBank.bankName} (•••• {activeBank.accountNumberSuffix})
                  </Text>
                  ? Your local transaction history will remain safely preserved.
                </Text>

                <View style={{ flexDirection: 'row', gap: 10, width: '100%' }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: colors.isDark ? '#1a1a24' : '#f0f2f5',
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                    onPress={() => setConfirmUnlinkVisible(false)}
                    disabled={unlinking}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: colors.textSecondary, fontWeight: '700', fontSize: 13 }}>
                      Cancel
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      backgroundColor: '#ef4444',
                      paddingVertical: 13,
                      borderRadius: 12,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                    onPress={executeUnlinkBank}
                    disabled={unlinking}
                    activeOpacity={0.8}
                  >
                    {unlinking ? (
                      <ActivityIndicator size="small" color="#ffffff" />
                    ) : (
                      <Text style={{ color: '#ffffff', fontWeight: '800', fontSize: 13 }}>
                        Yes, Unlink
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <>
                {/* Edit Bank Details Row */}
                <TouchableOpacity
                  style={styles.menuItemTouchable}
                  onPress={() => {
                    setOptionsMenuVisible(false);
                    setIsEditingBank(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.menuItemIconWrap,
                      {
                        backgroundColor: isDark
                          ? 'rgba(3, 218, 198, 0.12)'
                          : 'rgba(3, 218, 198, 0.15)',
                      },
                    ]}
                  >
                    <Feather name="edit-3" size={18} color={colors.accent || '#03DAC6'} />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.menuItemTitle}>Edit Bank Details</Text>
                    <Text style={styles.menuItemDesc}>
                      Update display name, account suffix, balance, SMS sender ID, UPI ID & keywords.
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary || '#8E8E9F'} />
                </TouchableOpacity>

                <View style={styles.menuItemDivider} />

                {/* Manual Scan SMS Inbox Row */}
                <TouchableOpacity
                  style={styles.menuItemTouchable}
                  onPress={handleSyncLast48HoursSms}
                  disabled={isSyncingSms}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.menuItemIconWrap,
                      {
                        backgroundColor: isDark
                          ? 'rgba(45, 186, 78, 0.12)'
                          : 'rgba(45, 186, 78, 0.15)',
                      },
                    ]}
                  >
                    {isSyncingSms ? (
                      <ActivityIndicator size="small" color="#2dba4e" />
                    ) : (
                      <Feather name="refresh-cw" size={18} color="#2dba4e" />
                    )}
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.menuItemTitle}>
                      {isSyncingSms ? 'Scanning SMS Inbox...' : 'Sync Last 48h Missed Alerts'}
                    </Text>
                    <Text style={styles.menuItemDesc}>
                      Scan SMS inbox for •••• {activeBank.accountNumberSuffix} and add missed transactions without duplicates.
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary || '#8E8E9F'} />
                </TouchableOpacity>

                <View style={styles.menuItemDivider} />

                {/* Background SMS Sync Row inside three dots */}
                <View style={styles.menuItemRow}>
                  <View style={styles.menuItemIconWrap}>
                    <Feather name="message-square" size={18} color="#2dba4e" />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={styles.menuItemTitle}>Background SMS Sync</Text>
                    <Text style={styles.menuItemDesc}>
                      Securely scan incoming bank transaction alerts to update balance & records automatically.
                    </Text>
                  </View>
                  <Switch
                    value={smsConsent}
                    onValueChange={(val) => {
                      setOptionsMenuVisible(false);
                      handleToggleSmsConsent(val);
                    }}
                    trackColor={{ false: '#2c2c35', true: '#2dba4e' }}
                    thumbColor={smsConsent ? '#ffffff' : '#8E8E9F'}
                  />
                </View>

                <View style={styles.menuItemDivider} />

                {/* Unlink Bank Account Row */}
                <TouchableOpacity
                  style={styles.menuItemTouchable}
                  onPress={() => setConfirmUnlinkVisible(true)}
                  activeOpacity={0.7}
                >
                  <View
                    style={[
                      styles.menuItemIconWrap,
                      {
                        backgroundColor: isDark
                          ? 'rgba(239, 68, 68, 0.12)'
                          : 'rgba(239, 68, 68, 0.15)',
                      },
                    ]}
                  >
                    <Feather name="trash-2" size={18} color="#ef4444" />
                  </View>
                  <View style={{ flex: 1, marginRight: 10 }}>
                    <Text style={[styles.menuItemTitle, { color: '#ef4444' }]}>Unlink Bank Account</Text>
                    <Text style={styles.menuItemDesc}>
                      Remove this bank account mapping from your Regent Money profile.
                    </Text>
                  </View>
                  <Feather name="chevron-right" size={18} color={colors.textTertiary || '#8E8E9F'} />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* Structured Upload / Validation Error Modal */}
      <Modal
        visible={uploadErrorModal !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setUploadErrorModal(null)}
      >
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdCard}>
            <View style={styles.pwdHeader}>
              <View style={[styles.iconBadge, { backgroundColor: 'rgba(239, 68, 68, 0.12)', width: 52, height: 52, borderRadius: 26, marginBottom: 14, marginRight: 0 }]}>
                <Feather name="alert-triangle" size={26} color="#ef4444" />
              </View>
              <Text style={styles.pwdTitle}>{uploadErrorModal?.title || 'Upload Error'}</Text>
              <Text style={[styles.pwdSubtitle, { lineHeight: 22, marginTop: 8 }]}>
                {uploadErrorModal?.message}
              </Text>
            </View>

            <View style={styles.pwdButtons}>
              <TouchableOpacity
                style={[styles.pwdBtn, { backgroundColor: colors.accent || '#03DAC6', flex: 1 }]}
                onPress={() => setUploadErrorModal(null)}
                activeOpacity={0.8}
              >
                <Text style={styles.pwdSubmitText}>Got It</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Extracted Transactions Review & Edit Modal */}
      <ReviewTransactionsModal
        visible={reviewModalVisible}
        onClose={() => setReviewModalVisible(false)}
        bank={activeBank}
        rawTransactions={extractedTransactions}
        detectedFinalBalance={detectedFinalBalance}
        onConfirmSuccess={async (summary) => {
          await syncService.sync();
          await fetchIncomeRecords();
          Alert.alert(
            'Import Successful',
            `Imported:\n• Debits: ${summary.addedTransactionsCount}\n• Credits: ${summary.addedIncomeCount}\n\nBank Balance: ₹${summary.updatedBalance.toLocaleString('en-IN')}`
          );
        }}
      />
    </>
  );
};

const getStyles = (colors: any) => StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  cardContainer: {
    backgroundColor: colors.isDark ? '#0b0b0f' : '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    height: '85%',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  title: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  subtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: colors.isDark ? '#1a1a24' : '#f0f2f5',
  },
  menuBtn: {
    padding: 6,
    borderRadius: 20,
    backgroundColor: colors.isDark ? '#1a1a24' : '#f0f2f5',
  },
  optionsMenuOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  optionsMenuCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: colors.isDark ? '#1a1d24' : '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.08)',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  optionsMenuHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    marginBottom: 14,
  },
  optionsMenuTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: colors.text,
  },
  optionsMenuSubtitle: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
  },
  menuItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  menuItemTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  menuItemDivider: {
    height: 1,
    backgroundColor: colors.isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
    marginVertical: 10,
  },
  menuItemIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(45, 186, 78, 0.12)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  menuItemDesc: {
    fontSize: 11,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 15,
  },
  balanceCard: {
    backgroundColor: colors.isDark ? '#14141e' : '#f7f9fa',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 10,
  },
  balanceLabel: {
    fontSize: 10,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  balanceValue: {
    fontSize: 22,
    fontWeight: '900',
    color: colors.text,
    marginTop: 2,
  },
  syncText: {
    fontSize: 9,
    color: colors.textTertiary,
    marginTop: 2,
  },
  compactActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  compactCreditBtn: {
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.12)' : 'rgba(45, 186, 78, 0.08)',
    borderColor: 'rgba(45, 186, 78, 0.35)',
  },
  compactDebitBtn: {
    backgroundColor: colors.isDark ? 'rgba(239, 68, 68, 0.12)' : 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  compactCreditText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#2dba4e',
  },
  compactDebitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#ef4444',
  },
  ocrActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  actionBtn: {
    flex: 0.48,
    flexDirection: 'row',
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.isDark ? '#12121a' : '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    height: 36,
    backgroundColor: colors.isDark ? '#14141e' : '#f0f2f5',
    borderRadius: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    marginBottom: 6,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.isDark ? '#12121a' : '#f0f2f5',
    borderRadius: 8,
    padding: 2,
    marginBottom: 8,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 6,
  },
  activeTabButton: {
    backgroundColor: colors.isDark ? '#2b2b3b' : '#ffffff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 11,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#2dba4e',
    fontWeight: '800',
  },
  stickySectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    backgroundColor: colors.isDark ? '#14141e' : '#f4f6f8',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.border,
    marginTop: 10,
    marginBottom: 2,
    borderRadius: 8,
    ...(Platform.OS === 'web' ? { position: 'sticky' as any, top: 0, zIndex: 10 } : {}),
  },
  stickySectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: 0.2,
  },
  stickySectionRight: {
    alignItems: 'flex-end',
  },
  stickySectionLabel: {
    fontSize: 9,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginBottom: 1,
  },
  stickySectionAmount: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  txRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    alignItems: 'center',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  txMerchant: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.text,
  },
  txDate: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
  },
  txRight: {
    alignItems: 'flex-end',
  },
  txAmount: {
    fontSize: 13,
    fontWeight: '800',
  },
  txCategory: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 2,
    textTransform: 'capitalize',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    color: colors.textSecondary,
    fontSize: 12,
  },
  ocrLoaderOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  ocrLoaderText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
    marginTop: 14,
  },

  // Password styles
  pwdOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    ...(Platform.OS === 'web' ? { height: '100dvh' as any, width: '100vw' as any, position: 'fixed' as any, top: 0, left: 0, right: 0, bottom: 0 } : {}),
  },
  pwdCard: {
    backgroundColor: colors.isDark ? '#0f0f16' : '#ffffff',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 10,
  },
  pwdHeader: {
    alignItems: 'center',
    marginBottom: 20,
  },
  pwdTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: colors.text,
  },
  pwdSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
    marginTop: 6,
  },
  pwdInput: {
    width: '100%',
    height: 48,
    backgroundColor: colors.isDark ? '#141420' : '#f0f2f5',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    color: colors.text,
    fontSize: 14,
    paddingHorizontal: 16,
    marginBottom: 20,
    textAlign: 'center',
  },
  pwdButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  pwdBtn: {
    flex: 0.47,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pwdCancelBtn: {
    backgroundColor: colors.isDark ? '#1a1a24' : '#f0f2f5',
    borderWidth: 1,
    borderColor: colors.border,
  },
  pwdSubmitBtn: {
    backgroundColor: colors.accent,
  },
  pwdCancelText: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  pwdSubmitText: {
    color: '#24292e',
    fontSize: 13,
    fontWeight: '800',
  },
  consentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.isDark ? '#14141e' : '#f7f9fa',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 12,
  },
  consentTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: colors.text,
  },
  consentDesc: {
    fontSize: 10,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 14,
  },
  smsTagsBanner: {
    marginHorizontal: 16,
    marginBottom: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  smsTagsTitle: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  smsTagPill: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  smsTagPillText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
