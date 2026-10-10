// Auth Screens - Login, Signup & Welcome (Regent Money)
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Platform,
  Keyboard,
  Modal,
  Dimensions,
  Image
} from 'react-native';
import { KeyboardScreen } from '../components/KeyboardScreen';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { authService, LastGoogleUser } from '../services/authService';
import { getGoogleWebClientId } from '../config/auth';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme, showGlobalAlert } from '../store';
import { StatusBar } from 'expo-status-bar';
import { CloudflareTurnstile } from '../components/CloudflareTurnstile';

const { width } = Dimensions.get('window');


// ----------------------------------------------------
// Google Auth Button with LinkedIn-Style "Last Used" Card
// ----------------------------------------------------
interface GoogleAuthButtonProps {
  styles: any;
  loading: boolean;
  setLoading: (val: boolean) => void;
}

const GoogleAuthButton: React.FC<GoogleAuthButtonProps> = ({
  styles,
  loading,
  setLoading,
}) => {
  const [lastGoogleUser, setLastGoogleUser] = useState<LastGoogleUser | null>(() => authService.getLastGoogleUser());

  useEffect(() => {
    setLastGoogleUser(authService.getLastGoogleUser());
  }, []);

  const handleDirectLastUserLogin = async () => {
    if (!lastGoogleUser?.email) return;
    const webClientId = getGoogleWebClientId();

    if (Platform.OS !== 'web' && webClientId) {
      setLoading(true);
      try {
        await authService.signInWithGoogleNative(false);
        setLastGoogleUser(authService.getLastGoogleUser());
      } catch (e: any) {
        if (e.code === 'SIGN_IN_CANCELLED' || e.message?.includes('cancelled')) {
          console.log('[Auth] Google Sign-In cancelled.');
        } else {
          showGlobalAlert('Google Sign-In Failed', e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      showGlobalAlert(
        'Mobile Feature',
        'Google Sign-In is only supported on the mobile app. Please sign in using your Email & Password.'
      );
    }
  };

  const handleSwitchAccount = async () => {
    const webClientId = getGoogleWebClientId();
    if (Platform.OS !== 'web' && webClientId) {
      setLoading(true);
      try {
        await authService.signInWithGoogleNative(true);
        setLastGoogleUser(authService.getLastGoogleUser());
      } catch (e: any) {
        if (e.code === 'SIGN_IN_CANCELLED' || e.message?.includes('cancelled')) {
          console.log('[Auth] Google Sign-In cancelled.');
        } else {
          showGlobalAlert('Google Sign-In Failed', e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      showGlobalAlert(
        'Mobile Feature',
        'Google Sign-In is only supported on the mobile app. Please sign in using your Email & Password.'
      );
    }
  };

  const handleGooglePress = async (forceSwitch: boolean = false) => {
    const webClientId = getGoogleWebClientId();
    if (Platform.OS !== 'web' && webClientId) {
      setLoading(true);
      try {
        await authService.signInWithGoogleNative(forceSwitch);
        setLastGoogleUser(authService.getLastGoogleUser());
      } catch (e: any) {
        if (
          e.message?.includes('developer error') ||
          e.code === 'DEVELOPER_ERROR' ||
          e.message?.includes('DEVELOPER_ERROR')
        ) {
          showGlobalAlert(
            'Configuration Notice',
            'Google Web Client ID is mismatching, or your SHA-1 fingerprint is not configured in the Google Cloud Console for Android Package Name (com.anonymous.regentmoney). Please check settings.'
          );
        } else if (e.code === 'SIGN_IN_CANCELLED' || e.message?.includes('cancelled')) {
          console.log('[Auth] Google Sign-In cancelled.');
        } else {
          showGlobalAlert('Google Sign-In Failed', e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      showGlobalAlert(
        'Mobile Feature',
        'Google Sign-In is only supported on the mobile app. Please sign in using your Email & Password.'
      );
    }
  };

  if (lastGoogleUser?.email) {
    const displayName = lastGoogleUser.name || lastGoogleUser.email.split('@')[0];
    const initial = (lastGoogleUser.name || lastGoogleUser.email).charAt(0).toUpperCase();

    return (
      <View style={styles.linkedInGoogleContainer}>
        {/* Main 1-Tap Google Button - Directly logs in as lastGoogleUser */}
        <TouchableOpacity
          style={styles.linkedInGoogleCard}
          onPress={handleDirectLastUserLogin}
          activeOpacity={0.85}
        >
          <View style={styles.linkedInAvatarWrap}>
            {lastGoogleUser.photo ? (
              <Image source={{ uri: lastGoogleUser.photo }} style={styles.linkedInAvatarImage} />
            ) : (
              <View style={styles.linkedInAvatarFallback}>
                <Text style={styles.linkedInAvatarInitial}>{initial}</Text>
              </View>
            )}
          </View>

          <View style={styles.linkedInMeta}>
            <View style={styles.linkedInNameRow}>
              <Text style={styles.linkedInContinueText} numberOfLines={1}>
                Continue as {displayName.split(' ')[0]}
              </Text>
              <View style={styles.lastUsedBadge}>
                <Text style={styles.lastUsedBadgeText}>Last used</Text>
              </View>
            </View>
            <Text style={styles.linkedInEmailText} numberOfLines={1}>
              {lastGoogleUser.email}
            </Text>
          </View>

          <View style={styles.googleIconBadge}>
            <Ionicons name="logo-google" size={18} color="#FFFFFF" />
          </View>
        </TouchableOpacity>

        {/* Change / Switch Account Option */}
        <TouchableOpacity
          style={styles.switchAccountBtn}
          onPress={handleSwitchAccount}
          activeOpacity={0.7}
        >
          <Ionicons name="swap-horizontal" size={14} color="#10B981" style={{ marginRight: 6 }} />
          <Text style={styles.switchAccountBtnText}>Switch Google account</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <TouchableOpacity
      style={styles.googleBtnLuxury}
      onPress={() => handleGooglePress(false)}
      activeOpacity={0.85}
    >
      <Ionicons name="logo-google" size={18} color="#FFFFFF" style={{ marginRight: 10 }} />
      <Text style={styles.googleBtnLuxuryText}>Continue with Google</Text>
    </TouchableOpacity>
  );
};

// ----------------------------------------------------
// 1. Welcome Screen
// ----------------------------------------------------
export const WelcomeScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }]}>
      {/* Ambient Neon Glow */}
      <View style={styles.neonGlow} />

      <View style={styles.welcomeMainContent}>
        {/* Top/Center Branding */}
        <Animated.View entering={FadeIn.delay(100).duration(800)} style={styles.welcomeBranding}>
          <View style={styles.logoBadgeLuxury}>
            <Image
              source={require('../../assets/insideicon.png')}
              style={styles.logoImageInside}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeHeaderSmall}>WELCOME TO</Text>
          <Text style={styles.welcomeHeaderBig}>REGENT MONEY</Text>
          <Text style={styles.welcomeSlogan}>Master your wealth. In absolute privacy.</Text>
        </Animated.View>

        {/* Bottom Interaction Actions */}
        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.actionsContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#2dba4e" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryBtnLuxury}
                onPress={() => navigation.navigate('Signup')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnLuxuryText}>Create Account</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtnLuxury}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnLuxuryText}>Log In</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleAuthButton
                styles={styles}
                loading={loading}
                setLoading={setLoading}
              />
            </>
          )}

          <Text style={styles.legalNotice}>
            End-to-End Encrypted
          </Text>
        </Animated.View>
      </View>
    </View>
  );
};

