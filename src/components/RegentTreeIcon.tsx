import React from 'react';
import Svg, { G, Path } from 'react-native-svg';

/**
 * Regent chatbot glyph: the brand tree-of-life reduced to a 24×24 line icon
 * (trunk, three leaves, two roots) so it reads at tab-bar size.
 * `filled` fills the leaves for the active state, mirroring Ionicons' solid/outline pairs.
 */
interface RegentTreeIconProps {
  size?: number;
  color?: string;
  filled?: boolean;
  strokeWidth?: number;
}

const TOP_LEAF = 'M0 0C2.1-1.7 2.1-4.9 0-6.6C-2.1-4.9-2.1-1.7 0 0Z';
const SIDE_LEAF = 'M0 0C1.9-1.5 1.9-4.3 0-5.8C-1.9-4.3-1.9-1.5 0 0Z';

export const RegentTreeIcon: React.FC<RegentTreeIconProps> = ({
  size = 20,
  color = '#0B1F17',
  filled = false,
  strokeWidth = 1.8,
}) => {
  const leafFill = filled ? color : 'none';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <G stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
        <Path d="M12 10.2V20.6" />
        <Path d="M12 15.2C10.4 14.6 9.1 13.6 8.2 12.1" />
        <Path d="M12 15.2C13.6 14.6 14.9 13.6 15.8 12.1" />
        <Path d="M12 17.6C10.5 18 9.2 19.2 8.3 20.6" />
        <Path d="M12 17.6C13.5 18 14.8 19.2 15.7 20.6" />
        <G transform="translate(12 10.2)">
          <Path d={TOP_LEAF} fill={leafFill} />
        </G>
        <G transform="translate(8.2 12.1) rotate(-52)">
          <Path d={SIDE_LEAF} fill={leafFill} />
        </G>
        <G transform="translate(15.8 12.1) rotate(52)">
          <Path d={SIDE_LEAF} fill={leafFill} />
        </G>
      </G>
    </Svg>
  );
};

export default RegentTreeIcon;
