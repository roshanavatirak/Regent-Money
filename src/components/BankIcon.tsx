import React, { useState } from 'react';
import { View, Image, Platform, StyleProp, ViewStyle } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Canvas, ImageSVG, useSVG, Group } from '@shopify/react-native-skia';
import { resolveBankCode } from '../constants/bankBrand';

export const LOCAL_SVG_MAP: { [key: string]: any } = {
  'BARB': require('../../assets/Banks logo/bob.svg'),
  'BKID': require('../../assets/Banks logo/boi.svg'),
  'CNRB': require('../../assets/Banks logo/cnrb.svg'),
  'HDFC': require('../../assets/Banks logo/hdfc.svg'),
  'ICIC': require('../../assets/Banks logo/icic.svg'),
  'IDFB': require('../../assets/Banks logo/idfc.svg'),
  'IDIB': require('../../assets/Banks logo/idib.svg'),
  'JIOP': require('../../assets/Banks logo/jiop.svg'),
  'KKBK': require('../../assets/Banks logo/kkbk.svg'),
  'MAHB': require('../../assets/Banks logo/mahb.svg'),
  'PUNB': require('../../assets/Banks logo/punb.svg'),
  'SBIN': require('../../assets/Banks logo/sbi.svg'),
  'UBIN': require('../../assets/Banks logo/ubin.svg'),
  'UTIB': require('../../assets/Banks logo/axis.svg'),
  'YESB': require('../../assets/Banks logo/yesb.svg'),
};

export { resolveBankCode };

const NativeSvgIcon = ({ source, size }: { source: any; size: number }) => {
  const svg = useSVG(source);
  if (!svg) {
    return <View style={{ width: size * 0.75, height: size * 0.75 }} />;
  }

  const targetSize = size * 0.75;
  const svgWidth = svg.width() > 0 ? svg.width() : targetSize;
  const svgHeight = svg.height() > 0 ? svg.height() : targetSize;

  const scale = Math.min(targetSize / svgWidth, targetSize / svgHeight);
  const dx = (targetSize - svgWidth * scale) / 2;
  const dy = (targetSize - svgHeight * scale) / 2;

  return (
    <Canvas style={{ width: targetSize, height: targetSize }}>
      <Group transform={[{ translateX: dx }, { translateY: dy }, { scale: scale }]}>
        <ImageSVG
          svg={svg}
          x={0}
          y={0}
          width={svgWidth}
          height={svgHeight}
        />
      </Group>
    </Canvas>
  );
};

const WebSvgIcon = ({ source, size }: { source: any; size: number }) => {
  const [hasError, setHasError] = useState(false);
  const targetSize = size * 0.75;

  if (hasError) {
    return (
      <View style={{ width: targetSize, height: targetSize, alignItems: 'center', justifyContent: 'center' }}>
        <MaterialCommunityIcons name="bank" size={size * 0.55} color="#2dba4e" />
      </View>
    );
  }

  const imageSource = typeof source === 'string' ? { uri: source } : (source?.default || source);

  return (
    <Image
      source={imageSource}
      style={{ width: targetSize, height: targetSize }}
      resizeMode="contain"
      onError={() => setHasError(true)}
    />
  );
};

const LocalSvgIcon = ({ source, size }: { source: any; size: number }) => {
  if (Platform.OS === 'web') {
    return <WebSvgIcon source={source} size={size} />;
  }
  return <NativeSvgIcon source={source} size={size} />;
};

export const BankIcon = ({
  code,
  name,
  size = 40,
  style,
}: {
  code: string;
  name: string;
  size?: number;
  style?: StyleProp<ViewStyle>;
}) => {
  // The cash wallet is stored as an account named "Cash": show a cash icon, not a bank.
  if (code === 'CASH' || (name || '').trim().toLowerCase() === 'cash') {
    return (
      <View
        style={[
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            backgroundColor: '#E3F2E8',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          },
          style,
        ]}
      >
        <MaterialCommunityIcons name="cash" size={Math.round(size * 0.58)} color="#0B3D2C" />
      </View>
    );
  }

  const resolved = resolveBankCode(name, undefined, code);
  const localSource = LOCAL_SVG_MAP[resolved];

  const baseStyle: ViewStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  };

  if (localSource) {
    return (
      <View style={[baseStyle, style]}>
        <LocalSvgIcon source={localSource} size={size} />
      </View>
    );
  }

  // Consistent fallback logo for other banks: white background and symbols in green (#2dba4e)
  return (
    <View
      style={[
        baseStyle,
        {
          borderWidth: 1,
          borderColor: 'rgba(45, 186, 78, 0.18)',
        },
        style,
      ]}
    >
      <MaterialCommunityIcons name="bank" size={Math.round(size * 0.55)} color="#2dba4e" />
    </View>
  );
};
