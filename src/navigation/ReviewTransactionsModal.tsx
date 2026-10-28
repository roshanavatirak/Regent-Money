// src/navigation/ReviewTransactionsModal.tsx
//
// Review transactions found in a statement or screenshot before importing.
// Compact rows you tick on or off (likely duplicates start unticked), tap a row
// to fix it, see the balance before and after, then import.

import React, { useState, useMemo, useEffect } from 'react';
import { Modal, View, Text, Pressable, TextInput, ScrollView, ActivityIndicator, StyleSheet, Platform, useWindowDimensions, Switch } from 'react-native';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import Animated, { FadeIn, FadeInDown, LinearTransition } from 'react-native-reanimated';
import { Feather } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Font from 'expo-font';
import { format } from 'date-fns';
import { useTheme, useTransactionStore } from '../store';
import { authService } from '../services/authService';
import { syncService } from '../services/syncService';
import { getBackendUrl } from '../config/api';
import { CategoryIcon } from '../components/CategoryIcon';
import { TagPaymentModal } from '../components/TagPaymentModal';
import { DateTimePickerSheet } from '../components/DateTimePickerSheet';
import { getCategory } from '../constants/categories';
import { niceName } from '../constants/bankBrand';

const BACKEND_URL = getBackendUrl();
const FOREST = '#0B3D2C';
const LIME = '#B8F36B';

const OUT_CATS = ['food', 'groceries', 'shopping', 'transport', 'bills', 'entertainment', 'medical', 'miscellaneous'];
const IN_CATS = ['salary', 'money_received', 'investment', 'cashback', 'interest', 'self_transfer'];

export interface EditableTransactionItem {
  id: string;
  date: string;
  time: string;
  amount: string;
  type: 'debit' | 'credit';
  merchant: string;
  category: string;
  balanceAfter: string;
  referenceId?: string;
  selected: boolean;
  duplicate: boolean;
}

export interface ReviewTransactionsModalProps {
  visible: boolean;
  onClose: () => void;
  bank: any | null;
  rawTransactions: Array<{
    id?: string;
    date: string;
    time?: string | null;
    timestamp?: number | null;
    amount: number;
    type: 'debit' | 'credit';
    merchant: string;
    category?: string;
    balanceAfter?: number | null;
    referenceId?: string | null;
  }>;
  detectedFinalBalance?: number | null;
  onConfirmSuccess: (summary: { addedTransactionsCount: number; addedIncomeCount: number; updatedBalance: number }) => void;
}

/* ------------------------------------------------------------------ */
/* Date parsing (same rules as before, shared by display and save)      */
/* ------------------------------------------------------------------ */

const MONTHS: Record<string, number> = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

const parseRowDate = (dateStr: string, timeStr: string, idx: number) => {
  const now = new Date();
  const year = now.getFullYear();
  let y = year;
  let m = now.getMonth() + 1;
  let d = now.getDate();
  const t = (dateStr || '').trim();

  const iso = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  const dmy = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);
  const txt = t.match(/^(\d{1,2})\s*[-/.\s]?\s*([a-zA-Z]+)(?:\s*[-/.\s]?\s*(\d{2,4}))?$/);
  if (iso) {
    y = +iso[1];
    m = +iso[2];
    d = +iso[3];
  } else if (dmy) {
    d = +dmy[1];
    m = +dmy[2];
    y = +dmy[3];
    if (y < 100) y += 2000;
  } else if (txt) {
    d = +txt[1];
    m = MONTHS[txt[2].toLowerCase().slice(0, 3)] || m;
    if (txt[3]) {
      y = +txt[3];
      if (y < 100) y += 2000;
    }
  } else if (t) {
    const dt = new Date(t);
    if (!isNaN(dt.getTime())) {
      y = dt.getFullYear();
      m = dt.getMonth() + 1;
      d = dt.getDate();
    }
  }
  // Guard against a misread year
  if (y < year - 1 || y > year + 1) y = year;

  let h = 12;
  let min = Math.floor(idx / 60) % 60;
  let sec = idx % 60;
  let hasTime = false;
  const tm = (timeStr || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (tm) {
    h = +tm[1];
    min = +tm[2];
    sec = tm[3] ? +tm[3] : idx % 60;
    const ap = tm[4]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    hasTime = true;
  } else if (!timeStr) {
    h = 12 + Math.floor(idx / 3600);
  }
  const date = new Date(y, m - 1, d, h, min, sec);
  return {
    normalizedDate: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
    timestamp: isNaN(date.getTime()) ? undefined : date.getTime(),
    date,
    hasTime,
  };
};