// ----------------------------------------------------
// 1B. Auth Landing Screen (For Returning / Logged-Out Users)
// No "WELCOME TO" message since the user is already onboarded.
// Primary action is "Log In".
// ----------------------------------------------------
export const AuthLandingScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [loading, setLoading] = useState(false);

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: Math.max(insets.bottom, 24) }]}>
      {/* Ambient Neon Glow */}
      <View style={styles.neonGlow} />

      <View style={styles.welcomeMainContent}>
        {/* Top/Center Branding - NO "WELCOME TO" message! */}
        <Animated.View entering={FadeIn.delay(100).duration(800)} style={styles.welcomeBranding}>
          <View style={styles.logoBadgeLuxury}>
            <Image
              source={require('../../assets/insideicon.png')}
              style={styles.logoImageInside}
              resizeMode="contain"
            />
          </View>
          <Text style={styles.welcomeHeaderBig}>REGENT MONEY</Text>
          <Text style={styles.welcomeSlogan}>Master your wealth. In absolute privacy.</Text>
        </Animated.View>

        {/* Bottom Interaction Actions - Log In is Primary */}
        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.actionsContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#2dba4e" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <TouchableOpacity
                style={styles.primaryBtnLuxury}
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnLuxuryText}>Log In</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.secondaryBtnLuxury}
                onPress={() => navigation.navigate('Signup')}
                activeOpacity={0.85}
              >
                <Text style={styles.secondaryBtnLuxuryText}>Create Account</Text>
              </TouchableOpacity>

              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <GoogleAuthButton
                styles={styles}
                loading={loading}
                setLoading={setLoading}
              />
            </>
          )}

          <Text style={styles.legalNotice}>
            End-to-End Encrypted
          </Text>
        </Animated.View>
      </View>
    </View>
  );
};

