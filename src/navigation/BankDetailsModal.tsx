import React, { useState, useEffect, useCallback } from 'react';
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
  Switch,
  Platform,
  PermissionsAndroid,
  Linking
} from 'react-native';
import { Feather, Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';
import { useTheme } from '../store';
import { useTransactionStore } from '../store';
import { authService } from '../services/authService';
import { parseStatementTextWithAI } from '../services/aiService';
import { syncService } from '../services/syncService';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL || 'http://localhost:3000';

interface BankDetailsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: {
    id: string;
    bankName: string;
    accountNumberSuffix: string;
    currentBalance: number;
    lastSyncTimestamp?: number;
    smsConsent?: boolean;
  } | null;
}

export const BankDetailsModal = ({ visible, onClose, bank }: BankDetailsModalProps) => {
  const { colors, isDark } = useTheme();
  const styles = getStyles(colors);

  const transactions = useTransactionStore((state) => state.transactions);
  
  const [activeTab, setActiveTab] = useState<'all' | 'debits' | 'credits'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [incomeRecords, setIncomeRecords] = useState<any[]>([]);
  const [loadingIncome, setLoadingIncome] = useState(false);
  const [processingOcr, setProcessingOcr] = useState(false);
  const [ocrStatusText, setOcrStatusText] = useState('');

  // Password protected PDF flow states
  const [passwordModalVisible, setPasswordModalVisible] = useState(false);
  const [pdfPassword, setPdfPassword] = useState('');
  const [pendingPdf, setPendingPdf] = useState<{ uri: string; name: string; type: string } | null>(null);

  // SMS Consent toggle states
  const [smsConsent, setSmsConsent] = useState(bank?.smsConsent || false);
  const [consentModalVisible, setConsentModalVisible] = useState(false);

  useEffect(() => {
    if (bank) {
      setSmsConsent(bank.smsConsent || false);
    }
  }, [bank]);

  const saveSmsConsent = async (val: boolean) => {
    if (!bank) return;
    setSmsConsent(val);
    try {
      const token = authService.getAccessToken();
      if (!token) return;

      const response = await fetch(`${BACKEND_URL}/sync/bank-profile/${bank.id}/consent`, {
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
    if (!bank) return;

    if (val) {
      setConsentModalVisible(true);
    } else {
      await saveSmsConsent(false);
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
          category: 'income',
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

  if (!bank) return null;

  // Filter transactions for this bank
  const bankDebits = transactions
    .filter((tx) => tx.bankProfileId === bank.id)
    .map((tx) => ({ ...tx, type: 'debit' }));

  const mergedList = [...bankDebits, ...incomeRecords].sort(
    (a, b) => b.timestamp - a.timestamp
  );

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
    const merchantRegex = /(?:to|at|from|by|at)\s+([A-Za-z0-9\s]{3,15})/i;

    for (const line of lines) {
      if (!line.trim()) continue;
      let amount = 0;
      let type: 'debit' | 'credit' | null = null;
      let date = new Date().toISOString().split('T')[0];
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
        const merchMatch = line.match(merchantRegex);
        if (merchMatch) {
          merchant = merchMatch[1].trim();
        } else {
          merchant = type === 'debit' ? 'Spends' : 'Credits';
        }
        parsed.push({ amount, type, date, merchant });
      }
    }
    return parsed;
  };

  const processExtractedText = async (text: string) => {
    try {
      setOcrStatusText('Running local regex parser...');
      let parsedTxs = parseTextLocally(text);

      if (parsedTxs.length === 0) {
        setOcrStatusText('Structuring with AI models...');
        parsedTxs = await parseStatementTextWithAI(text);
      }

      if (parsedTxs.length === 0) {
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
          bankProfileId: bank.id,
          transactions: parsedTxs,
        }),
      });

      if (!response.ok) {
        const errJson = await response.json();
        throw new Error(errJson.message || 'Sync failed.');
      }

      const syncResult = await response.json();
      await syncService.sync();
      await fetchIncomeRecords();

      Alert.alert(
        'OCR Import Successful',
        `Import summary:\n• Debits imported: ${syncResult.addedTransactionsCount}\n• Credits imported: ${syncResult.addedIncomeCount}\n\nNew Bank Balance: ₹${syncResult.updatedBalance.toLocaleString('en-IN')}`
      );
    } catch (err: any) {
      Alert.alert('Import Failed', err.message || 'Unable to complete OCR ingestion.');
    } finally {
      setProcessingOcr(false);
      setOcrStatusText('');
    }
  };

  // Upload and parse PDF statement file on backend
  const uploadPdfStatement = async (uri: string, name: string, type: string, password?: string) => {
    setProcessingOcr(true);
    setOcrStatusText(password ? 'Decrypting & parsing statement...' : 'Reading statement PDF...');

    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Session credentials missing.');

      const formData = new FormData();
      formData.append('bankProfileId', bank.id);
      if (password) {
        formData.append('password', password);
      }
      formData.append('file', {
        uri,
        name: name || 'statement.pdf',
        type: type || 'application/pdf',
      } as any);

      const response = await fetch(`${BACKEND_URL}/sync/upload-statement`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const responseJson = await response.json();

      if (!response.ok) {
        // Check for password protected PDF indicator
        if (responseJson.message && (
          responseJson.message.error === 'PASSWORD_REQUIRED' || 
          responseJson.error === 'PASSWORD_REQUIRED' ||
          JSON.stringify(responseJson).includes('PASSWORD_REQUIRED')
        )) {
          // Temporarily pause loader, save pending metadata, and open password modal
          setProcessingOcr(false);
          setPendingPdf({ uri, name, type });
          setPasswordModalVisible(true);
          return;
        }
        throw new Error(responseJson.message || 'Statement extraction failed.');
      }

      // If successfully decrypted and text extracted
      if (responseJson.text) {
        await processExtractedText(responseJson.text);
      } else {
        throw new Error('PDF parse completed but no text was returned.');
      }
    } catch (e: any) {
      setProcessingOcr(false);
      Alert.alert('Import Error', e.message || 'Unable to process PDF statement.');
    }
  };

  const handlePasswordSubmit = () => {
    if (!pdfPassword.trim()) {
      Alert.alert('Error', 'Please enter a valid password.');
      return;
    }
    if (!pendingPdf) return;

    setPasswordModalVisible(false);
    uploadPdfStatement(pendingPdf.uri, pendingPdf.name, pendingPdf.type, pdfPassword);
    setPdfPassword('');
  };

  // Image Upload / Ingestion
  const handleUploadScreenshot = async () => {
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Camera roll access is needed to upload screenshots.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (result.canceled || !result.assets?.[0]?.uri) return;

      setProcessingOcr(true);
      setOcrStatusText('Extracting text locally...');
      
      const recognized = await TextRecognition.recognize(result.assets[0].uri);
      await processExtractedText(recognized.text);
    } catch (e: any) {
      setProcessingOcr(false);
      Alert.alert('OCR Error', e.message || 'Failed to process screenshot.');
    }
  };

  // Document Statement Upload (Supports both images and password protected PDFs)
  const handleUploadStatement = async () => {
    try {
      const doc = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });

      if (doc.canceled || !doc.assets?.[0]?.uri) return;

      const fileUri = doc.assets[0].uri;
      const fileName = doc.assets[0].name || 'statement.pdf';
      const fileType = doc.assets[0].mimeType || '';

      if (fileType.includes('image')) {
        setProcessingOcr(true);
        setOcrStatusText('Extracting text locally...');
        const recognized = await TextRecognition.recognize(fileUri);
        await processExtractedText(recognized.text);
      } else {
        // Upload PDF to backend to handle decryption and text parsing
        await uploadPdfStatement(fileUri, fileName, fileType);
      }
    } catch (e: any) {
      setProcessingOcr(false);
      Alert.alert('Upload Error', e.message || 'Failed to select document.');
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.cardContainer}>
            {/* Header */}
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.title}>{bank.bankName}</Text>
                <Text style={styles.subtitle}>A/c Suffix: **** {bank.accountNumberSuffix}</Text>
              </View>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.7}>
                <Feather name="x" size={20} color="#8E8E9F" />
              </TouchableOpacity>
            </View>

            {/* Balance card */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Current Balance</Text>
              <Text style={styles.balanceValue}>₹{bank.currentBalance.toLocaleString('en-IN')}</Text>
              {bank.lastSyncTimestamp && (
                <Text style={styles.syncText}>
                  Last Synced: {new Date(bank.lastSyncTimestamp).toLocaleTimeString('en-IN')}
                </Text>
              )}
            </View>

            {/* SMS Consent Row */}
            <View style={styles.consentRow}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.consentTitle}>Background SMS Sync</Text>
                <Text style={styles.consentDesc}>
                  Securely scan incoming transaction alerts to update balance & records automatically in real-time.
                </Text>
              </View>
              <Switch
                value={smsConsent}
                onValueChange={handleToggleSmsConsent}
                trackColor={{ false: '#2c2c35', true: '#2dba4e' }}
                thumbColor={smsConsent ? '#ffffff' : '#8E8E9F'}
              />
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

            {/* Transactions List */}
            {loadingIncome ? (
              <ActivityIndicator size="small" color="#2dba4e" style={{ marginTop: 20 }} />
            ) : filteredData.length === 0 ? (
              <View style={styles.emptyContainer}>
                <Feather name="archive" size={32} color="#8E8E9F" style={{ marginBottom: 8 }} />
                <Text style={styles.emptyText}>No transactions found for this account.</Text>
              </View>
            ) : (
              <FlatList
                data={filteredData}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingBottom: 20 }}
                renderItem={({ item }) => {
                  const isDebit = item.type === 'debit';
                  return (
                    <View style={styles.txRow}>
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
                    </View>
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
      </Modal>

      {/* Password Prompt modal */}
      <Modal
        visible={passwordModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPasswordModalVisible(false)}
      >
        <View style={styles.pwdOverlay}>
          <View style={styles.pwdCard}>
            <View style={styles.pwdHeader}>
              <Feather name="lock" size={24} color="#FFD700" style={{ marginBottom: 10 }} />
              <Text style={styles.pwdTitle}>Statement is Locked</Text>
              <Text style={styles.pwdSubtitle}>
                Please enter the PDF password to open and extract transaction records.
              </Text>
            </View>

            <TextInput
              style={styles.pwdInput}
              placeholder="Enter PDF password"
              placeholderTextColor={colors.textTertiary}
              secureTextEntry
              value={pdfPassword}
              onChangeText={setPdfPassword}
              autoFocus
            />

            <View style={styles.pwdButtons}>
              <TouchableOpacity 
                style={[styles.pwdBtn, styles.pwdCancelBtn]} 
                onPress={() => {
                  setPasswordModalVisible(false);
                  setPendingPdf(null);
                  setPdfPassword('');
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
  balanceCard: {
    backgroundColor: colors.isDark ? '#14141e' : '#f7f9fa',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    padding: 16,
    marginTop: 16,
  },
  balanceLabel: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  balanceValue: {
    fontSize: 28,
    fontWeight: '900',
    color: colors.text,
    marginTop: 4,
  },
  syncText: {
    fontSize: 10,
    color: colors.textTertiary,
    marginTop: 6,
  },
  ocrActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 14,
  },
  actionBtn: {
    flex: 0.48,
    flexDirection: 'row',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.isDark ? '#12121a' : '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionBtnText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  searchContainer: {
    flexDirection: 'row',
    height: 44,
    backgroundColor: colors.isDark ? '#14141e' : '#f0f2f5',
    borderRadius: 12,
    paddingHorizontal: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    color: colors.text,
    fontSize: 13,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.isDark ? '#12121a' : '#f0f2f5',
    borderRadius: 10,
    padding: 4,
    marginBottom: 12,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
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
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  activeTabText: {
    color: '#2dba4e',
    fontWeight: '800',
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
});
