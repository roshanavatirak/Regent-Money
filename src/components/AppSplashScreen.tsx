import React from 'react';
import RegentIntro, { RegentIntroProps } from './RegentIntro';

export interface AppSplashScreenProps {
  onFinish: () => void;
}

export const AppSplashScreen: React.FC<AppSplashScreenProps> = ({ onFinish }) => {
  return <RegentIntro onFinish={onFinish} />;
};

export default AppSplashScreen;