// ----------------------------------------------------
// 2. Login Screen
// ----------------------------------------------------
export const LoginScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleLogin = async () => {
    if (!emailOrMobile.trim() || !password) {
      setError('Please enter both Email/Mobile and Password');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      setError('Please complete the Cloudflare security verification');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.logIn(emailOrMobile, password, rememberMe, turnstileToken);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardScreen
        contentContainerStyle={[
          styles.formScrollContent,
          {
            paddingTop: insets.top + 20,
          }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.authHeaderSection}>
          <View style={[styles.logoBadgeSmall, { alignSelf: 'flex-start' }]}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImageSmall}
            />
          </View>
          <Text style={styles.authHeaderTitle}>Welcome Back</Text>
          <Text style={styles.authHeaderDesc}>Enter your offline credentials to access Regent Money</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
            <Text style={styles.errorTextInline}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formSection}>
          <Text style={styles.inputLabel}>Email or Mobile Number</Text>
          <View style={styles.inputContainer}>
            <Feather name="mail" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="e.g. name@domain.com or 9876543210"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
              value={emailOrMobile}
              onChangeText={setEmailOrMobile}
            />
          </View>

          <Text style={styles.inputLabel}>Password</Text>
          <View style={styles.inputContainer}>
            <Feather name="lock" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry={secureText}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
            />
            <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
              <Feather name={secureText ? "eye-off" : "eye"} size={16} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={styles.rememberMeRow}
            onPress={() => setRememberMe(!rememberMe)}
            activeOpacity={0.8}
          >
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe && <Feather name="check" size={12} color="#fafbfc" />}
            </View>
            <Text style={styles.rememberMeLabel}>Remember me for 30 days</Text>
          </TouchableOpacity>

          <CloudflareTurnstile
            onVerify={(token) => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
          />

          {loading ? (
            <ActivityIndicator size="large" color="#2dba4e" style={{ marginTop: 24 }} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.submitBtnMargin, styles.neonBorder]}
              onPress={handleLogin}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Log In</Text>
            </TouchableOpacity>
          )}

          <View style={styles.switchAuthRow}>
            <Text style={styles.switchAuthLabel}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Signup')}>
              <Text style={styles.switchAuthLink}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardScreen>
    </View>
  );
};