const money = (n: number) => `₹${Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export const ReviewTransactionsModal: React.FC<ReviewTransactionsModalProps> = ({ visible, onClose, bank, rawTransactions, detectedFinalBalance, onConfirmSuccess }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const display = Font.isLoaded('BricolageGrotesque_800ExtraBold') ? 'BricolageGrotesque_800ExtraBold' : undefined;
  const heading = { fontFamily: display, fontWeight: display ? undefined : ('800' as const) };

  const existing = useTransactionStore((s) => s.transactions);
  const [items, setItems] = useState<EditableTransactionItem[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [updateBalance, setUpdateBalance] = useState(true);
  const [useClosing, setUseClosing] = useState(false);
  const [closingStr, setClosingStr] = useState('');
  const [editingClosing, setEditingClosing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [invalidId, setInvalidId] = useState<string | null>(null);
  const [dateFor, setDateFor] = useState<string | null>(null);
  const [tagFor, setTagFor] = useState<string | null>(null);

  const isDuplicate = (amount: string, merchant: string, date: string) => {
    const amt = parseFloat(amount);
    const norm = (merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '');
    if (isNaN(amt) || amt <= 0 || !norm) return false;
    return existing.some((tx) => {
      if (Math.abs(Number(tx.amount) - amt) >= 0.01) return false;
      if ((tx.merchant || '').toLowerCase().replace(/[^a-z0-9]/g, '') !== norm) return false;
      const td = new Date(Number(tx.timestamp));
      if (isNaN(td.getTime())) return false;
      const key = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
      return date.includes(key) || key.includes(date.trim());
    });
  };

  useEffect(() => {
    if (!visible || !rawTransactions) return;
    const mapped = rawTransactions.map((tx, idx) => {
      let time = tx.time || '';
      if (!time && tx.timestamp) {
        const d = new Date(Number(tx.timestamp));
        if (!isNaN(d.getTime())) time = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      }
      const date = tx.date || format(new Date(), 'yyyy-MM-dd');
      const amount = String(tx.amount || '');
      const merchant = tx.merchant || '';
      const dup = isDuplicate(amount, merchant, date);
      return {
        id: tx.id || `item_${Date.now()}_${idx}`,
        date,
        time,
        amount,
        type: tx.type === 'credit' ? 'credit' : 'debit',
        merchant,
        category: tx.category || (tx.type === 'credit' ? 'money_received' : 'miscellaneous'),
        balanceAfter: tx.balanceAfter !== undefined && tx.balanceAfter !== null ? String(tx.balanceAfter) : '',
        referenceId: tx.referenceId ? String(tx.referenceId) : '',
        selected: !dup,
        duplicate: dup,
      } as EditableTransactionItem;
    });
    setItems(mapped);
    setExpandedId(null);
    setErrorText('');
    setInvalidId(null);
    setUpdateBalance(true);
    setEditingClosing(false);

    const detected =
      detectedFinalBalance ?? [...rawTransactions].reverse().find((t) => t.balanceAfter !== undefined && t.balanceAfter !== null)?.balanceAfter ?? null;
    if (detected !== null && detected !== undefined) {
      setClosingStr(String(detected));
      setUseClosing(true);
    } else {
      setClosingStr('');
      setUseClosing(false);
    }
  }, [visible, rawTransactions, detectedFinalBalance]);

  const update = (id: string, patch: Partial<EditableTransactionItem>) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
    if (invalidId === id) {
      setInvalidId(null);
      setErrorText('');
    }
  };

  /* ---------------- Totals ---------------- */

  const selected = items.filter((i) => i.selected);
  const totals = useMemo(() => {
    let out = 0;
    let inn = 0;
    selected.forEach((i) => {
      const v = parseFloat(i.amount);
      if (!isNaN(v) && v > 0) i.type === 'debit' ? (out += v) : (inn += v);
    });
    return { out, inn };
  }, [items]);
  const dupCount = items.filter((i) => i.duplicate).length;

  const current = Number(bank?.currentBalance) || 0;
  const projected = current + totals.inn - totals.out;
  const closing = useClosing && closingStr.trim() && !isNaN(parseFloat(closingStr)) ? parseFloat(closingStr) : undefined;
  const after = closing !== undefined ? closing : projected;

  /* ---------------- Actions ---------------- */

  const addRow = () => {
    const now = new Date();
    const row: EditableTransactionItem = {
      id: `manual_${Date.now()}`,
      date: format(now, 'yyyy-MM-dd'),
      time: format(now, 'HH:mm'),
      amount: '',
      type: 'debit',
      merchant: '',
      category: 'miscellaneous',
      balanceAfter: '',
      selected: true,
      duplicate: false,
    };
    setItems((prev) => [...prev, row]);
    setExpandedId(row.id);
  };

  const removeRow = (id: string) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
    if (expandedId === id) setExpandedId(null);
  };

  const toggleAll = () => {
    const allOn = items.every((i) => i.selected);
    setItems((prev) => prev.map((i) => ({ ...i, selected: !allOn })));
  };

  const save = async () => {
    if (!bank?.id) return setErrorText('Account details are missing. Close and try again.');
    if (selected.length === 0) return setErrorText('Tick at least one transaction to import.');
    for (const it of selected) {
      const amt = parseFloat(it.amount);
      if (isNaN(amt) || amt <= 0 || !it.merchant.trim()) {
        setExpandedId(it.id);
        setInvalidId(it.id);
        return setErrorText(isNaN(amt) || amt <= 0 ? 'One transaction needs an amount.' : 'One transaction needs a name.');
      }
    }

    setSaving(true);
    setErrorText('');
    try {
      const token = authService.getAccessToken();
      if (!token) throw new Error('Sign in again to import.');
      const payload = {
        bankProfileId: bank.id,
        applyBalanceChange: updateBalance,
        transactions: selected.map((it, idx) => {
          const p = parseRowDate(it.date, it.time, idx);
          return {
            amount: parseFloat(it.amount),
            type: it.type,
            date: p.normalizedDate,
            time: it.time.trim() || null,
            timestamp: p.timestamp,
            merchant: it.merchant.trim(),
            category: it.category,
            balanceAfter: it.balanceAfter.trim() ? parseFloat(it.balanceAfter) : null,
            referenceId: it.referenceId ? it.referenceId.trim() : undefined,
          };
        }),
        updatedBalance: updateBalance ? after : undefined,
      };
      const res = await fetch(`${BACKEND_URL}/sync/ocr-sync`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const raw = json.message || json.error;
        throw new Error(Array.isArray(raw) ? raw.join('\n') : typeof raw === 'string' ? raw : 'Couldn’t import these transactions.');
      }
      await syncService.sync();
      onConfirmSuccess({
        addedTransactionsCount: json.addedTransactionsCount || 0,
        addedIncomeCount: json.addedIncomeCount || 0,
        updatedBalance: json.updatedBalance ?? bank.currentBalance,
      });
      onClose();
    } catch (e: any) {
      setErrorText(e?.message || 'Couldn’t import these transactions. Try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  /* ---------------- Theme ---------------- */

  const ink = colors.text;
  const muted = colors.textSecondary;
  const pageBg = isDark ? colors.background : '#F3F6F4';
  const surface = colors.card;
  const line = isDark ? colors.border : '#E1E9E4';
  const field = isDark ? colors.border : '#DCE5E0';
  const accent = isDark ? LIME : FOREST;
  const accentFg = isDark ? FOREST : LIME;
  const accentInk = isDark ? FOREST : '#FFFFFF';
  const green = isDark ? LIME : '#0B6B3A';
  const red = isDark ? '#FFA8A8' : '#C92A2A';

  const dateRow = dateFor ? items.find((i) => i.id === dateFor) : null;
  const tagRow = tagFor ? items.find((i) => i.id === tagFor) : null;

  /* ---------------- Row ---------------- */

  const renderRow = (it: EditableTransactionItem, idx: number) => {
    const open = expandedId === it.id;
    const isOut = it.type === 'debit';
    const amt = parseFloat(it.amount) || 0;
    const p = parseRowDate(it.date, it.time, idx);
    const when = format(p.date, it.time ? 'd MMM, HH:mm' : 'd MMM');
    const quick = isOut ? OUT_CATS : IN_CATS;
    const catList = quick.includes(getCategory(it.category).id) ? quick : [it.category, ...quick];
    const bad = invalidId === it.id;

    return (
      <Animated.View key={it.id} layout={LinearTransition.duration(200)} style={[idx < items.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: line }, bad && { backgroundColor: isDark ? 'rgba(224,49,49,0.08)' : '#FFF5F5' }]}>
        <Pressable onPress={() => setExpandedId(open ? null : it.id)} style={[s.row, !it.selected && { opacity: 0.55 }]} accessibilityRole="button" accessibilityState={{ expanded: open }}>
          <Pressable
            onPress={() => update(it.id, { selected: !it.selected })}
            hitSlop={10}
            style={[s.check, it.selected ? { backgroundColor: accent, borderColor: accent } : { borderColor: field }]}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: it.selected }}
            accessibilityLabel={`Include ${it.merchant || 'transaction'}`}
          >
            {it.selected && <Feather name="check" size={13} color={accentFg} />}
          </Pressable>
          <CategoryIcon category={it.category} variant="soft" size={38} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={s.nameRow}>
              <Text style={[s.name, { color: it.merchant ? ink : muted }]} numberOfLines={1}>{niceName(it.merchant) || 'Add a name'}</Text>
              {it.duplicate && (
                <View style={[s.dupTag, { backgroundColor: isDark ? 'rgba(245,159,0,0.18)' : '#FFF1D6' }]}>
                  <Text style={[s.dupText, { color: isDark ? '#FFD27A' : '#8A5A00' }]}>Already added?</Text>
                </View>
              )}
            </View>
            <Text style={[s.meta, { color: muted }]}>{when}</Text>
          </View>
          <Text style={[s.amt, { color: isOut ? ink : green }]}>
            {amt > 0 ? `${isOut ? '−' : '+'}${money(amt)}` : '₹0'}
          </Text>
        </Pressable>

        {open && (
          <Animated.View entering={FadeIn.duration(200)} style={[s.editor, { backgroundColor: isDark ? 'rgba(255,255,255,0.02)' : '#FBFCFB' }]}>
            <View style={s.editRow}>
              <View style={[s.input, { flex: 1, backgroundColor: surface, borderColor: bad && !it.merchant.trim() ? red : field }]}>
                <TextInput value={it.merchant} onChangeText={(v) => update(it.id, { merchant: v })} placeholder="Name, like Swiggy" placeholderTextColor={muted} style={[s.inputText, { color: ink }]} />
              </View>
              <View style={[s.input, { width: 120, backgroundColor: surface, borderColor: bad && !(amt > 0) ? red : field }]}>
                <Text style={[s.inputPrefix, { color: muted }]}>₹</Text>
                <TextInput value={it.amount} onChangeText={(v) => update(it.id, { amount: v.replace(/[^0-9.]/g, '') })} keyboardType="decimal-pad" placeholder="0" placeholderTextColor={muted} style={[s.inputText, { color: ink, fontWeight: '700' }]} />
              </View>
            </View>

            <View style={s.editRow}>
              <Pressable onPress={() => setDateFor(it.id)} style={[s.input, { flex: 1, backgroundColor: surface, borderColor: field }]} accessibilityLabel="Change date and time">
                <Feather name="calendar" size={14} color={muted} />
                <Text style={[s.inputText, { color: ink }]}>{format(p.date, 'd MMM yyyy, HH:mm')}</Text>
              </Pressable>
              <View style={[s.seg, { backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : '#E9EFEB' }]}>
                {(['debit', 'credit'] as const).map((t) => {
                  const on = it.type === t;
                  return (
                    <Pressable
                      key={t}
                      onPress={() => update(it.id, { type: t, category: t === 'credit' ? 'money_received' : 'miscellaneous' })}
                      style={[s.segBtn, on && { backgroundColor: isDark ? '#1E3329' : '#FFFFFF' }]}
                    >
                      <Text style={[s.segText, { color: on ? ink : muted }, on && { fontWeight: '700' }]}>{t === 'debit' ? 'Out' : 'In'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cats} keyboardShouldPersistTaps="handled">
              {catList.map((c) => {
                const on = getCategory(it.category).id === getCategory(c).id;
                return (
                  <Pressable key={c} onPress={() => update(it.id, { category: c })} style={[s.cat, on ? { backgroundColor: accent, borderColor: accent } : { backgroundColor: surface, borderColor: field }]}>
                    <Text style={[s.catText, { color: on ? accentInk : ink }, on && { fontWeight: '700' }]}>{getCategory(c).label}</Text>
                  </Pressable>
                );
              })}
              <Pressable onPress={() => setTagFor(it.id)} style={[s.cat, { backgroundColor: surface, borderColor: field }]}>
                <Text style={[s.catText, { color: ink }]}>More</Text>
              </Pressable>
            </ScrollView>

            <View style={s.editFoot}>
              <Text style={[s.footNote, { color: muted }]} numberOfLines={1}>
                {it.balanceAfter ? `Balance after: ${money(parseFloat(it.balanceAfter) || 0)}` : ' '}
              </Text>
              <Pressable onPress={() => removeRow(it.id)} hitSlop={8} accessibilityLabel="Remove this transaction">
                <Text style={[s.remove, { color: red }]}>Remove</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </Animated.View>
    );
  };

  /* ---------------- Render ---------------- */

  return (
    <Modal visible animationType="slide" transparent statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={s.overlay}>
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <View style={[s.container, { backgroundColor: pageBg, height: windowHeight * 0.94 }]}>
            <View style={[s.grabber, { backgroundColor: isDark ? 'rgba(255,255,255,0.18)' : '#C9D4CE' }]} />

            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}>
              {/* Header */}
              <View style={s.head}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.title, { color: ink }, heading]}>
                    {items.length} transaction{items.length === 1 ? '' : 's'} found
                  </Text>
                  <Text style={[s.sub, { color: muted }]}>From your {bank?.bankName || 'bank'} statement. Check, then import.</Text>
                </View>
                <Pressable onPress={onClose} style={[s.close, { backgroundColor: surface }]} accessibilityLabel="Close without importing">
                  <Feather name="x" size={18} color={ink} />
                </Pressable>
              </View>

              {/* Totals */}
              <Animated.View entering={FadeInDown.duration(350)} style={s.tiles}>
                <View style={[s.tile, { backgroundColor: surface, borderColor: line }]}>
                  <Text style={[s.tileLabel, { color: muted }]}>Money out</Text>
                  <Text style={[s.tileValue, { color: ink }]}>{money(totals.out)}</Text>
                </View>
                <View style={[s.tile, { backgroundColor: surface, borderColor: line }]}>
                  <Text style={[s.tileLabel, { color: muted }]}>Money in</Text>
                  <Text style={[s.tileValue, { color: green }]}>{money(totals.inn)}</Text>
                </View>
              </Animated.View>

              {/* Balance */}
              <Animated.View entering={FadeInDown.delay(60).duration(350)} style={s.balance}>
                <View pointerEvents="none" style={s.balanceRing} />
                <View style={s.balanceHead}>
                  <Text style={s.balanceTitle}>Update account balance</Text>
                  <Switch
                    value={updateBalance}
                    onValueChange={setUpdateBalance}
                    trackColor={{ false: 'rgba(255,255,255,0.25)', true: LIME }}
                    thumbColor={updateBalance ? FOREST : '#FFFFFF'}
                    ios_backgroundColor="rgba(255,255,255,0.25)"
                  />
                </View>
                {updateBalance ? (
                  <>
                    <View style={s.flow}>
                      <View>
                        <Text style={s.flowLabel}>Now</Text>
                        <Text style={s.flowNow}>{money(current)}</Text>
                      </View>
                      <Feather name="arrow-right" size={16} color="#B5CEC1" />
                      <View style={{ flex: 1 }}>
                        <Text style={s.flowLabel}>After import</Text>
                        <Text style={[s.flowAfter, heading]} numberOfLines={1} adjustsFontSizeToFit>{after < 0 ? '−' : ''}{money(after)}</Text>
                      </View>
                    </View>
                    {editingClosing ? (
                      <View style={s.closingRow}>
                        <Text style={s.closingPrefix}>₹</Text>
                        <TextInput
                          value={closingStr}
                          onChangeText={(v) => {
                            setClosingStr(v.replace(/[^0-9.-]/g, ''));
                            setUseClosing(true);
                          }}
                          keyboardType="decimal-pad"
                          autoFocus
                          placeholder="Closing balance"
                          placeholderTextColor="#B5CEC1"
                          style={s.closingInput}
                        />
                        <Pressable onPress={() => setEditingClosing(false)} hitSlop={8}>
                          <Text style={s.closingDone}>Done</Text>
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable onPress={() => setEditingClosing(true)} style={s.closingNote} accessibilityRole="button">
                        <Feather name={closing !== undefined ? 'check' : 'info'} size={13} color="#B5CEC1" />
                        <Text style={s.closingNoteText}>
                          {closing !== undefined
                            ? detectedFinalBalance !== null && detectedFinalBalance !== undefined
                              ? 'Closing balance read from your statement. '
                              : 'Using the closing balance you entered. '
                            : 'Worked out from these transactions. '}
                          <Text style={s.closingLink}>{closing !== undefined ? 'Edit' : 'Enter exact closing balance'}</Text>
                        </Text>
                      </Pressable>
                    )}
                    {closing !== undefined && (
                      <Pressable onPress={() => setUseClosing(false)} hitSlop={6}>
                        <Text style={s.closingReset}>Use the transactions instead</Text>
                      </Pressable>
                    )}
                  </>
                ) : (
                  <Text style={s.balanceOff}>Only the transactions are added. Your balance stays {money(current)}.</Text>
                )}
              </Animated.View>

              {/* Duplicates */}
              {dupCount > 0 && (
                <View style={[s.dupNote, { backgroundColor: isDark ? 'rgba(245,159,0,0.14)' : '#FFF4E0' }]}>
                  <Text style={[s.dupNoteText, { color: ink }]}>
                    <Text style={{ fontWeight: '700' }}>
                      {dupCount} look{dupCount === 1 ? 's' : ''} like {dupCount === 1 ? 'one' : 'ones'} you already have,
                    </Text>{' '}
                    so {dupCount === 1 ? 'it’s' : 'they’re'} unticked. Tick to import anyway.
                  </Text>
                </View>
              )}

              {/* List */}
              <View style={s.listHead}>
                <Text style={[s.listCount, { color: muted }]}>
                  {selected.length} of {items.length} selected
                </Text>
                {items.length > 0 && (
                  <Pressable onPress={toggleAll} hitSlop={8}>
                    <Text style={[s.link, { color: green }]}>{items.every((i) => i.selected) ? 'Clear all' : 'Select all'}</Text>
                  </Pressable>
                )}
              </View>
              <View style={[s.list, { backgroundColor: surface, borderColor: line }]}>{items.map(renderRow)}</View>

              <Pressable onPress={addRow} style={[s.addRow, { borderColor: field }]} accessibilityRole="button">
                <Feather name="plus" size={16} color={ink} />
                <Text style={[s.addRowText, { color: ink }]}>Add a missing transaction</Text>
              </Pressable>
            </ScrollView>

            {/* Footer */}
            <View style={[s.footer, { borderTopColor: line, paddingBottom: Math.max(insets.bottom, 12) + 8 }]}>
              {errorText ? (
                <Animated.View entering={FadeIn.duration(200)} style={s.errorRow}>
                  <Feather name="alert-circle" size={14} color={red} />
                  <Text style={[s.errorText, { color: red }]}>{errorText}</Text>
                </Animated.View>
              ) : null}
              <Pressable
                onPress={save}
                disabled={saving || selected.length === 0}
                style={({ pressed }) => [s.cta, { backgroundColor: accent, opacity: selected.length ? 1 : 0.5 }, pressed && { transform: [{ scale: 0.98 }] }]}
                accessibilityRole="button"
              >
                {saving ? (
                  <ActivityIndicator color={accentFg} />
                ) : (
                  <Text style={[s.ctaText, { color: accentFg }]}>
                    {selected.length ? `Import ${selected.length} transaction${selected.length === 1 ? '' : 's'}` : 'Tick something to import'}
                  </Text>
                )}
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>

      {dateRow && (
        <DateTimePickerSheet
          visible
          mode="datetime"
          title="When was this?"
          value={parseRowDate(dateRow.date, dateRow.time, 0).date}
          maximumDate={new Date()}
          onClose={() => setDateFor(null)}
          onConfirm={(d) => {
            update(dateRow.id, { date: format(d, 'yyyy-MM-dd'), time: format(d, 'HH:mm') });
            setDateFor(null);
          }}
        />
      )}

      {tagRow && (
        <TagPaymentModal
          visible
          onClose={() => setTagFor(null)}
          selectedTag={tagRow.category}
          onSelectTag={(tag: string) => {
            update(tagRow.id, { category: tag });
            setTagFor(null);
          }}
          merchantName={tagRow.merchant || undefined}
          isDark={isDark}
          colors={colors}
        />
      )}
    </Modal>
  );
};

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(7, 17, 13, 0.55)', justifyContent: 'flex-end' },
  container: { borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 10, overflow: 'hidden', width: '100%', maxWidth: 640, alignSelf: 'center' },
  grabber: { width: 40, height: 5, borderRadius: 3, alignSelf: 'center', marginBottom: 14 },

  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 4 },
  title: { fontSize: 24, letterSpacing: -0.5 },
  sub: { fontSize: 14, marginTop: 2 },
  close: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },

  tiles: { flexDirection: 'row', gap: 10, marginTop: 16 },
  tile: { flex: 1, borderWidth: 1, borderRadius: 18, paddingHorizontal: 14, paddingVertical: 12 },
  tileLabel: { fontSize: 12 },
  tileValue: { fontSize: 17, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },

  balance: { marginTop: 12, borderRadius: 24, backgroundColor: FOREST, padding: 16, overflow: 'hidden' },
  balanceRing: { position: 'absolute', width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(184,243,107,0.16)', right: -60, top: -80 },
  balanceHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceTitle: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  flow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
  flowLabel: { color: '#B5CEC1', fontSize: 12 },
  flowNow: { color: '#FFFFFF', fontSize: 16, fontWeight: '700', marginTop: 2 },
  flowAfter: { color: LIME, fontSize: 24, letterSpacing: -0.4, marginTop: 2 },
  closingNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  closingNoteText: { flex: 1, color: '#B5CEC1', fontSize: 12, lineHeight: 17 },
  closingLink: { color: '#FFFFFF', fontWeight: '600', textDecorationLine: 'underline' },
  closingReset: { color: '#B5CEC1', fontSize: 12, marginTop: 6, textDecorationLine: 'underline' },
  closingRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.1)', paddingHorizontal: 12 },
  closingPrefix: { color: '#B5CEC1', fontSize: 16, fontWeight: '700' },
  closingInput: { flex: 1, color: '#FFFFFF', fontSize: 16, fontWeight: '700', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  closingDone: { color: LIME, fontSize: 14, fontWeight: '700' },
  balanceOff: { color: '#D9E7DF', fontSize: 13, lineHeight: 18, marginTop: 8 },

  dupNote: { borderRadius: 18, padding: 14, marginTop: 12 },
  dupNoteText: { fontSize: 13, lineHeight: 18 },

  listHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 4, paddingTop: 18, paddingBottom: 8 },
  listCount: { fontSize: 13, fontWeight: '700' },
  link: { fontSize: 13, fontWeight: '600' },
  list: { borderWidth: 1, borderRadius: 22, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12 },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '600', flexShrink: 1 },
  dupTag: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2 },
  dupText: { fontSize: 11, fontWeight: '700' },
  meta: { fontSize: 12, marginTop: 2 },
  amt: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },

  editor: { paddingHorizontal: 14, paddingBottom: 14 },
  editRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  input: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
  inputPrefix: { fontSize: 14, fontWeight: '700' },
  inputText: { flex: 1, fontSize: 14, fontWeight: '600', paddingVertical: 0, ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as any) : {}) },
  seg: { flexDirection: 'row', borderRadius: 14, padding: 3 },
  segBtn: { height: 38, paddingHorizontal: 14, borderRadius: 11, justifyContent: 'center' },
  segText: { fontSize: 13, fontWeight: '600' },
  cats: { gap: 6, paddingTop: 10 },
  cat: { height: 32, paddingHorizontal: 12, borderRadius: 16, borderWidth: 1, justifyContent: 'center' },
  catText: { fontSize: 12, fontWeight: '600' },
  editFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12 },
  footNote: { flex: 1, fontSize: 12 },
  remove: { fontSize: 13, fontWeight: '600' },

  addRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 52, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', marginTop: 12 },
  addRowText: { fontSize: 14, fontWeight: '600' },

  footer: { paddingHorizontal: 16, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  errorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  errorText: { flex: 1, fontSize: 13, fontWeight: '600' },
  cta: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  ctaText: { fontSize: 16, fontWeight: '700' },
});