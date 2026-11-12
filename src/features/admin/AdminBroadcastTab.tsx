import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, {
  FadeInDown,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import {
  adminService,
  AudienceEstimate,
  AdminBroadcast,
  AdminEmailBroadcast,
  EmailAudienceEstimate,
  PrimaryEmailStats,
  AdminUserItem,
} from '../../services/adminService';
import { useNavigation } from '@react-navigation/native';
import { useAdminTheme, ff, FOREST, LIME, CORAL } from './adminTheme';
import { EMAIL_TEMPLATES, EmailTemplate, EmailCategory, findPlaceholders, isRequiredCategory, markdownToPlain, firstButtonText, DEFAULT_EMAIL_LABEL } from './emailTemplates';
import { EmailTemplatePicker, EmailThumb } from './EmailTemplatePicker';
import { EmailPreviewModal } from './EmailPreviewModal';

const APP_ICON = require('../../../assets/appicon.png');
const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.regentmoney';
const STORE_ID = '__store';

type FeatherName = React.ComponentProps<typeof Feather>['name'];

const TYPES: { id: string; label: string; icon: FeatherName }[] = [
  { id: 'announcement', label: 'News', icon: 'volume-2' },
  { id: 'update', label: 'Update', icon: 'zap' },
  { id: 'daily_humor', label: 'Tip', icon: 'smile' },
  { id: 'alert', label: 'Alert', icon: 'alert-triangle' },
];

type PickOption = { id: string; name: string; sub: string; icon: FeatherName };

const EMAIL_CATEGORIES: PickOption[] = [
  { id: 'announcement', name: 'Announcement', sub: 'News and new features', icon: 'volume-2' },
  { id: 'policy_update', name: 'Policy update', sub: 'Terms or privacy changes. Sent to everyone', icon: 'file-text' },
  { id: 'security_tip', name: 'Security tip', sub: 'Account safety advice', icon: 'shield' },
  { id: 'service_notice', name: 'Service notice', sub: 'Outages and maintenance. Sent to everyone', icon: 'tool' },
];

const EMAIL_AUDIENCES: PickOption[] = [
  { id: 'all_verified', name: 'All verified users', sub: 'Everyone with a confirmed email', icon: 'users' },
  { id: 'specific_user', name: 'One user', sub: 'Send to a single account', icon: 'user' },
  { id: 'custom_list', name: 'Email list', sub: 'Paste addresses', icon: 'list' },
];

/** Rough plain-text version of the Markdown body for the in-app preview. */
const markdownToPreview = (md: string) =>
  md
    .replace(/\{\{\s*name\s*\}\}/gi, 'there')
    .replace(/^#{1,6}\s*/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[(.+?)\]\((.+?)\)/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

type TapTarget = { id: string; name: string; sub: string; icon: FeatherName; deepLink?: string };

const SCREENS: TapTarget[] = [
  { id: 'home', name: 'Home', sub: 'Default dashboard', icon: 'home', deepLink: 'regent://home' },
  { id: 'transactions', name: 'Transactions', sub: 'Full transaction list', icon: 'list', deepLink: 'regent://transactions' },
  { id: 'borrow', name: 'Borrow & Lend', sub: 'Peer loans', icon: 'repeat', deepLink: 'regent://borrow' },
  { id: 'budgets', name: 'Budgets', sub: 'Monthly budgets', icon: 'pie-chart', deepLink: 'regent://budgets' },
  { id: 'goals', name: 'Goals', sub: 'Savings goals', icon: 'trending-up', deepLink: 'regent://goals' },
];
const STORE: TapTarget = { id: STORE_ID, name: 'Update the app', sub: 'Opens Regent Money on Play Store', icon: 'play' };
const ALL_TARGETS = [...SCREENS, STORE];

const PUSH_TEMPLATES = [
  {
    label: 'App update',
    icon: 'zap' as FeatherName,
    title: '🚀 Big update is live',
    body: 'New money insights are here. Update now to see your upgraded portfolio.',
    type: 'update',
  },
  {
    label: 'Weekly tip',
    icon: 'smile' as FeatherName,
    title: '⚡ Weekend wealth tip',
    body: 'Did you review your discretionary spends this week? Keep your savings streak alive.',
    type: 'daily_humor',
  },
  {
    label: 'Security',
    icon: 'shield' as FeatherName,
    title: '🛡️ Turn on app lock',
    body: 'Protect your money data. Enable biometric lock in Security settings.',
    type: 'alert',
  },
];

const TYPE_LABEL: Record<string, string> = {
  announcement: 'News',
  update: 'Update',
  daily_humor: 'Tip',
  alert: 'Alert',
  policy_update: 'Policy',
  security_tip: 'Security',
  service_notice: 'Service',
};

const SPRING = { damping: 16, stiffness: 220, mass: 0.7 };

export const AdminBroadcastTab: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { p, font, isDark } = useAdminTheme();
  const accent = isDark ? LIME : FOREST;

  // Channel toggle: 'push' | 'email'
  const [channel, setChannel] = useState<'push' | 'email'>('push');

  // Push state
  const [audience, setAudience] = useState<AudienceEstimate>({ totalUsers: 0, pushEnabledUsers: 0 });
  const [broadcasts, setBroadcasts] = useState<AdminBroadcast[]>([]);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [category, setCategory] = useState('announcement');
  const [target, setTarget] = useState('home');
  const [storeUrl, setStoreUrl] = useState(PLAY_STORE_URL);
  const [menuOpen, setMenuOpen] = useState(false);

  // Email state
  const navigation = useNavigation<any>();
  const openEmailPage = () => navigation.navigate('AdminEmailConfig');
  const [primaryEmailStats, setPrimaryEmailStats] = useState<PrimaryEmailStats>({
    sentToday: 0,
    remainingToday: 300,
    dailyLimit: 300,
    verificationsToday: 0,
    passwordResetsToday: 0,
    senderEmail: '',
    senderName: 'Regent Money',
    isConfigured: true,
  });
  const [emailAudience, setEmailAudience] = useState<EmailAudienceEstimate>({
    totalVerifiedUsers: 0,
    sentToday: 0,
    remainingToday: 300,
    dailyLimit: 300,
  });
  const [emailBroadcasts, setEmailBroadcasts] = useState<AdminEmailBroadcast[]>([]);
  const [emailSubject, setEmailSubject] = useState('');
  const [emailMarkdown, setEmailMarkdown] = useState('');
  const [emailCategory, setEmailCategory] = useState<EmailCategory>('announcement');
  const [emailLabel, setEmailLabel] = useState<string | undefined>(undefined);
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [emailTargetType, setEmailTargetType] = useState<'all_verified' | 'specific_user' | 'custom_list'>('all_verified');
  const [emailTargetUserId, setEmailTargetUserId] = useState('');
  const [selectedUser, setSelectedUser] = useState<AdminUserItem | null>(null);
  const [userSearchText, setUserSearchText] = useState('');
  const [userSearchResults, setUserSearchResults] = useState<AdminUserItem[]>([]);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const userSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [customEmailsText, setCustomEmailsText] = useState('');
  const [emailMenu, setEmailMenu] = useState<'audience' | 'category' | null>(null);
  const toggleEmailMenu = (m: 'audience' | 'category') => setEmailMenu((cur) => (cur === m ? null : m));

  const customEmails = useMemo(() => {
    return customEmailsText
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  }, [customEmailsText]);

  const emailRecipientCount = useMemo(() => {
    if (emailTargetType === 'all_verified') {
      return emailAudience.totalVerifiedUsers;
    }
    if (emailTargetType === 'specific_user') {
      return emailTargetUserId.trim() ? 1 : 0;
    }
    return customEmails.length;
  }, [emailTargetType, emailAudience.totalVerifiedUsers, emailTargetUserId, customEmails.length]);

  const sendableToday = emailAudience.remainingToday + (emailAudience.fallbackAvailable ?? 0);
  const overQuota = emailRecipientCount > sendableToday;
  const currentAudience = EMAIL_AUDIENCES.find((a) => a.id === emailTargetType) || EMAIL_AUDIENCES[0];
  const currentCategory = EMAIL_CATEGORIES.find((c) => c.id === emailCategory) || EMAIL_CATEGORIES[0];
  const previewText = markdownToPreview(emailMarkdown);

  useEffect(() => {
    return () => {
      if (userSearchTimer.current) clearTimeout(userSearchTimer.current);
    };
  }, []);

  const handleUserSearchChange = (text: string) => {
    setUserSearchText(text);
    if (userSearchTimer.current) clearTimeout(userSearchTimer.current);

    const query = text.trim();
    if (!query) {
      setUserSearchResults([]);
      setUserSearchLoading(false);
      return;
    }

    setUserSearchLoading(true);
    userSearchTimer.current = setTimeout(async () => {
      try {
        const res = await adminService.getUsers(1, 8, query);
        setUserSearchResults(res.users || []);
      } catch {
        setUserSearchResults([]);
      } finally {
        setUserSearchLoading(false);
      }
    }, 280);
  };

  const handleSelectUser = (u: AdminUserItem) => {
    setSelectedUser(u);
    setEmailTargetUserId(u.id);
    setUserSearchText('');
    setUserSearchResults([]);
  };

  const handleClearSelectedUser = () => {
    setSelectedUser(null);
    setEmailTargetUserId('');
    setUserSearchText('');
    setUserSearchResults([]);
  };

  const handleUseDirectIdOrEmail = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setEmailTargetUserId(trimmed);
    setSelectedUser({
      id: trimmed,
      name: trimmed.includes('@') ? trimmed.split('@')[0] : 'Specific User',
      email: trimmed.includes('@') ? trimmed : null,
      phone: null,
      role: 'user',
      isBanned: false,
      bannedAt: null,
      banReason: null,
      isVerified: true,
      authProvider: null,
      createdAt: Date.now(),
    });
    setUserSearchText('');
    setUserSearchResults([]);
  };

  // General state
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [sheetVisible, setSheetVisible] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [audData, listData, emailAud, emailList, emailOverview] = await Promise.all([
        adminService.getAudienceEstimate().catch(() => ({ totalUsers: 0, pushEnabledUsers: 0 })),
        adminService
          .listBroadcasts(1, 10)
          .catch(() => ({ broadcasts: [], total: 0, page: 1, limit: 10, totalPages: 1 })),
        adminService
          .getEmailAudienceEstimate()
          .catch(() => ({ totalVerifiedUsers: 0, sentToday: 0, remainingToday: 300, dailyLimit: 300 })),
        adminService
          .listEmailBroadcasts(1, 10)
          .catch(() => ({ broadcasts: [], total: 0, page: 1, limit: 10, totalPages: 1 })),
        adminService
          .getEmailSystemOverview()
          .catch(() => null),
      ]);
      setAudience(audData);
      setBroadcasts(listData.broadcasts || []);
      setEmailAudience(emailAud);
      setEmailBroadcasts(emailList.broadcasts || []);
      if (emailOverview?.primary) {
        setPrimaryEmailStats(emailOverview.primary);
      }
      if (emailOverview?.broadcast) {
        setEmailAudience((prev) => ({
          ...prev,
          sentToday: emailOverview.broadcast.sentToday,
          remainingToday: emailOverview.broadcast.remainingToday,
          dailyLimit: emailOverview.broadcast.dailyLimit,
          fallbackAvailable: emailOverview.broadcast.fallbackAvailable ?? 0,
        }));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, [loadData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
  };

  const showToast = (t: { type: 'success' | 'error'; message: string }) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), t.type === 'success' ? 3000 : 5000);
  };

  /* ---------- Push animations ---------- */
  const previewScale = useSharedValue(1);
  const previewStyle = useAnimatedStyle(() => ({ transform: [{ scale: previewScale.value }] }));
  const bumpPreview = () => {
    previewScale.value = withSequence(withTiming(0.97, { duration: 110 }), withSpring(1, SPRING));
  };

  const chevron = useSharedValue(0);
  const chevronStyle = useAnimatedStyle(() => ({ transform: [{ rotate: `${chevron.value * 180}deg` }] }));
  useEffect(() => {
    chevron.value = withTiming(menuOpen ? 1 : 0, { duration: 160 });
  }, [menuOpen, chevron]);

  const [segWidth, setSegWidth] = useState(0);
  const thumbX = useSharedValue(0);
  const typeIndex = Math.max(0, TYPES.findIndex((t) => t.id === category));
  const segItemW = segWidth > 0 ? (segWidth - 6) / TYPES.length : 0;
  useEffect(() => {
    thumbX.value = withSpring(typeIndex * segItemW, SPRING);
  }, [typeIndex, segItemW, thumbX]);
  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbX.value }] }));

  const reachPct = useSharedValue(0);
  const pushPercentage =
    audience.totalUsers > 0 ? Math.round((audience.pushEnabledUsers / audience.totalUsers) * 100) : 0;
  useEffect(() => {
    reachPct.value = withTiming(pushPercentage, { duration: 900 });
  }, [pushPercentage, reachPct]);
  const reachBarStyle = useAnimatedStyle(() => ({ width: `${reachPct.value}%` }));

  const openSheet = () => {
    setMenuOpen(false);
    setEmailMenu(null);
    setSheetVisible(true);
  };

  const closeSheet = (after?: () => void) => {
    setSheetVisible(false);
    after?.();
  };

  const applyPushTemplate = (t: (typeof PUSH_TEMPLATES)[number]) => {
    setTitle(t.title);
    setBody(t.body);
    setCategory(t.type);
    setTarget(t.type === 'update' ? STORE_ID : 'home');
    bumpPreview();
  };

  const applyEmailTemplate = (t: EmailTemplate | null) => {
    setShowTemplates(false);
    setTemplateId(t ? t.id : null);
    setEmailSubject(t ? t.subject : '');
    setEmailMarkdown(t ? t.bodyMarkdown : '');
    setEmailCategory(t ? t.category : 'announcement');
    setEmailLabel(t ? t.label : undefined);
  };
  const currentTemplate = EMAIL_TEMPLATES.find((t) => t.id === templateId) || null;

  const emailDraft = useMemo(
    () => ({
      subject: emailSubject.trim(),
      bodyMarkdown: emailMarkdown.trim(),
      category: emailCategory,
      ...(emailLabel !== undefined ? { label: emailLabel } : {}),
    }),
    [emailSubject, emailMarkdown, emailCategory, emailLabel],
  );
  const placeholders = useMemo(() => findPlaceholders(emailSubject, emailMarkdown), [emailSubject, emailMarkdown]);

  const handleSendEmailTest = async () => {
    if (!emailDraft.subject || !emailDraft.bodyMarkdown) {
      showToast({ type: 'error', message: 'Add a subject and message first.' });
      return;
    }
    setSendingTest(true);
    try {
      const res = await adminService.sendEmailDraftTest(emailDraft);
      showToast({ type: res.success ? 'success' : 'error', message: res.message });
      if (res.success) loadData();
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || "Test email didn't send." });
    } finally {
      setSendingTest(false);
    }
  };

  const selectTarget = (id: string) => {
    setTarget(id);
    setMenuOpen(false);
  };

  const selected = ALL_TARGETS.find((t) => t.id === target) || SCREENS[0];
  const isStore = target === STORE_ID;
  const storeUrlValid = /^https:\/\/play\.google\.com\/store\/apps\/details\?id=[\w.]+/.test(storeUrl.trim());

  const canSendPush = !!title.trim() && !!body.trim() && (!isStore || storeUrlValid) && !sending;
  const canSendEmail =
    !!emailSubject.trim() && !!emailMarkdown.trim() && emailRecipientCount > 0 && placeholders.length === 0 && !sending;

  const handleExecutePushBroadcast = async () => {
    setSending(true);
    try {
      const payload: Record<string, string> = isStore
        ? { action: 'open_url', url: storeUrl.trim() }
        : { deepLink: selected.deepLink || 'regent://home' };

      await adminService.sendBroadcast({
        title: title.trim(),
        body: body.trim(),
        type: category,
        payload,
        idempotencyKey: `admin_bcast_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      });

      showToast({ type: 'success', message: `Sent to ${audience.pushEnabledUsers.toLocaleString()} devices` });
      setTitle('');
      setBody('');
      setTimeout(() => loadData(), 1500);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || "Couldn't send. Check your connection and try again." });
    } finally {
      setSending(false);
    }
  };

  const handleExecuteEmailBroadcast = async () => {
    setSending(true);
    try {
      await adminService.sendEmailBroadcast({
        subject: emailSubject.trim(),
        bodyMarkdown: emailMarkdown.trim(),
        category: emailCategory,
        ...(emailLabel !== undefined ? { label: emailLabel } : {}),
        targetType: emailTargetType,
        targetUserId: emailTargetType === 'specific_user' ? emailTargetUserId.trim() : undefined,
        customEmails: emailTargetType === 'custom_list' ? customEmails : undefined,
        idempotencyKey: `admin_email_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      });

      showToast({
        type: 'success',
        message: `Sending to ${emailRecipientCount.toLocaleString()} ${emailRecipientCount === 1 ? 'person' : 'people'}`,
      });
      setEmailSubject('');
      setEmailMarkdown('');
      setTemplateId(null);
      setEmailLabel(undefined);
      setSelectedUser(null);
      setEmailTargetUserId('');
      setUserSearchText('');
      setUserSearchResults([]);
      setTimeout(() => loadData(), 1500);
    } catch (err: any) {
      showToast({ type: 'error', message: err?.message || "Couldn't send email broadcast." });
    } finally {
      setSending(false);
    }
  };

  const tabBarSpace = Math.max(insets.bottom + 8, 16) + 68;
  const isPush = channel === 'push';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={[styles.container, { backgroundColor: p.bg }]}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8 }]}>
        <Image source={APP_ICON} style={styles.headerLogo} accessibilityIgnoresInvertColors />
        <Text style={[styles.headerTitle, ff(font.displayBold, '700'), { color: p.text }]}>Broadcast</Text>
        <TouchableOpacity
          onPress={handleRefresh}
          disabled={refreshing}
          accessibilityRole="button"
          accessibilityLabel="Refresh"
          activeOpacity={0.7}
          style={[styles.iconBtn, { borderColor: p.line, backgroundColor: p.card }]}
        >
          {refreshing ? (
            <ActivityIndicator size="small" color={accent} />
          ) : (
            <Feather name="refresh-cw" size={17} color={p.text} />
          )}
        </TouchableOpacity>
      </View>

      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingBottom: tabBarSpace + 84 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={p.text} colors={[FOREST]} />
        }
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Channel Segmented Switch (Push vs Email) */}
        <View style={[styles.channelToggle, { backgroundColor: p.segBg }]}>
          {(['push', 'email'] as const).map((c) => {
            const on = channel === c;
            return (
              <TouchableOpacity
                key={c}
                onPress={() => {
                  setChannel(c);
                  setMenuOpen(false);
                  setEmailMenu(null);
                }}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[styles.channelBtn, on && [styles.channelOn, { backgroundColor: p.card }]]}
              >
                <Feather name={c === 'push' ? 'bell' : 'mail'} size={14} color={on ? p.text : p.sub} style={{ marginRight: 6 }} />
                <Text style={[styles.channelText, ff(on ? font.bodyBold : font.bodySemi, on ? '700' : '600'), { color: on ? p.text : p.sub }]}>
                  {c === 'push' ? 'Push' : 'Email'}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* ============================================================== */}
        {/* 1. PUSH NOTIFICATION TAB */}
        {/* ============================================================== */}
        {isPush ? (
          <>
            {/* Push Audience Reach */}
            <View style={styles.reach}>
              <View style={styles.reachRow}>
                <View>
                  <Text style={[styles.reachBig, ff(font.displayBold, '700')]}>
                    {loading ? '—' : audience.pushEnabledUsers.toLocaleString()}
                  </Text>
                  <Text style={[styles.reachLabel, ff(font.body, '500')]}>devices will receive it</Text>
                </View>
                <Text style={[styles.reachOf, ff(font.body, '500')]}>
                  {pushPercentage}% of{'\n'}
                  {audience.totalUsers.toLocaleString()} users
                </Text>
              </View>
              <View style={styles.reachTrack}>
                <Animated.View style={[styles.reachFill, reachBarStyle]} />
              </View>
            </View>

            {/* Quick Templates */}
            <View style={styles.templates}>
              {PUSH_TEMPLATES.map((t) => (
                <TouchableOpacity
                  key={t.label}
                  onPress={() => applyPushTemplate(t)}
                  activeOpacity={0.7}
                  style={[styles.chip, { borderColor: p.line, backgroundColor: p.card }]}
                >
                  <Feather name={t.icon} size={13} color={p.sub} />
                  <Text style={[styles.chipText, ff(font.bodySemi, '600'), { color: p.text }]}>{t.label}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Live Lockscreen Preview */}
            <Animated.View style={[styles.previewFrame, previewStyle]}>
              <View style={styles.bubble}>
                <View style={styles.bubbleTop}>
                  <Image source={APP_ICON} style={styles.bubbleIcon} accessibilityIgnoresInvertColors />
                  <Text style={styles.bubbleApp}>REGENT MONEY</Text>
                  <View style={styles.bubbleDot} />
                  <Text style={styles.bubbleNow}>now</Text>
                </View>
                <Text style={styles.bubbleTitle} numberOfLines={1}>
                  {title.trim() || 'Headline will appear here'}
                </Text>
                <Text style={styles.bubbleBody} numberOfLines={2}>
                  {body.trim() || 'Notification body text will be shown on lock screens and in the notification tray.'}
                </Text>
              </View>
            </Animated.View>

            {/* Composer */}
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
              {/* Type segmented bar */}
              <View
                style={[styles.seg, { backgroundColor: p.segBg }]}
                onLayout={(e) => setSegWidth(e.nativeEvent.layout.width)}
              >
                {segItemW > 0 && (
                  <Animated.View
                    style={[
                      styles.thumb,
                      { width: segItemW, backgroundColor: p.segActive },
                      thumbStyle,
                    ]}
                  />
                )}
                {TYPES.map((t) => {
                  const sel = t.id === category;
                  return (
                    <TouchableOpacity
                      key={t.id}
                      onPress={() => {
                        setCategory(t.id);
                        if (t.id === 'update' && target === 'home') setTarget(STORE_ID);
                        if (t.id !== 'update' && target === STORE_ID) setTarget('home');
                      }}
                      activeOpacity={0.8}
                      style={styles.segBtn}
                    >
                      <Feather
                        name={t.icon}
                        size={13}
                        color={sel ? p.segActiveText : p.sub}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.segText,
                          ff(font.bodySemi, '600'),
                          { color: sel ? p.segActiveText : p.sub },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Title input */}
              <View style={styles.field}>
                <View style={styles.fieldTop}>
                  <Text style={[styles.fieldLabel, ff(font.bodySemi, '600'), { color: p.sub }]}>Title</Text>
                  <Text style={[styles.count, ff(font.body, '500'), { color: p.muted }]}>{title.length}/65</Text>
                </View>
                <TextInput
                  value={title}
                  onChangeText={(v) => {
                    setTitle(v);
                    bumpPreview();
                  }}
                  maxLength={65}
                  placeholder="e.g. ⚡ Weekend wealth tip"
                  placeholderTextColor={p.muted}
                  style={[styles.input, ff(font.bodySemi, '600'), { color: p.text, borderColor: p.line, backgroundColor: p.soft }]}
                />
              </View>

              {/* Body input */}
              <View style={styles.field}>
                <View style={styles.fieldTop}>
                  <Text style={[styles.fieldLabel, ff(font.bodySemi, '600'), { color: p.sub }]}>Message</Text>
                  <Text style={[styles.count, ff(font.body, '500'), { color: p.muted }]}>{body.length}/180</Text>
                </View>
                <TextInput
                  value={body}
                  onChangeText={(v) => {
                    setBody(v);
                    bumpPreview();
                  }}
                  maxLength={180}
                  multiline
                  placeholder="Keep it concise and punchy..."
                  placeholderTextColor={p.muted}
                  style={[styles.area, ff(font.body, '500'), { color: p.text, borderColor: p.line, backgroundColor: p.soft }]}
                />
              </View>

              {/* Tap action */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, ff(font.bodySemi, '600'), { color: p.sub }]}>When tapped</Text>
                <TouchableOpacity
                  onPress={() => setMenuOpen((o) => !o)}
                  activeOpacity={0.7}
                  style={[styles.pickBtn, { borderColor: p.line, backgroundColor: p.soft }]}
                >
                  <Feather name={selected.icon} size={15} color={p.text} style={{ marginRight: 8 }} />
                  <Text style={[styles.pickText, ff(font.bodySemi, '600'), { color: p.text }]}>{selected.name}</Text>
                  <Animated.View style={chevronStyle}>
                    <Feather name="chevron-down" size={16} color={p.sub} />
                  </Animated.View>
                </TouchableOpacity>

                {menuOpen && (
                  <View style={[styles.menu, { backgroundColor: p.card, borderColor: p.line }]}>
                    {ALL_TARGETS.map((t) => {
                      const sel = t.id === target;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => selectTarget(t.id)}
                          activeOpacity={0.7}
                          style={[styles.menuItem, sel && { backgroundColor: p.soft }]}
                        >
                          <Feather name={t.icon} size={15} color={sel ? accent : p.sub} style={{ marginRight: 10 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.menuName, ff(font.bodySemi, '600'), { color: p.text }]}>{t.name}</Text>
                            <Text style={[styles.menuSub, ff(font.body, '400'), { color: p.muted }]}>{t.sub}</Text>
                          </View>
                          {sel && <Feather name="check" size={15} color={accent} />}
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>
            </View>

            {/* History */}
            <Text style={[styles.section, ff(font.bodyBold, '700'), { color: p.muted }]}>Recent Push Broadcasts</Text>
            {broadcasts.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: p.card, borderColor: p.line }]}>
                <Feather name="inbox" size={26} color={p.muted} />
                <Text style={[styles.emptyText, ff(font.body, '500'), { color: p.sub }]}>No push broadcasts sent yet</Text>
              </View>
            ) : (
              <View style={[styles.hist, { backgroundColor: p.card, borderColor: p.line }]}>
                {broadcasts.map((b, i) => {
                  const date = new Date(Number(b.createdAt)).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  const targeted = Number(b.totalTargeted) || 0;
                  const delivered = Number(b.pushDelivered) || 0;
                  const pct = targeted > 0 ? Math.min(100, (delivered / targeted) * 100) : 0;
                  const running = b.status === 'processing' || b.status === 'pending';
                  const failed = b.status === 'failed';
                  const dot = failed ? p.danger : running ? p.tint.blue.fg : accent;
                  return (
                    <View key={b.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: p.line }]}>
                      <View style={styles.histTop}>
                        <Text style={[styles.histTitle, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                          {b.title}
                        </Text>
                        <Text style={[styles.histDate, ff(font.body, '500'), { color: p.muted }]}>{date}</Text>
                      </View>
                      <View style={styles.histMeta}>
                        <View style={[styles.dot, { backgroundColor: dot }]} />
                        <View style={[styles.tag, { backgroundColor: p.soft }]}>
                          <Text style={[styles.tagText, ff(font.bodySemi, '600'), { color: p.sub }]}>
                            {TYPE_LABEL[b.type] || b.type}
                          </Text>
                        </View>
                        <View style={[styles.histTrack, { backgroundColor: p.soft }]}>
                          <View style={[styles.histFill, { width: `${pct}%`, backgroundColor: failed ? p.danger : accent }]} />
                        </View>
                        <Text style={[styles.histNum, ff(font.body, '500'), { color: p.sub }]}>
                          {delivered.toLocaleString()} / {targeted.toLocaleString()}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          /* ============================================================== */
          /* 2. EMAIL BROADCAST TAB */
          /* ============================================================== */
          <>
            {/* Audience + daily limit */}
            <View style={styles.reach}>
              <View style={styles.reachRow}>
                <View>
                  <Text style={[styles.reachBig, ff(font.displayBold, '700')]}>
                    {loading ? '—' : emailRecipientCount.toLocaleString()}
                  </Text>
                  <Text style={[styles.reachLabel, ff(font.body, '500')]}>
                    {emailRecipientCount === 1 ? 'person will receive it' : 'people will receive it'}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[styles.reachOf, ff(font.body, '500')]}>
                    {emailAudience.remainingToday.toLocaleString()} of {emailAudience.dailyLimit.toLocaleString()}
                    {'\n'}broadcasts left
                  </Text>
                </View>
              </View>
              <View style={styles.reachTrack}>
                <View
                  style={[
                    styles.reachFill,
                    {
                      width: `${Math.min(100, Math.round((emailAudience.remainingToday / Math.max(1, emailAudience.dailyLimit)) * 100))}%`,
                      backgroundColor: overQuota ? CORAL : LIME,
                    },
                  ]}
                />
              </View>
              {overQuota && (
                <Text style={[styles.reachWarn, ff(font.bodySemi, '600')]}>
                  {`Only ${sendableToday.toLocaleString()} can go out today. The rest send tomorrow.`}
                </Text>
              )}

              {/* Primary Email Telemetry Banner */}
              <View style={[styles.telemetryBanner, { backgroundColor: p.soft, borderColor: p.line }]}>
                <View style={styles.telemetryLeft}>
                  <View style={[styles.telemetryIcon, { backgroundColor: FOREST }]}>
                    <Feather name="shield" size={13} color={LIME} />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.telemetryTitle, ff(font.bodySemi, '600'), { color: p.text }]}>
                      Primary Auth & Verifications
                    </Text>
                    <Text style={[styles.telemetrySub, ff(font.body, '400'), { color: p.muted }]}>
                      {primaryEmailStats.remainingToday.toLocaleString()} of {primaryEmailStats.dailyLimit} left today • {primaryEmailStats.verificationsToday} verifications sent
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={openEmailPage}
                  activeOpacity={0.7}
                  style={[styles.telemetryBtn, { backgroundColor: p.card, borderColor: p.line }]}
                  accessibilityLabel="View full email telemetry"
                >
                  <Feather name="sliders" size={13} color={accent} style={{ marginRight: 4 }} />
                  <Text style={[styles.telemetryBtnText, ff(font.bodySemi, '600'), { color: accent }]}>
                    Config
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Composer */}
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
              <View style={[styles.cardHead, { borderBottomColor: p.line }]}>
                <Text style={[styles.cardTitle, ff(font.bodyBold, '700'), { color: p.text }]}>New email</Text>
              </View>

              {/* Template */}
              <View style={styles.field}>
                <Text style={[styles.fieldLabel, styles.fieldLabelGap, ff(font.bodySemi, '600'), { color: p.sub }]}>Template</Text>
                <TouchableOpacity
                  onPress={() => {
                    setEmailMenu(null);
                    setShowTemplates(true);
                  }}
                  activeOpacity={0.75}
                  accessibilityRole="button"
                  accessibilityLabel={`Template: ${currentTemplate ? currentTemplate.name : 'Blank email'}. Change`}
                  style={[styles.templateField, { borderColor: p.line, backgroundColor: p.soft }]}
                >
                  <View style={[styles.templateMini, { borderColor: p.line }]}>
                    <EmailThumb
                      label={currentTemplate?.label}
                      headline={emailSubject}
                      hasButton={!!firstButtonText(emailMarkdown)}
                      height={58}
                    />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={[styles.pickText, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                      {currentTemplate ? currentTemplate.name : 'Blank email'}
                    </Text>
                    <Text style={[styles.menuSub, ff(font.body, '400'), { color: p.sub }]} numberOfLines={1}>
                      {currentTemplate ? `${currentTemplate.group} · ${isRequiredCategory(currentTemplate.category) ? 'sent to everyone' : 'has unsubscribe link'}` : 'Pick a ready-made email'}
                    </Text>
                  </View>
                  <Text style={[styles.changeText, ff(font.bodySemi, '600'), { color: accent }]}>Change</Text>
                </TouchableOpacity>
              </View>

              {/* To */}
              <PickerField
                label="To"
                icon={currentAudience.icon}
                value={currentAudience.id === 'all_verified' ? `${currentAudience.name} (${emailAudience.totalVerifiedUsers.toLocaleString()})` : currentAudience.name}
                open={emailMenu === 'audience'}
                onToggle={() => toggleEmailMenu('audience')}
                options={EMAIL_AUDIENCES}
                selectedId={emailTargetType}
                onSelect={(id) => {
                  setEmailTargetType(id as typeof emailTargetType);
                  setEmailMenu(null);
                }}
                p={p}
                font={font}
                accent={accent}
              />

              {emailTargetType === 'specific_user' && (
                <View style={styles.userPickerContainer}>
                  {selectedUser ? (
                    <View style={[styles.selectedUserCard, { backgroundColor: p.soft, borderColor: p.line }]}>
                      <View style={[styles.userAvatar, { backgroundColor: FOREST }]}>
                        <Text style={[styles.userAvatarText, ff(font.bodyBold, '700'), { color: LIME }]}>
                          {(selectedUser.name || selectedUser.email || 'U').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.selectedUserInfo}>
                        <View style={styles.selectedUserRow}>
                          <Text style={[styles.selectedUserName, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                            {selectedUser.name || 'Unnamed account'}
                          </Text>
                          {selectedUser.isVerified && (
                            <View style={styles.verifiedBadge}>
                              <Feather name="check" size={11} color="#059669" />
                            </View>
                          )}
                        </View>
                        <Text style={[styles.selectedUserEmail, ff(font.body, '400'), { color: p.muted }]} numberOfLines={1}>
                          {selectedUser.email || selectedUser.id}
                        </Text>
                      </View>
                      <TouchableOpacity
                        onPress={handleClearSelectedUser}
                        style={[styles.userClearBtn, { backgroundColor: p.card, borderColor: p.line }]}
                        hitSlop={8}
                        accessibilityLabel="Change user"
                      >
                        <Feather name="x" size={14} color={p.sub} />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View>
                      <View style={[styles.userSearchInputWrap, { backgroundColor: p.soft, borderColor: p.line }]}>
                        <Feather name="search" size={16} color={p.muted} style={{ marginRight: 8 }} />
                        <TextInput
                          value={userSearchText}
                          onChangeText={handleUserSearchChange}
                          placeholder="Search user by name or email..."
                          placeholderTextColor={p.muted}
                          autoCapitalize="none"
                          autoCorrect={false}
                          style={[styles.userSearchInput, ff(font.body, '500'), { color: p.text }]}
                        />
                        {userSearchLoading ? (
                          <ActivityIndicator size="small" color={accent} style={{ marginLeft: 6 }} />
                        ) : userSearchText.length > 0 ? (
                          <TouchableOpacity onPress={() => handleUserSearchChange('')} hitSlop={8}>
                            <Feather name="x" size={15} color={p.muted} />
                          </TouchableOpacity>
                        ) : null}
                      </View>

                      {userSearchResults.length > 0 && (
                        <View style={[styles.searchResultsBox, { backgroundColor: p.card, borderColor: p.line }]}>
                          {userSearchResults.map((u, idx) => (
                            <TouchableOpacity
                              key={u.id}
                              onPress={() => handleSelectUser(u)}
                              activeOpacity={0.7}
                              style={[
                                styles.userResultItem,
                                { borderColor: p.line },
                                idx === userSearchResults.length - 1 && { borderBottomWidth: 0 },
                              ]}
                            >
                              <View style={[styles.userMiniAvatar, { backgroundColor: p.soft }]}>
                                <Text style={[styles.userMiniAvatarText, ff(font.bodySemi, '600'), { color: p.text }]}>
                                  {(u.name || u.email || 'U').slice(0, 1).toUpperCase()}
                                </Text>
                              </View>
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <Text style={[styles.userResultName, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                                    {u.name || 'Unnamed account'}
                                  </Text>
                                  {u.isVerified && (
                                    <Feather name="check-circle" size={12} color="#059669" />
                                  )}
                                </View>
                                <Text style={[styles.userResultEmail, ff(font.body, '400'), { color: p.muted }]} numberOfLines={1}>
                                  {u.email || u.id}
                                </Text>
                              </View>
                              <Feather name="plus" size={15} color={accent} />
                            </TouchableOpacity>
                          ))}
                        </View>
                      )}

                      {!userSearchLoading && userSearchText.trim().length > 1 && userSearchResults.length === 0 && (
                        <View style={[styles.noUserResultsBox, { backgroundColor: p.card, borderColor: p.line }]}>
                          <Text style={[styles.noUserResultsText, ff(font.body, '500'), { color: p.muted }]}>
                            No users found matching "{userSearchText}".
                          </Text>
                          <TouchableOpacity
                            onPress={() => handleUseDirectIdOrEmail(userSearchText)}
                            style={[styles.directUserBtn, { borderColor: p.line, backgroundColor: p.soft }]}
                            activeOpacity={0.7}
                          >
                            <Feather name="arrow-right-circle" size={14} color={accent} />
                            <Text style={[styles.directUserText, ff(font.bodySemi, '600'), { color: accent }]}>
                              Use "{userSearchText.trim()}" directly
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              )}

              {emailTargetType === 'custom_list' && (
                <View style={styles.subInput}>
                  <TextInput
                    value={customEmailsText}
                    onChangeText={setCustomEmailsText}
                    placeholder="One email per line, or separated by commas"
                    placeholderTextColor={p.muted}
                    autoCapitalize="none"
                    autoCorrect={false}
                    keyboardType="email-address"
                    multiline
                    style={[styles.area, ff(font.body, '500'), { color: p.text, borderColor: p.line, backgroundColor: p.soft }]}
                  />
                  {customEmails.length > 0 && (
                    <Text style={[styles.helper, ff(font.body, '500'), { color: p.muted }]}>
                      {customEmails.length} {customEmails.length === 1 ? 'address' : 'addresses'}
                    </Text>
                  )}
                </View>
              )}

              {/* Category */}
              <PickerField
                label="Category"
                icon={currentCategory.icon}
                value={currentCategory.name}
                open={emailMenu === 'category'}
                onToggle={() => toggleEmailMenu('category')}
                options={EMAIL_CATEGORIES}
                selectedId={emailCategory}
                onSelect={(id) => {
                  setEmailCategory(id as typeof emailCategory);
                  setEmailMenu(null);
                }}
                p={p}
                font={font}
                accent={accent}
              />

              {/* Subject */}
              <View style={styles.field}>
                <View style={styles.fieldTop}>
                  <Text style={[styles.fieldLabel, ff(font.bodySemi, '600'), { color: p.sub }]}>Subject</Text>
                  <Text style={[styles.count, ff(font.body, '500'), { color: p.muted }]}>{emailSubject.length}/100</Text>
                </View>
                <TextInput
                  value={emailSubject}
                  onChangeText={setEmailSubject}
                  maxLength={100}
                  placeholder="What's this email about?"
                  placeholderTextColor={p.muted}
                  style={[styles.input, ff(font.bodySemi, '600'), { color: p.text, borderColor: p.line, backgroundColor: p.soft }]}
                />
              </View>

              {/* Message */}
              <View style={styles.field}>
                <View style={styles.fieldTop}>
                  <Text style={[styles.fieldLabel, ff(font.bodySemi, '600'), { color: p.sub }]}>Message</Text>
                  <TouchableOpacity
                    onPress={() => setEmailMarkdown((m) => (m && !m.endsWith(' ') && !m.endsWith('\n') ? `${m} {{name}}` : `${m}{{name}}`))}
                    activeOpacity={0.7}
                    hitSlop={8}
                    style={[styles.varPill, { backgroundColor: p.soft }]}
                  >
                    <Feather name="user" size={11} color={p.sub} />
                    <Text style={[styles.varPillText, ff(font.bodySemi, '600'), { color: p.sub }]}>Add name</Text>
                  </TouchableOpacity>
                </View>
                <TextInput
                  value={emailMarkdown}
                  onChangeText={setEmailMarkdown}
                  multiline
                  placeholder="Write your message"
                  placeholderTextColor={p.muted}
                  style={[styles.emailArea, ff(font.body, '500'), { color: p.text, borderColor: p.line, backgroundColor: p.soft }]}
                />
                <Text style={[styles.helper, ff(font.body, '500'), { color: p.muted }]}>
                  **bold**  ·  - list  ·  &gt; note  ·  [button: Text](https://…)
                </Text>
                {placeholders.length > 0 && (
                  <Text style={[styles.helper, ff(font.bodySemi, '600'), { color: p.danger }]}>
                    Fill in {placeholders.join(', ')} before sending.
                  </Text>
                )}
              </View>
            </View>

            {/* Preview */}
            <View style={styles.previewHead}>
              <Text style={[styles.section, styles.sectionInline, ff(font.bodyBold, '700'), { color: p.muted }]}>Preview</Text>
              <TouchableOpacity onPress={() => setShowPreview(true)} hitSlop={10} disabled={!emailDraft.subject || !emailDraft.bodyMarkdown}>
                <Text style={[styles.changeText, ff(font.bodySemi, '600'), { color: emailDraft.subject && emailDraft.bodyMarkdown ? accent : p.muted }]}>
                  Full preview
                </Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity
              onPress={() => setShowPreview(true)}
              disabled={!emailDraft.subject || !emailDraft.bodyMarkdown}
              activeOpacity={0.85}
              accessibilityLabel="Open full preview"
              style={[styles.emailPreviewCard, { borderColor: p.line }]}
            >
              <View style={styles.emailInboxRow}>
                <Image source={APP_ICON} style={styles.emailAvatar} accessibilityIgnoresInvertColors />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[styles.emailFrom, ff(font.bodyBold, '700')]} numberOfLines={1}>
                    Regent Money
                  </Text>
                  <Text style={[styles.emailSubjectLine, ff(font.bodySemi, '600')]} numberOfLines={1}>
                    {emailSubject.trim() || 'Subject'}
                  </Text>
                </View>
                <Text style={[styles.emailTime, ff(font.body, '500')]}>now</Text>
              </View>
              <View style={styles.emailBodyWrap}>
                <View style={styles.emailBrandBar}>
                  <Image source={APP_ICON} style={styles.emailBrandLogo} accessibilityIgnoresInvertColors />
                  <Text style={[styles.emailBrandName, ff(font.bodyBold, '700')]}>Regent Money</Text>
                </View>
                <View style={styles.emailMiniCard}>
                  {!!(emailLabel ?? DEFAULT_EMAIL_LABEL[emailCategory]) && (
                    <Text
                      style={[
                        styles.emailMiniLabel,
                        ff(font.bodyBold, '700'),
                        { color: isRequiredCategory(emailCategory) ? '#5B6B63' : '#0B6B3A' },
                      ]}
                    >
                      {(emailLabel ?? DEFAULT_EMAIL_LABEL[emailCategory]).toUpperCase()}
                    </Text>
                  )}
                  <Text style={[styles.emailMiniTitle, ff(font.bodyBold, '700')]} numberOfLines={2}>
                    {emailSubject.trim() || 'Subject'}
                  </Text>
                  <Text style={[styles.emailPreviewBody, ff(font.body, '400')]} numberOfLines={4}>
                    {markdownToPlain(emailMarkdown) || 'Your message will appear here.'}
                  </Text>
                  {!!firstButtonText(emailMarkdown) && (
                    <View style={styles.emailMiniButton}>
                      <Text style={[styles.emailMiniButtonText, ff(font.bodySemi, '600')]}>{firstButtonText(emailMarkdown)}</Text>
                    </View>
                  )}
                </View>
                {!isRequiredCategory(emailCategory) && (
                  <Text style={[styles.emailPreviewUnsub, ff(font.body, '500')]}>Unsubscribe</Text>
                )}
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleSendEmailTest}
              disabled={sendingTest}
              activeOpacity={0.8}
              style={[styles.testBtn, { borderColor: p.line, backgroundColor: p.card }]}
            >
              {sendingTest ? (
                <ActivityIndicator size="small" color={accent} />
              ) : (
                <>
                  <Feather name="mail" size={15} color={p.text} />
                  <Text style={[styles.testBtnText, ff(font.bodyBold, '700'), { color: p.text }]}>Send a test to me</Text>
                </>
              )}
            </TouchableOpacity>

            {/* History */}
            <Text style={[styles.section, ff(font.bodyBold, '700'), { color: p.muted }]}>Recent</Text>
            {emailBroadcasts.length === 0 ? (
              <View style={[styles.empty, { backgroundColor: p.card, borderColor: p.line }]}>
                <Feather name="mail" size={24} color={p.muted} />
                <Text style={[styles.emptyText, ff(font.body, '500'), { color: p.sub }]}>No emails sent yet</Text>
              </View>
            ) : (
              <View style={[styles.hist, { backgroundColor: p.card, borderColor: p.line }]}>
                {emailBroadcasts.map((b, i) => {
                  const date = new Date(Number(b.createdAt)).toLocaleString('en-IN', {
                    day: 'numeric',
                    month: 'short',
                    hour: 'numeric',
                    minute: '2-digit',
                  });
                  const total = Number(b.totalRecipients) || 0;
                  const sent = Number(b.sentCount) || 0;
                  const failedN = Number(b.failedCount) || 0;
                  const pct = total > 0 ? Math.min(100, (sent / total) * 100) : 0;
                  const running = b.status === 'processing' || b.status === 'pending';
                  const bad = b.status === 'failed' || b.status === 'cancelled';
                  const dot = bad ? p.danger : running || b.status === 'paused' ? p.tint.blue.fg : accent;
                  return (
                    <View key={b.id} style={[styles.histRow, i > 0 && { borderTopWidth: 1, borderTopColor: p.line }]}>
                      <View style={styles.histTop}>
                        <Text style={[styles.histTitle, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
                          {b.subject}
                        </Text>
                        <Text style={[styles.histDate, ff(font.body, '500'), { color: p.muted }]}>{date}</Text>
                      </View>
                      <View style={styles.histMeta}>
                        <View style={[styles.dot, { backgroundColor: dot }]} />
                        <View style={[styles.tag, { backgroundColor: p.soft }]}>
                          <Text style={[styles.tagText, ff(font.bodySemi, '600'), { color: p.sub }]}>
                            {b.status === 'paused' ? 'Paused' : TYPE_LABEL[b.category] || b.category}
                          </Text>
                        </View>
                        <View style={[styles.histTrack, { backgroundColor: p.soft }]}>
                          <View style={[styles.histFill, { width: `${pct}%`, backgroundColor: bad ? p.danger : accent }]} />
                        </View>
                        <Text style={[styles.histNum, ff(font.body, '500'), { color: p.sub }]}>
                          {sent.toLocaleString()} / {total.toLocaleString()}
                          {failedN > 0 ? ` · ${failedN} failed` : ''}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Docked Action Button */}
      <View pointerEvents="box-none" style={[styles.dock, { bottom: tabBarSpace + 10 }]}>
        <TouchableOpacity
          onPress={openSheet}
          disabled={isPush ? !canSendPush : !canSendEmail}
          activeOpacity={0.85}
          style={[
            styles.sendBtn,
            {
              backgroundColor: (isPush ? canSendPush : canSendEmail) || sending ? FOREST : p.soft,
            },
          ]}
        >
          {sending ? (
            <ActivityIndicator color={LIME} />
          ) : (
            <>
              <Feather
                name={isPush ? 'send' : 'mail'}
                size={17}
                color={(isPush ? canSendPush : canSendEmail) ? LIME : p.muted}
              />
              <Text
                style={[
                  styles.sendText,
                  ff(font.bodyBold, '700'),
                  { color: (isPush ? canSendPush : canSendEmail) ? LIME : p.muted },
                ]}
              >
                {isPush
                  ? `Send to ${audience.pushEnabledUsers.toLocaleString()} devices`
                  : `Send email to ${emailRecipientCount.toLocaleString()} ${emailRecipientCount === 1 ? 'person' : 'people'}`}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>

      {/* Toast Alert */}
      {toast && (
        <Animated.View
          entering={FadeInDown.springify().damping(16)}
          exiting={FadeOutUp.duration(180)}
          style={[
            styles.toast,
            { top: Math.max(insets.top, 16) + 8, backgroundColor: toast.type === 'success' ? FOREST : p.tint.coral.bg },
          ]}
        >
          <Feather
            name={toast.type === 'success' ? 'check-circle' : 'alert-circle'}
            size={18}
            color={toast.type === 'success' ? LIME : p.danger}
          />
          <Text
            style={[
              styles.toastText,
              ff(font.bodySemi, '600'),
              { color: toast.type === 'success' ? '#FFFFFF' : p.danger },
            ]}
          >
            {toast.message}
          </Text>
        </Animated.View>
      )}

      {/* Confirmation Bottom Sheet */}
      <Modal visible={sheetVisible} transparent animationType="fade" onRequestClose={() => closeSheet()} statusBarTranslucent>
        <View style={[StyleSheet.absoluteFill, styles.scrim]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} accessibilityLabel="Close" />
        </View>
        <View
          style={[
            styles.sheet,
            { backgroundColor: p.card, paddingBottom: Math.max(insets.bottom, 16) + 8 },
          ]}
        >
          <Text style={[styles.sheetTitle, ff(font.displayBold, '700'), { color: p.text }]}>
            {isPush ? 'Send this notification?' : 'Send this email?'}
          </Text>
          <Text style={[styles.sheetMsg, ff(font.body, '500'), { color: p.sub }]}>
            It goes out right away and can't be recalled.
          </Text>

          <View style={[styles.summary, { backgroundColor: p.soft }]}>
            {isPush ? (
              <>
                <SummaryRow label="Title" value={title.trim()} p={p} font={font} first />
                <SummaryRow label="Opens" value={selected.name} p={p} font={font} />
                <SummaryRow label="Reach" value={`${audience.pushEnabledUsers.toLocaleString()} devices`} p={p} font={font} />
              </>
            ) : (
              <>
                <SummaryRow label="Subject" value={emailSubject.trim()} p={p} font={font} first />
                <SummaryRow label="Category" value={currentCategory.name} p={p} font={font} />
                <SummaryRow
                  label="To"
                  value={
                    emailTargetType === 'specific_user' && selectedUser
                      ? `${selectedUser.name || 'User'} (${selectedUser.email || selectedUser.id})`
                      : `${emailRecipientCount.toLocaleString()} ${emailRecipientCount === 1 ? 'person' : 'people'}`
                  }
                  p={p}
                  font={font}
                />
                <SummaryRow
                  label="Today"
                  value={
                    overQuota
                      ? `${sendableToday.toLocaleString()} now, rest tomorrow`
                      : `${emailRecipientCount.toLocaleString()} of ${sendableToday.toLocaleString()} left`
                  }
                  p={p}
                  font={font}
                />
              </>
            )}
          </View>

          <View style={styles.sheetBtns}>
            <TouchableOpacity onPress={() => closeSheet()} style={[styles.ghostBtn, { borderColor: p.line }]} activeOpacity={0.7}>
              <Text style={[styles.ghostText, ff(font.bodySemi, '600'), { color: p.text }]}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => closeSheet(isPush ? handleExecutePushBroadcast : handleExecuteEmailBroadcast)}
              style={[styles.confirmBtn, { backgroundColor: FOREST }]}
              activeOpacity={0.85}
            >
              <Feather name={isPush ? 'send' : 'mail'} size={16} color={LIME} />
              <Text style={[styles.sendText, ff(font.bodyBold, '700'), { color: LIME }]}>
                Send now
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      <EmailTemplatePicker
        visible={showTemplates}
        selectedId={templateId}
        onClose={() => setShowTemplates(false)}
        onPick={applyEmailTemplate}
      />
      <EmailPreviewModal
        visible={showPreview}
        draft={emailDraft}
        onClose={() => setShowPreview(false)}
        onSendTest={handleSendEmailTest}
        sendingTest={sendingTest}
      />
    </KeyboardAvoidingView>
  );
};

/** Labelled select: a field showing the current choice that opens a simple list underneath. */
const PickerField: React.FC<{
  label: string;
  icon: FeatherName;
  value: string;
  open: boolean;
  onToggle: () => void;
  options: PickOption[];
  selectedId: string;
  onSelect: (id: string) => void;
  p: any;
  font: any;
  accent: string;
}> = ({ label, icon, value, open, onToggle, options, selectedId, onSelect, p, font, accent }) => (
  <View style={styles.field}>
    <Text style={[styles.fieldLabel, styles.fieldLabelGap, ff(font.bodySemi, '600'), { color: p.sub }]}>{label}</Text>
    <TouchableOpacity
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={`${label}: ${value}`}
      style={[styles.pickBtn, { borderColor: open ? accent : p.line, backgroundColor: p.soft }]}
    >
      <Feather name={icon} size={15} color={p.text} style={{ marginRight: 10 }} />
      <Text style={[styles.pickText, ff(font.bodySemi, '600'), { color: p.text }]} numberOfLines={1}>
        {value}
      </Text>
      <Feather name={open ? 'chevron-up' : 'chevron-down'} size={16} color={p.sub} />
    </TouchableOpacity>
    {open && (
      <View style={[styles.menu, { backgroundColor: p.card, borderColor: p.line }]}>
        {options.map((o, i) => {
          const sel = o.id === selectedId;
          return (
            <TouchableOpacity
              key={o.id}
              onPress={() => onSelect(o.id)}
              activeOpacity={0.7}
              accessibilityRole="menuitem"
              accessibilityState={{ selected: sel }}
              style={[
                styles.menuItem,
                i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: p.line },
                sel && { backgroundColor: p.soft },
              ]}
            >
              <View style={[styles.menuIcon, { backgroundColor: sel ? p.card : p.soft }]}>
                <Feather name={o.icon} size={14} color={sel ? accent : p.text} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={[styles.menuName, ff(font.bodySemi, '600'), { color: p.text }]}>{o.name}</Text>
                <Text style={[styles.menuSub, ff(font.body, '400'), { color: p.muted }]} numberOfLines={1}>
                  {o.sub}
                </Text>
              </View>
              {sel && <Feather name="check" size={15} color={accent} />}
            </TouchableOpacity>
          );
        })}
      </View>
    )}
  </View>
);

const SummaryRow: React.FC<{ label: string; value: string; p: any; font: any; first?: boolean }> = ({
  label,
  value,
  p,
  font,
  first,
}) => (
  <View style={[styles.sumRow, !first && { borderTopWidth: 1, borderTopColor: p.line }]}>
    <Text style={[styles.sumLabel, ff(font.body, '500'), { color: p.sub }]}>{label}</Text>
    <Text style={[styles.sumVal, ff(font.bodyBold, '700'), { color: p.text }]} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  headerLogo: { width: 28, height: 28, borderRadius: 8, marginRight: 10 },
  headerTitle: { fontSize: 22, flex: 1 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 11,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: { paddingHorizontal: 16 },

  /* Channel switch */
  channelToggle: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  channelOn: {
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  channelBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  channelText: { fontSize: 13 },

  /* Reach card */
  reach: {
    backgroundColor: FOREST,
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
  },
  reachRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  reachBig: { color: LIME, fontSize: 32, lineHeight: 36 },
  reachLabel: { color: '#E1E9E4', fontSize: 12, marginTop: 2 },
  reachOf: { color: '#FFFFFF', fontSize: 13, lineHeight: 18, textAlign: 'right' },
  reachTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.18)',
    overflow: 'hidden',
  },
  reachFill: {
    height: '100%',
    backgroundColor: LIME,
    borderRadius: 3,
  },
  reachWarn: { color: '#FFD2C4', fontSize: 12, marginTop: 10, lineHeight: 17 },

  /* Templates */
  templates: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  chipText: { fontSize: 12 },

  /* Push Mockup preview */
  previewFrame: {
    borderRadius: 22,
    backgroundColor: '#0F172A',
    padding: 14,
    marginBottom: 14,
  },
  bubble: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 16,
    padding: 14,
  },
  bubbleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  bubbleIcon: { width: 14, height: 14, borderRadius: 3, marginRight: 6 },
  bubbleApp: { color: '#CBD5E1', fontSize: 10, letterSpacing: 0.6, fontWeight: '700' },
  bubbleDot: { width: 3, height: 3, borderRadius: 1.5, backgroundColor: '#94A3B8', marginHorizontal: 6 },
  bubbleNow: { color: '#94A3B8', fontSize: 10 },
  bubbleTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '700', marginBottom: 2 },
  bubbleBody: { color: '#E2E8F0', fontSize: 12, lineHeight: 16 },

  /* Email Preview Card */
  emailPreviewCard: {
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: 18,
    backgroundColor: '#FFFFFF',
  },
  emailInboxRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF3F0',
  },
  emailAvatar: { width: 34, height: 34, borderRadius: 17 },
  emailFrom: { fontSize: 13, color: '#0E1F17' },
  emailSubjectLine: { fontSize: 12.5, color: '#3C4A43', marginTop: 1 },
  emailTime: { fontSize: 11, color: '#93A29A' },
  emailBodyWrap: { padding: 16, backgroundColor: '#F7FAF8' },
  emailBrandBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingBottom: 12,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E1E9E4',
  },
  emailBrandLogo: { width: 22, height: 22, borderRadius: 6 },
  emailBrandName: { fontSize: 13, color: FOREST },
  emailPreviewBody: { fontSize: 13, color: '#3C4A43', lineHeight: 19 },
  emailMiniCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E9E4', borderRadius: 8, padding: 14, gap: 6 },
  emailMiniLabel: { fontSize: 9.5, letterSpacing: 0.6 },
  emailMiniTitle: { fontSize: 15, lineHeight: 19, color: '#0E1F17' },
  emailMiniButton: { alignSelf: 'flex-start', marginTop: 4, backgroundColor: FOREST, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  emailMiniButtonText: { fontSize: 11, color: '#FFFFFF' },
  previewHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionInline: { marginBottom: 10 },
  templateField: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, paddingRight: 12, borderRadius: 12, borderWidth: 1 },
  templateMini: { width: 48, borderRadius: 6, overflow: 'hidden', borderWidth: 1 },
  changeText: { fontSize: 13 },
  testBtn: { height: 46, borderRadius: 13, borderWidth: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, marginBottom: 18 },
  testBtnText: { fontSize: 13.5 },
  emailPreviewUnsub: { fontSize: 11, color: '#93A29A', marginTop: 14, textDecorationLine: 'underline' },

  /* Composer card */
  card: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    marginBottom: 18,
  },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    marginBottom: 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  cardTitle: { fontSize: 15 },
  ghostPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
  },
  ghostPillText: { fontSize: 12.5 },
  fieldLabelGap: { marginBottom: 6 },
  subInput: { marginTop: 8 },
  helper: { fontSize: 11.5, marginTop: 6 },

  /* User search & picker */
  userPickerContainer: {
    marginTop: 8,
  },
  selectedUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  userAvatarText: {
    fontSize: 13,
  },
  selectedUserInfo: {
    flex: 1,
    minWidth: 0,
  },
  selectedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedUserName: {
    fontSize: 13,
  },
  verifiedBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedUserEmail: {
    fontSize: 12,
    marginTop: 1,
  },
  userClearBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  userSearchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 2,
  },
  userSearchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 10,
  },
  searchResultsBox: {
    marginTop: 6,
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  userResultItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 10,
  },
  userMiniAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userMiniAvatarText: {
    fontSize: 12,
  },
  userResultName: {
    fontSize: 13,
  },
  userResultEmail: {
    fontSize: 11,
    marginTop: 1,
  },
  noUserResultsBox: {
    marginTop: 6,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  noUserResultsText: {
    fontSize: 12,
    marginBottom: 8,
  },
  directUserBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  directUserText: {
    fontSize: 12,
  },
  seg: {
    flexDirection: 'row',
    borderRadius: 12,
    padding: 3,
    position: 'relative',
    marginBottom: 16,
  },
  thumb: {
    position: 'absolute',
    top: 3,
    bottom: 3,
    borderRadius: 9,
  },
  segBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    zIndex: 1,
  },
  segText: { fontSize: 12 },
  field: { marginTop: 14 },
  fieldTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabel: { fontSize: 12 },
  count: { fontSize: 11 },
  input: {
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    fontSize: 14,
  },
  area: {
    minHeight: 76,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  emailArea: {
    minHeight: 120,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 10,
    fontSize: 13,
    textAlignVertical: 'top',
  },
  categoriesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  catBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  catBtnText: { fontSize: 12 },
  varPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  varPillText: { fontSize: 11 },
  pickBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 12,
  },
  pickText: { flex: 1, fontSize: 13 },
  menu: {
    marginTop: 6,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  menuIcon: { width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  menuName: { fontSize: 13 },
  menuSub: { fontSize: 11, marginTop: 1 },

  /* History */
  section: { fontSize: 13, marginBottom: 8, letterSpacing: 0.3 },
  empty: {
    padding: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    gap: 8,
  },
  emptyText: { fontSize: 13 },
  hist: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  histRow: { padding: 14 },
  histTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  histTitle: { fontSize: 13, flex: 1, marginRight: 8 },
  histDate: { fontSize: 11 },
  histMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  tag: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 6 },
  tagText: { fontSize: 10 },
  histTrack: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  histFill: { height: '100%', borderRadius: 2 },
  histNum: { fontSize: 11 },

  /* Docked Action button */
  dock: {
    position: 'absolute',
    left: 16,
    right: 16,
  },
  sendBtn: {
    height: 50,
    borderRadius: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  sendText: { fontSize: 14 },

  /* Toast */
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 6,
    zIndex: 100,
  },
  toastText: { fontSize: 13, flex: 1 },

  /* Sheet */
  scrim: { backgroundColor: 'rgba(0,0,0,0.45)' },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 24,
  },
  grab: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 16,
  },
  sheetTitle: { fontSize: 20, marginBottom: 4 },
  sheetMsg: { fontSize: 13, marginBottom: 16 },
  summary: { borderRadius: 14, paddingHorizontal: 14, marginBottom: 18 },
  sumRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  sumLabel: { fontSize: 12 },
  sumVal: { fontSize: 12, maxWidth: '65%' },
  sheetBtns: { flexDirection: 'row', gap: 10 },
  ghostBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 14 },
  confirmBtn: {
    flex: 1.5,
    height: 46,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  telemetryBanner: {
    marginTop: 12,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  telemetryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  telemetryIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  telemetryTitle: {
    fontSize: 12,
  },
  telemetrySub: {
    fontSize: 11,
    marginTop: 1,
  },
  telemetryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  telemetryBtnText: {
    fontSize: 11,
  },
});