// ----------------------------------------------------
// 3. Signup Screen
// ----------------------------------------------------
export const SignupScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [turnstileToken, setTurnstileToken] = useState('');
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleSignup = async () => {
    if (!name.trim() || !email.trim() || !phone.trim() || !password || !confirmPassword) {
      setError('Please fill in all input fields');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }
    if (phone.trim().length < 10) {
      setError('Please enter a valid mobile number');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (Platform.OS === 'web' && !turnstileToken) {
      setError('Please complete the Cloudflare security verification');
      return;
    }

    setError('');
    setLoading(true);
    try {
      const result = await authService.signUp(name.trim(), email.trim(), phone.trim(), password, turnstileToken);
      if (!result.sessionConfirmed) {
        setRegisteredEmail(email.trim());
        setShowVerifyModal(true);
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <KeyboardScreen
        contentContainerStyle={[
          styles.formScrollContent,
          {
            paddingTop: insets.top + 20,
          }
        ]}
        showsVerticalScrollIndicator={false}
        keyboardDismissMode="on-drag"
      >
        <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.authHeaderSection}>
          <View style={[styles.logoBadgeSmall, { alignSelf: 'flex-start' }]}>
            <Image
              source={require('../../assets/icon.png')}
              style={styles.logoImageSmall}
            />
          </View>
          <Text style={styles.authHeaderTitle}>Create Account</Text>
          <Text style={styles.authHeaderDesc}>Start tracking and simulating offline wealth securely</Text>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
            <Feather name="alert-circle" size={16} color="#fafbfc" style={{ marginRight: 8 }} />
            <Text style={styles.errorTextInline}>{error}</Text>
          </View>
        ) : null}

        <View style={styles.formSection}>
          <Text style={styles.inputLabel}>Full Name</Text>
          <View style={styles.inputContainer}>
            <Feather name="user" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="e.g. John Doe"
              placeholderTextColor="#555"
              value={name}
              onChangeText={setName}
            />
          </View>

          <Text style={styles.inputLabel}>Email Address</Text>
          <View style={styles.inputContainer}>
            <Feather name="mail" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="e.g. name@domain.com"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <Text style={styles.inputLabel}>Mobile Number</Text>
          <View style={styles.inputContainer}>
            <Feather name="phone" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="e.g. 9876543210"
              placeholderTextColor="#555"
              autoCapitalize="none"
              keyboardType="phone-pad"
              value={phone}
              onChangeText={setPhone}
            />
          </View>

          <Text style={styles.inputLabel}>Password (Min 6 chars)</Text>
          <View style={styles.inputContainer}>
            <Feather name="lock" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry={secureText}
              autoCapitalize="none"
              value={password}
              onChangeText={setPassword}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
            />
            <TouchableOpacity onPress={() => setSecureText(!secureText)} style={styles.eyeBtn}>
              <Feather name={secureText ? "eye-off" : "eye"} size={16} color="#8E8E9F" />
            </TouchableOpacity>
          </View>

          <Text style={styles.inputLabel}>Confirm Password</Text>
          <View style={styles.inputContainer}>
            <Feather name="shield" size={16} color="#8E8E9F" style={styles.inputIcon} />
            <TextInput
              style={styles.formInput}
              placeholder="••••••••"
              placeholderTextColor="#555"
              secureTextEntry={secureText}
              autoCapitalize="none"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              onFocus={() => {
                setTimeout(() => {
                  scrollViewRef.current?.scrollToEnd({ animated: true });
                }, 120);
              }}
            />
          </View>

          <CloudflareTurnstile
            onVerify={(token) => {
              setTurnstileToken(token);
              setError('');
            }}
            onExpire={() => setTurnstileToken('')}
          />

          {loading ? (
            <ActivityIndicator size="large" color="#2dba4e" style={{ marginTop: 24 }} />
          ) : (
            <TouchableOpacity
              style={[styles.primaryBtn, styles.submitBtnMargin, styles.neonBorder]}
              onPress={handleSignup}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>Register</Text>
            </TouchableOpacity>
          )}

          <View style={styles.switchAuthRow}>
            <Text style={styles.switchAuthLabel}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.switchAuthLink}>Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardScreen>

      {/* Verify Email Modal Sheet */}
      <Modal
        visible={showVerifyModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        navigationBarTranslucent
        onRequestClose={() => {
          setShowVerifyModal(false);
          navigation.navigate('Login');
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Verify Your Email</Text>
              <TouchableOpacity
                onPress={() => {
                  setShowVerifyModal(false);
                  navigation.navigate('Login');
                }}
                style={styles.closeBtn}
              >
                <Feather name="x" size={20} color="#8E8E9F" />
              </TouchableOpacity>
            </View>

            <View style={{ alignItems: 'center', marginVertical: 20 }}>
              <View style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: 'rgba(45, 186, 78, 0.1)',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: 16
              }}>
                <Feather name="mail" size={30} color="#2dba4e" />
              </View>
              <Text style={[styles.modalSubtitle, { textAlign: 'center', paddingHorizontal: 10 }]}>
                We have sent a verification email to:
              </Text>
              <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15, marginVertical: 8 }}>
                {registeredEmail}
              </Text>
              <Text style={[styles.authHeaderDesc, { textAlign: 'center', paddingHorizontal: 15, marginTop: 4, lineHeight: 18 }]}>
                Please check your inbox (including your spam folder) and click the link to confirm your registration. Once confirmed, you can log in to your account.
              </Text>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { width: '100%', marginVertical: 10 }]}
              onPress={() => {
                setShowVerifyModal(false);
                navigation.navigate('Login');
              }}
            >
              <Text style={styles.primaryBtnText}>Back to Log In</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

