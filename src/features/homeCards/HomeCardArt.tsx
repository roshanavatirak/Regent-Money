import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path, Circle, Rect, G, Text as SvgText } from 'react-native-svg';
import type { ArtKey } from './schema';
import type { CardTheme } from './themes';

/** Four-point sparkle centred on (cx, cy). */
const sparkle = (cx: number, cy: number, r: number) =>
  `M${cx} ${cy - r} Q${cx} ${cy} ${cx + r} ${cy} Q${cx} ${cy} ${cx} ${cy + r} Q${cx} ${cy} ${cx - r} ${cy} Q${cx} ${cy} ${cx} ${cy - r} Z`;

const W = '#FFFFFF';

/** Just the drawing, 0–100 viewBox, in the card's own colours. */
export function ArtGlyph({ kind, theme, size = 104 }: { kind: ArtKey; theme: CardTheme; size?: number }) {
  const { fg, ring, ring2 } = theme;
  const rupee = (x: number, y: number, fs: number) => (
    <SvgText x={x} y={y} fontSize={fs} fontWeight="800" fill={fg} textAnchor="middle">
      ₹
    </SvgText>
  );
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100">
      {kind === 'bank' && (
        <G>
          <Path d="M18 42 L52 20 L86 42 Z" fill={fg} />
          <Rect x={20} y={42} width={64} height={6} rx={2} fill={fg} />
          {[26, 41, 56, 71].map((x) => (
            <Rect key={x} x={x} y={51} width={7} height={24} rx={2} fill={W} stroke={fg} strokeWidth={2.5} />
          ))}
          <Rect x={16} y={76} width={72} height={8} rx={3} fill={fg} />
          <Circle cx={52} cy={33} r={4} fill={ring2} />
          <Circle cx={84} cy={22} r={12} fill={ring2} stroke={fg} strokeWidth={2.5} />
          {rupee(84, 27.5, 15)}
        </G>
      )}
      {kind === 'overspend' && (
        <G>
          <Rect x={14} y={42} width={62} height={44} rx={10} fill={fg} />
          <Rect x={52} y={54} width={28} height={20} rx={6} fill={ring2} stroke={fg} strokeWidth={2.5} />
          <Circle cx={63} cy={64} r={3.5} fill={fg} />
          <Path d="M24 42 L34 30 L58 42" fill="none" stroke={fg} strokeWidth={3} strokeLinejoin="round" />
          <Circle cx={66} cy={24} r={10} fill={W} stroke={fg} strokeWidth={2.5} />
          {rupee(66, 28.5, 12)}
          <Circle cx={86} cy={12} r={7} fill={W} stroke={fg} strokeWidth={2.5} />
          <Path d="M50 20 l-6 -4 M54 12 l-2 -7 M80 34 l7 3" stroke={fg} strokeWidth={2.5} strokeLinecap="round" />
        </G>
      )}
      {kind === 'kept' && (
        <G>
          <Rect x={16} y={62} width={14} height={22} rx={4} fill={fg} />
          <Rect x={36} y={50} width={14} height={34} rx={4} fill={fg} />
          <Rect x={56} y={38} width={14} height={46} rx={4} fill={W} stroke={fg} strokeWidth={2.5} />
          <Path d="M14 50 L36 34 L50 40 L80 14" fill="none" stroke={fg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <Path d="M68 13 L81 13 L81 26" fill="none" stroke={fg} strokeWidth={4} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={sparkle(86, 46, 8)} fill={W} stroke={fg} strokeWidth={2} />
          <Path d={sparkle(22, 26, 5)} fill={fg} />
        </G>
      )}
      {kind === 'sms' && (
        <G>
          <Rect x={24} y={10} width={42} height={78} rx={10} fill={fg} />
          <Rect x={28.5} y={18} width={33} height={60} rx={5} fill={W} />
          <Rect x={33} y={25} width={22} height={9} rx={4.5} fill={ring} />
          <Rect x={33} y={38} width={16} height={9} rx={4.5} fill={ring} />
          <Rect x={40} y={52} width={50} height={24} rx={12} fill={ring2} stroke={fg} strokeWidth={2.5} />
          <Circle cx={53} cy={64} r={7} fill={fg} />
          <Path d="M49.5 64 l2.5 2.5 l4.5 -5" fill="none" stroke={W} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          {rupee(74, 69, 13)}
          <Path d={sparkle(84, 32, 8)} fill={W} stroke={fg} strokeWidth={2} />
        </G>
      )}
      {kind === 'cash' && (
        <G>
          <Rect x={12} y={40} width={62} height={36} rx={7} fill={fg} transform="rotate(-10 43 58)" />
          <Rect x={26} y={30} width={62} height={36} rx={7} fill={W} stroke={fg} strokeWidth={2.5} />
          <Circle cx={57} cy={48} r={10} fill={ring2} stroke={fg} strokeWidth={2.5} />
          {rupee(57, 53, 13)}
          <Circle cx={34} cy={48} r={2.5} fill={fg} />
          <Circle cx={80} cy={48} r={2.5} fill={fg} />
          <Path d={sparkle(86, 18, 7)} fill={fg} />
        </G>
      )}
      {kind === 'regent' && (
        <G>
          <Rect x={10} y={30} width={62} height={44} rx={16} fill={fg} />
          <Path d="M24 70 L20 86 L40 72 Z" fill={fg} />
          {[28, 41, 54].map((x) => (
            <Circle key={x} cx={x} cy={52} r={4.5} fill={W} />
          ))}
          <Path d={sparkle(80, 24, 14)} fill={ring2} stroke={fg} strokeWidth={2.5} strokeLinejoin="round" />
          <Path d={sparkle(90, 50, 6)} fill={W} stroke={fg} strokeWidth={2} />
          <Path d={sparkle(62, 12, 4)} fill={fg} />
        </G>
      )}
      {kind === 'budget' && (
        <G>
          <Circle cx={44} cy={56} r={30} fill={fg} />
          <Path d="M44 56 L44 26 A30 30 0 0 1 73 63 Z" fill={W} stroke={fg} strokeWidth={2.5} strokeLinejoin="round" />
          <Circle cx={44} cy={56} r={11} fill={ring2} stroke={fg} strokeWidth={2.5} />
          <Rect x={70} y={14} width={24} height={14} rx={7} fill={ring2} stroke={fg} strokeWidth={2.5} />
          {rupee(82, 25, 10)}
          <Path d={sparkle(86, 46, 7)} fill={W} stroke={fg} strokeWidth={2} />
        </G>
      )}
      {kind === 'goal' && (
        <G>
          <Circle cx={44} cy={56} r={30} fill={fg} />
          <Circle cx={44} cy={56} r={21} fill={W} />
          <Circle cx={44} cy={56} r={13} fill={fg} />
          <Circle cx={44} cy={56} r={5} fill={ring2} />
          <Path d="M44 56 L80 20" stroke={fg} strokeWidth={4} strokeLinecap="round" />
          <Path d="M72 14 L82 18 L86 28" fill="none" stroke={fg} strokeWidth={3.5} strokeLinecap="round" strokeLinejoin="round" />
          <Path d={sparkle(20, 22, 6)} fill={W} stroke={fg} strokeWidth={2} />
          <Path d={sparkle(86, 58, 5)} fill={fg} />
        </G>
      )}
      {kind === 'bills' && (
        <G>
          <Rect x={16} y={24} width={58} height={58} rx={10} fill={W} stroke={fg} strokeWidth={2.5} />
          <Path d="M16 34 a10 10 0 0 1 10 -10 h38 a10 10 0 0 1 10 10 v8 h-58 Z" fill={fg} />
          <Rect x={28} y={16} width={5} height={14} rx={2.5} fill={fg} />
          <Rect x={57} y={16} width={5} height={14} rx={2.5} fill={fg} />
          {[
            [28, 52],
            [41, 52],
            [54, 52],
            [28, 65],
            [41, 65],
          ].map(([x, y]) => (
            <Rect key={`${x}-${y}`} x={x} y={y} width={8} height={8} rx={2} fill={ring} />
          ))}
          <Rect x={54} y={65} width={8} height={8} rx={2} fill={fg} />
          <Circle cx={78} cy={72} r={13} fill={ring2} stroke={fg} strokeWidth={2.5} />
          <SvgText x={78} y={77} fontSize={14} fontWeight="800" fill={fg} textAnchor="middle">
            !
          </SvgText>
        </G>
      )}
      {kind === 'refer' && (
        <G>
          <Rect x={20} y={46} width={58} height={38} rx={6} fill={fg} />
          <Rect x={15} y={34} width={68} height={15} rx={5} fill={W} stroke={fg} strokeWidth={2.5} />
          <Rect x={44} y={34} width={10} height={50} rx={2} fill={ring2} stroke={fg} strokeWidth={2.5} />
          <Path d="M49 34 C 40 20, 26 24, 34 34" fill="none" stroke={fg} strokeWidth={3} strokeLinecap="round" />
          <Path d="M49 34 C 58 20, 72 24, 64 34" fill="none" stroke={fg} strokeWidth={3} strokeLinecap="round" />
          <Circle cx={84} cy={18} r={11} fill={W} stroke={fg} strokeWidth={2.5} />
          {rupee(84, 22.5, 12)}
          <Path d={sparkle(14, 20, 6)} fill={fg} />
        </G>
      )}
    </Svg>
  );
}

/** Illustration with its two background blobs, placed in the card's bottom-right corner. */
export function HomeCardArt({ kind, theme }: { kind: ArtKey; theme: CardTheme }) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={[styles.blob, { backgroundColor: theme.ring }]} />
      <View style={[styles.blobSmall, { backgroundColor: theme.ring2 }]} />
      <ArtGlyph kind={kind} theme={theme} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 4, bottom: 6, width: 108, height: 108, alignItems: 'center', justifyContent: 'center' },
  blob: { position: 'absolute', width: 120, height: 120, borderRadius: 60, right: -26, bottom: -34, opacity: 0.85 },
  blobSmall: { position: 'absolute', width: 46, height: 46, borderRadius: 23, left: -4, top: -2, opacity: 0.7 },
});
