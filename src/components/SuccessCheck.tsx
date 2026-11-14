import React, { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

const AnimatedPath = Animated.createAnimatedComponent(Path);

// Tick on a 24×24 grid; its length (~13.2) is rounded up so the dash fully hides it.
const CHECK_PATH = 'M6.5 12.5l3.6 3.6L17.6 8.6';
const CHECK_LENGTH = 14;

interface SuccessCheckProps {
  size?: number;
  circleColor: string;
  checkColor: string;
}

/**
 * Calm "payment done" style confirmation: the disc eases in (no bounce),
 * then the tick draws itself in one stroke.
 */
export const SuccessCheck: React.FC<SuccessCheckProps> = ({ size = 88, circleColor, checkColor }) => {
  const reduceMotion = useReducedMotion();
  const disc = useSharedValue(reduceMotion ? 1 : 0);
  const draw = useSharedValue(reduceMotion ? 1 : 0);

  useEffect(() => {
    if (reduceMotion) return;
    disc.value = withTiming(1, { duration: 320, easing: Easing.out(Easing.cubic) });
    draw.value = withDelay(200, withTiming(1, { duration: 380, easing: Easing.out(Easing.cubic) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduceMotion]);

  const discStyle = useAnimatedStyle(() => ({
    opacity: disc.value,
    transform: [{ scale: 0.9 + disc.value * 0.1 }],
  }));

  const checkProps = useAnimatedProps(() => ({
    strokeDashoffset: CHECK_LENGTH * (1 - draw.value),
  }));

  return (
    <Animated.View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: circleColor,
          alignItems: 'center',
          justifyContent: 'center',
        },
        discStyle,
      ]}
    >
      <Svg width={size * 0.5} height={size * 0.5} viewBox="0 0 24 24" fill="none">
        <AnimatedPath
          d={CHECK_PATH}
          stroke={checkColor}
          strokeWidth={2.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={CHECK_LENGTH}
          animatedProps={checkProps}
        />
      </Svg>
    </Animated.View>
  );
};

export default SuccessCheck;
