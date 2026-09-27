import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  Image,
  TouchableOpacity,
  FlatList,
  Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Feather } from '@expo/vector-icons';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { mmkvStorage } from '../db/mmkv';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface OnboardingSlide {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  description: string;
  image: any;
}

const SLIDES: OnboardingSlide[] = [
  {
    id: '1',
    tag: 'EFFORTLESS CLARITY',
    title: 'Smart Expense &\nCashflow Tracking',
    subtitle: 'Automated Financial Intelligence',
    description:
      'Gain instant clarity on where every rupee goes. Automatic transaction ingestion with zero manual spreadsheets.',
    image: require('../../assets/onboard.1.png'),
  },
  {
    id: '2',
    tag: '100% PRIVATE',
    title: 'Your Financial Data\nStays Yours',
    subtitle: 'Zero Cloud Storage For Personal Data',
    description:
      'Encrypted and stored 100% locally on your device with biometric locking. No data selling, zero tracking.',
    image: require('../../assets/onboard.2.png'),
  },
  {
    id: '3',
    tag: 'BUILD WEALTH',
    title: 'Achieve Your Life\nFinancial Goals',
    subtitle: 'Simulate, Forecast & Prosper',
    description:
      'Set ambitious goals, simulate investments, and build true financial freedom with clear, actionable insights.',
    image: require('../../assets/onboard.3.png'),
  },
];

interface OnboardingScreenProps {
  navigation: any;
}

export const OnboardingScreen: React.FC<OnboardingScreenProps> = ({ navigation }) => {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef<FlatList>(null);

  const handleFinishOnboarding = () => {
    try {
      mmkvStorage.setBoolean('has_seen_onboarding_v1', true);
    } catch (e) {
      // Continue without crashing
    }
    navigation.replace('Welcome');
  };

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) {
      flatListRef.current?.scrollToIndex({
        index: currentIndex + 1,
        animated: true,
      });
    } else {
      handleFinishOnboarding();
    }
  };

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems && viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const isLastSlide = currentIndex === SLIDES.length - 1;

  const renderSlide = ({ item }: { item: OnboardingSlide }) => {
    return (
      <View style={[styles.slideContainer, { width: SCREEN_WIDTH }]}>
        {/* Ambient Emerald Halo Glow */}
        <View style={styles.ambientGlow} />

        {/* 3D Illustration Container */}
        <View style={styles.illustrationWrapper}>
          <Image source={item.image} style={styles.illustration} resizeMode="contain" />
        </View>

        {/* Text Content */}
        <View style={styles.textContainer}>
          <View style={styles.tagBadge}>
            <View style={styles.tagDot} />
            <Text style={styles.tagText}>{item.tag}</Text>
          </View>

          <Text style={styles.titleText}>{item.title}</Text>
          <Text style={styles.descriptionText}>{item.description}</Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
      <StatusBar barStyle="light-content" backgroundColor="#0B0E14" />

      {/* Top Header: Brand emblem & Skip Button */}
      <View style={styles.topHeader}>
        <View style={styles.headerBrand}>
          <Image
            source={require('../../assets/insideicon.png')}
            style={styles.headerLogo}
            resizeMode="contain"
          />
          <Text style={styles.headerBrandText}>REGENT MONEY</Text>
        </View>

        <TouchableOpacity
          onPress={handleFinishOnboarding}
          style={styles.skipButton}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.skipText}>Skip</Text>
          <Feather name="chevron-right" size={16} color="#8E8E9F" />
        </TouchableOpacity>
      </View>

      {/* Slides Horizontal Carousel */}
      <FlatList
        ref={flatListRef}
        data={SLIDES}
        renderItem={renderSlide}
        keyExtractor={(item) => item.id}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        bounces={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewConfig}
        style={styles.carousel}
      />

      {/* Bottom Control Bar */}
      <View style={styles.bottomBar}>
        {/* Pagination Indicator (Pill & Dots) */}
        <View style={styles.paginationRow}>
          {SLIDES.map((_, index) => {
            const isActive = index === currentIndex;
            return (
              <View
                key={index}
                style={[
                  styles.dot,
                  isActive ? styles.activePill : styles.inactiveDot,
                ]}
              />
            );
          })}
        </View>

        {/* Action Button: Next or Get Started */}
        {isLastSlide ? (
          <TouchableOpacity
            style={styles.getStartedButton}
            onPress={handleFinishOnboarding}
            activeOpacity={0.85}
          >
            <Text style={styles.getStartedText}>Get Started</Text>
            <View style={styles.btnIconCircle}>
              <Feather name="arrow-right" size={18} color="#0B0E14" />
            </View>
          </TouchableOpacity>
        ) : (
          <View style={styles.navRow}>
            <TouchableOpacity
              style={styles.nextButton}
              onPress={handleNext}
              activeOpacity={0.85}
            >
              <Text style={styles.nextButtonText}>Next</Text>
              <Feather name="arrow-right" size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0B0E14',
    justifyContent: 'space-between',
  },
  topHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
    paddingTop: 8,
    paddingBottom: 4,
    zIndex: 10,
  },
  headerBrand: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerLogo: {
    width: 26,
    height: 26,
    borderRadius: 7,
    marginRight: 8,
  },
  headerBrandText: {
    color: '#E6EDF3',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  skipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  skipText: {
    color: '#8E8E9F',
    fontSize: 13,
    fontWeight: '600',
    marginRight: 2,
  },
  carousel: {
    flex: 1,
  },
  slideContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  ambientGlow: {
    position: 'absolute',
    top: '18%',
    width: SCREEN_WIDTH * 0.75,
    height: SCREEN_WIDTH * 0.75,
    borderRadius: (SCREEN_WIDTH * 0.75) / 2,
    backgroundColor: 'rgba(45, 186, 78, 0.12)',
    ...(Platform.OS === 'web'
      ? { filter: 'blur(70px)' }
      : {}),
  },
  illustrationWrapper: {
    width: Math.min(SCREEN_WIDTH * 0.85, 340),
    height: Math.min(SCREEN_HEIGHT * 0.42, 340),
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  illustration: {
    width: '100%',
    height: '100%',
  },
  textContainer: {
    alignItems: 'center',
    maxWidth: 340,
    marginTop: 4,
  },
  tagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(45, 186, 78, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(45, 186, 78, 0.25)',
    marginBottom: 14,
  },
  tagDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#2dba4e',
    marginRight: 6,
  },
  tagText: {
    color: '#2dba4e',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 33,
    letterSpacing: -0.3,
    marginBottom: 12,
  },
  descriptionText: {
    color: '#94A3B8',
    fontSize: 14,
    fontWeight: '400',
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 8,
  },
  bottomBar: {
    paddingHorizontal: 28,
    paddingBottom: 24,
    paddingTop: 12,
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 22,
  },
  dot: {
    height: 6,
    borderRadius: 3,
    marginHorizontal: 4,
  },
  inactiveDot: {
    width: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  activePill: {
    width: 24,
    backgroundColor: '#2dba4e',
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  nextButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#161B22',
    borderWidth: 1,
    borderColor: 'rgba(45, 186, 78, 0.5)',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 28,
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 3,
  },
  nextButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  getStartedButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2dba4e',
    paddingVertical: 15,
    paddingHorizontal: 24,
    borderRadius: 30,
    shadowColor: '#2dba4e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  getStartedText: {
    color: '#0B0E14',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.8,
    marginRight: 10,
    textTransform: 'uppercase',
  },
  btnIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
