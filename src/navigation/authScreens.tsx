import React, { useState } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TextInput, 
  TouchableOpacity, 
  ScrollView, 
  ActivityIndicator, 
  Platform, 
  KeyboardAvoidingView, 
  Modal,
  Dimensions,
  Image
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather, Ionicons } from '@expo/vector-icons';
import { authService } from '../services/authService';
import { getGoogleWebClientId } from '../services/supabaseClient';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useTheme } from '../store';
import { StatusBar } from 'expo-status-bar';

const { width } = Dimensions.get('window');

// ----------------------------------------------------
// Mock Google Accounts Chooser Overlay
// ----------------------------------------------------
interface GoogleAccount {
  name: string;
  email: string;
  avatarUrl: string;
}

const MOCK_GOOGLE_ACCOUNTS: GoogleAccount[] = [
  { name: 'Alex Rivera', email: 'alex.rivera@gmail.com', avatarUrl: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80' },
  { name: 'Priya Sharma', email: 'priya.sharma@gmail.com', avatarUrl: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80' },
  { name: 'Marcus Chen', email: 'marcus.chen@gmail.com', avatarUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80' }
];

interface GoogleModalProps {
  visible: boolean;
  onClose: () => void;
  onSelectAccount: (account: GoogleAccount) => void;
}

const GoogleAccountModal = ({ visible, onClose, onSelectAccount }: GoogleModalProps) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const [customName, setCustomName] = useState('');
  const [customEmail, setCustomEmail] = useState('');
  const [customMode, setCustomMode] = useState(false);
  const [error, setError] = useState('');

  const handleCustomSubmit = () => {
    if (!customName.trim() || !customEmail.trim()) {
      setError('Please fill in both Name and Email');
      return;
    }
    if (!customEmail.includes('@') || !customEmail.includes('.')) {
      setError('Please enter a valid Google Email address');
      return;
    }
    
    setError('');
    onSelectAccount({
      name: customName.trim(),
      email: customEmail.trim().toLowerCase(),
      avatarUrl: `https://ui-avatars.com/api/?name=${encodeURIComponent(customName)}&background=2dba4e&color=24292e&bold=true`
    });
    // Reset state
    setCustomName('');
    setCustomEmail('');
    setCustomMode(false);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Sign in with Google</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Feather name="x" size={20} color="#8E8E9F" />
            </TouchableOpacity>
          </View>
          
          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          {!customMode ? (
            <View>
              <Text style={styles.modalSubtitle}>Choose an account to continue to Regent Money</Text>
              
              {MOCK_GOOGLE_ACCOUNTS.map((acc, index) => (
                <TouchableOpacity 
                  key={index} 
                  style={styles.googleAccountItem} 
                  onPress={() => onSelectAccount(acc)}
                  activeOpacity={0.7}
                >
                  <View style={styles.googleAvatar}>
                    <Text style={styles.avatarText}>{acc.name.charAt(0)}</Text>
                  </View>
                  <View style={styles.googleMeta}>
                    <Text style={styles.googleName}>{acc.name}</Text>
                    <Text style={styles.googleEmail}>{acc.email}</Text>
                  </View>
                  <Feather name="chevron-right" size={16} color="#8E8E9F" />
                </TouchableOpacity>
              ))}

              <TouchableOpacity 
                style={styles.customGoogleBtn} 
                onPress={() => setCustomMode(true)}
                activeOpacity={0.7}
              >
                <Feather name="plus-circle" size={18} color="#03DAC6" style={{ marginRight: 8 }} />
                <Text style={styles.customGoogleBtnText}>Use another Google Account</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <Text style={styles.modalSubtitle}>Enter details to simulate custom Google OAuth</Text>
              
              <Text style={styles.inputLabel}>Full Name</Text>
              <TextInput 
                style={styles.input}
                placeholder="Google Account Name (e.g. John Doe)"
                placeholderTextColor="#666"
                value={customName}
                onChangeText={setCustomName}
              />

              <Text style={styles.inputLabel}>Google Email</Text>
              <TextInput 
                style={styles.input}
                placeholder="Google Email (e.g. john.doe@gmail.com)"
                placeholderTextColor="#666"
                keyboardType="email-address"
                autoCapitalize="none"
                value={customEmail}
                onChangeText={setCustomEmail}
              />

              <View style={styles.buttonRow}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setCustomMode(false)}>
                  <Text style={styles.cancelBtnText}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.submitGoogleBtn} onPress={handleCustomSubmit}>
                  <Text style={styles.submitGoogleBtnText}>Authorize</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

// ----------------------------------------------------
// 1. Welcome Screen
// ----------------------------------------------------
export const WelcomeScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const [googleVisible, setGoogleVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleGooglePress = async () => {
    const webClientId = getGoogleWebClientId();
    if (Platform.OS !== 'web' && webClientId) {
      setLoading(true);
      try {
        await authService.signInWithGoogleNative();
      } catch (e: any) {
        if (e.message?.includes('developer error') || e.code === 'DEVELOPER_ERROR') {
          alert('Google Sign-In Developer Error: This usually means your Google Web Client ID is mismatching, or your SHA-1 fingerprint is not configured in the Google Cloud Console for Android Package Name (com.anonymous.regentmoney). Please check settings.');
        } else if (e.code === 'SIGN_IN_CANCELLED' || e.message?.includes('cancelled')) {
          console.log('[Auth] Google Sign-In cancelled.');
        } else {
          alert('Native Google Sign-In failed: ' + e.message);
        }
      } finally {
        setLoading(false);
      }
    } else {
      let warningMsg = 'Google Web Client ID is not configured in Settings. ';
      if (Platform.OS === 'web') {
        warningMsg = 'Native Google Sign-In is not supported on Web. ';
      }
      alert(warningMsg + 'Launching simulated Google accounts chooser.');
      setGoogleVisible(true);
    }
  };

  const handleGoogleSelect = async (account: GoogleAccount) => {
    setGoogleVisible(false);
    setLoading(true);
    try {
      await authService.signUpOrLogInGoogle(account.name, account.email, account.avatarUrl);
    } catch (e: any) {
      alert('Simulated Google Auth failed: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Glow Element */}
        <View style={styles.neonGlow} />

        {/* Branding Title */}
        <Animated.View entering={FadeIn.delay(100).duration(800)} style={styles.welcomeBranding}>
          <View style={styles.logoBadge}>
            <Image 
              source={require('../../assets/icon.png')} 
              style={styles.logoImage}
            />
          </View>
          <Text style={styles.welcomeHeaderSmall}>REGENT</Text>
          <Text style={styles.welcomeHeaderBig}>MONEY</Text>
          <Text style={styles.welcomeSlogan}>Next-Gen Smart Expense Manager</Text>
        </Animated.View>

        {/* Features Preview */}
        <Animated.View entering={FadeInDown.delay(300).duration(800)} style={styles.featuresList}>
          <View style={styles.featureItem}>
            <Feather name="shield" size={18} color="#2dba4e" style={styles.featureIcon} />
            <View>
              <Text style={styles.featureTitle}>100% Offline Database</Text>
              <Text style={styles.featureDesc}>All transaction ingestion, SMS reading & analysis stays local.</Text>
            </View>
          </View>
          <View style={styles.featureItem}>
            <Feather name="cpu" size={18} color="#2dba4e" style={styles.featureIcon} />
            <View>
              <Text style={styles.featureTitle}>Private AI Insights</Text>
              <Text style={styles.featureDesc}>Sanitizes your financial context before checking local models.</Text>
            </View>
          </View>
        </Animated.View>

        {/* Interaction Actions */}
        <Animated.View entering={FadeInDown.delay(500).duration(800)} style={styles.actionsContainer}>
          {loading ? (
            <ActivityIndicator size="large" color="#2dba4e" style={{ marginVertical: 24 }} />
          ) : (
            <>
              <TouchableOpacity 
                style={[styles.primaryBtn, styles.neonBorder]} 
                onPress={() => navigation.navigate('Login')}
                activeOpacity={0.8}
              >
                <Text style={styles.primaryBtnText}>Sign In</Text>
              </TouchableOpacity>


              <View style={styles.dividerRow}>
                <View style={styles.dividerLine} />
                <Text style={styles.dividerText}>OR</Text>
                <View style={styles.dividerLine} />
              </View>

              <TouchableOpacity 
                style={styles.googleBtn} 
                onPress={handleGooglePress}
                activeOpacity={0.8}
              >
                <Ionicons name="logo-google" size={18} color="#FFF" style={{ marginRight: 10 }} />
                <Text style={styles.googleBtnText}>Continue with Google</Text>
              </TouchableOpacity>
            </>
          )}
        </Animated.View>
      </ScrollView>

      <GoogleAccountModal 
        visible={googleVisible} 
        onClose={() => setGoogleVisible(false)} 
        onSelectAccount={handleGoogleSelect} 
      />
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
  const [emailOrMobile, setEmailOrMobile] = useState('');
  const [password, setPassword] = useState('');
  const [secureText, setSecureText] = useState(true);
  const [rememberMe, setRememberMe] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    if (!emailOrMobile.trim() || !password) {
      setError('Please enter both Email/Mobile and Password');
      return;
    }
    setError('');
    setLoading(true);
    try {
      await authService.logIn(emailOrMobile, password, rememberMe);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
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
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

// ----------------------------------------------------
// 3. Signup Screen
// ----------------------------------------------------
export const SignupScreen = ({ navigation }: { navigation: any }) => {
  const { colors } = useTheme();
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [secureText, setSecureText] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
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
    
    setError('');
    setLoading(true);
    try {
      const result = await authService.signUp(name.trim(), email.trim(), phone.trim(), password);
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
    <KeyboardAvoidingView 
      behavior={Platform.OS === 'ios' ? 'padding' : undefined} 
      style={styles.container}
    >
      <ScrollView 
        contentContainerStyle={[styles.scrollContent, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20 }]}
        showsVerticalScrollIndicator={false}
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
            />
          </View>

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
      </ScrollView>

      {/* Verify Email Modal Sheet */}
      <Modal
        visible={showVerifyModal}
        transparent
        animationType="fade"
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
    </KeyboardAvoidingView>
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
  welcomeBranding: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 40,
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
    fontSize: 14,
    fontWeight: '800',
    color: colors.accent,
    letterSpacing: 4,
  },
  welcomeHeaderBig: {
    fontSize: 42,
    fontWeight: '900',
    color: colors.text,
    letterSpacing: 2,
    marginTop: 4,
  },
  welcomeSlogan: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 8,
    fontWeight: '500',
  },
  featuresList: {
    backgroundColor: colors.card,
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: colors.border,
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 8,
  },
  featureIcon: {
    marginRight: 14,
    marginTop: 2,
  },
  featureTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.text,
  },
  featureDesc: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 2,
    lineHeight: 18,
    paddingRight: 16,
  },
  actionsContainer: {
    width: '100%',
    marginBottom: 20,
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