// ----------------------------------------------------
// Styling
// ----------------------------------------------------
const getStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingHorizontal: 24,
    justifyContent: 'center',
    flexGrow: 1,
  },
  formScrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
    justifyContent: 'flex-start',
  },
  neonGlow: {
    position: 'absolute',
    top: -100,
    left: width * 0.15,
    width: width * 0.7,
    height: width * 0.7,
    borderRadius: (width * 0.7) / 2,
    backgroundColor: colors.isDark ? 'rgba(45, 186, 78, 0.08)' : 'rgba(45, 186, 78, 0.04)',
    filter: 'blur(80px)',
  },
  welcomeMainContent: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 28,
  },
  welcomeBranding: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
    marginTop: 20,
  },
  logoBadgeLuxury: {
    width: 84,
    height: 84,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
    padding: 8,
  },
  logoImageInside: {
    width: '100%',
    height: '100%',
  },
  logoBadge: {
    width: 64,
    height: 64,
    borderRadius: 20,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
    overflow: 'hidden',
  },
  logoImage: {
    width: '100%',
    height: '100%',
    borderRadius: 20,
  },
  logoBadgeSmall: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  logoImageSmall: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  welcomeHeaderSmall: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2dba4e',
    letterSpacing: 3,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  welcomeHeaderBig: {
    fontSize: 34,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
    textAlign: 'center',
  },
  welcomeSlogan: {
    fontSize: 15,
    color: colors.textSecondary,
    marginTop: 8,
    fontWeight: '500',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  actionsContainer: {
    width: '100%',
    marginBottom: 12,
  },
  primaryBtnLuxury: {
    backgroundColor: '#2dba4e',
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 14,
    elevation: 6,
  },
  primaryBtnLuxuryText: {
    color: '#0B0E14',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  secondaryBtnLuxury: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 28,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 6,
  },
  secondaryBtnLuxuryText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.4,
  },
  googleBtnLuxury: {
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 28,
    height: 54,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  googleBtnLuxuryText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
  linkedInGoogleContainer: {
    width: '100%',
    alignItems: 'center',
    marginVertical: 4,
  },
  linkedInGoogleCard: {
    width: '100%',
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: 24,
    paddingVertical: 12,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  linkedInAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    marginRight: 12,
    overflow: 'hidden',
  },
  linkedInAvatarImage: {
    width: 38,
    height: 38,
    borderRadius: 19,
  },
  linkedInAvatarFallback: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#10B981',
    alignItems: 'center',
    justifyContent: 'center',
  },
  linkedInAvatarInitial: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 16,
  },
  linkedInMeta: {
    flex: 1,
    justifyContent: 'center',
  },
  linkedInNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  linkedInContinueText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    flexShrink: 1,
  },
  lastUsedBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.18)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 8,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.35)',
  },
  lastUsedBadgeText: {
    color: '#10B981',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  linkedInEmailText: {
    color: '#8E8E9F',
    fontSize: 12,
    marginTop: 2,
  },
  googleIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  switchAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  switchAccountBtnText: {
    color: '#10B981',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  legalNotice: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 18,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginVertical: 6,
  },
  primaryBtnText: {
    color: colors.buttonSecondaryText,
    fontSize: 15,
    fontWeight: '800',
  },
  neonBorder: {
    shadowColor: colors.accent,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  secondaryBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    marginVertical: 6,
  },
  secondaryBtnText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 18,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.border,
  },
  dividerText: {
    color: colors.textTertiary,
    fontSize: 11,
    fontWeight: '700',
    marginHorizontal: 12,
  },
  googleBtn: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
  },
  googleBtnText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    marginBottom: 24,
  },
  authHeaderSection: {
    marginBottom: 28,
  },
  authHeaderTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.text,
  },
  authHeaderDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 6,
    lineHeight: 20,
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
  },
  errorTextInline: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  formSection: {
    width: '100%',
  },
  inputLabel: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 8,
    marginTop: 14,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 48,
    paddingHorizontal: 12,
    marginBottom: 6,
  },
  inputIcon: {
    marginRight: 10,
  },
  formInput: {
    flex: 1,
    color: colors.text,
    fontSize: 14,
  },
  eyeBtn: {
    padding: 6,
  },
  submitBtnMargin: {
    marginTop: 28,
    marginBottom: 16,
  },
  switchAuthRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginVertical: 10,
  },
  switchAuthLabel: {
    color: colors.textSecondary,
    fontSize: 13,
  },
  switchAuthLink: {
    color: colors.accent,
    fontSize: 13,
    fontWeight: '700',
  },
  // Modal Styles
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
    maxHeight: '90%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.text,
  },
  closeBtn: {
    padding: 6,
  },
  modalSubtitle: {
    color: colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 20,
  },
  googleAccountItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 14,
    padding: 12,
    marginVertical: 6,
  },
  googleAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: colors.accent,
    fontWeight: '800',
    fontSize: 15,
  },
  googleMeta: {
    flex: 1,
  },
  googleName: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  googleEmail: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
  },
  customGoogleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: colors.accentMuted,
    borderRadius: 14,
    backgroundColor: colors.accentMuted,
  },
  customGoogleBtnText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 13,
  },
  input: {
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
  buttonRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  cancelBtn: {
    width: '45%',
    backgroundColor: colors.inputBackground,
    borderWidth: 1,
    borderColor: colors.inputBorder,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
  },
  submitGoogleBtn: {
    width: '50%',
    backgroundColor: colors.accent,
    borderRadius: 12,
    height: 46,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitGoogleBtnText: {
    color: colors.buttonSecondaryText,
    fontWeight: '800',
    fontSize: 14,
  },
  errorText: {
    color: '#FF5252',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  rememberMeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    marginBottom: 12,
    alignSelf: 'flex-start',
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.border,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    backgroundColor: 'transparent',
  },
  checkboxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rememberMeLabel: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: '500',
  },
});
