// app/index.tsx - улучшенная Welcome страница

/*
  заменил старый space на gap
  убрал index из .map и key, использование index в key — плохая практика при возможных перерендерах
*/

import React from 'react';
import { Redirect, Link } from 'expo-router';
import { YStack, XStack, Text, Circle } from 'tamagui';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { LANGUAGE_OPTIONS, type LanguageCode } from '@/shared/config/languages';
import { Button } from '@/shared/ui/Button';
import { ScreenContainer } from '@/shared/ui/ScreenContainer';
import { ScanLine } from '@tamagui/lucide-icons';

const languages = LANGUAGE_OPTIONS.map((option) => ({
  code: option.code,
  name: option.shortLabel,
}));

export default function Welcome() {
  const token = useAppStore((state) => state.token);
  const { t } = useTranslation();
  const currentLanguage = useAppStore((state) => state.language);
  const setLanguage = useAppStore((state) => state.setLanguage);

  // Если уже залогинен — сразу в табы
  if (token) return <Redirect href="/tabs" />;

  const changeLanguage = (langCode: LanguageCode) => {
    if (langCode === currentLanguage) return;
    setLanguage(langCode);
  };

  return (
    <ScreenContainer>
      <YStack flex={1}>
        
        {/* Language Selector - компактный в правом верхнем углу */}
        <XStack justifyContent="flex-end" marginTop="$3" marginBottom="$6">
          <XStack gap="$1" backgroundColor="$gray3" borderRadius="$8" padding="$1">
            {languages.map((lang) => (
              <YStack
                key={lang.code}
                backgroundColor={currentLanguage === lang.code ? "$primary" : "transparent"}
                borderRadius="$6"
                paddingHorizontal="$3"
                paddingVertical="$2"
                pressStyle={{ opacity: 0.7 }}
                onPress={() => changeLanguage(lang.code)}
              >
                <Text 
                  fontSize="$2" 
                  fontWeight="600"
                  color={currentLanguage === lang.code ? "#FFFFFF" : "$gray11"}
                >
                  {lang.name}
                </Text>
              </YStack>
            ))}
          </XStack>
        </XStack>

        {/* Hero Section - более центрированный */}
        <YStack flex={1} justifyContent="center" alignItems="center" gap="$8">
          
          {/* App Icon - круглый с иконкой */}
          <YStack alignItems="center" gap="$5">
            <Circle 
              size={120}
              backgroundColor="$primary"
              alignItems="center" 
              justifyContent="center"
              shadowColor="$shadowColor"
              shadowOffset={{ width: 0, height: 4 }}
              shadowOpacity={0.15}
              shadowRadius={12}
              elevation={8}
            >
              <ScanLine size={48} color="#FFFFFF" />
            </Circle>
            
            <YStack alignItems="center" gap="$3">
              <Text fontSize="$9" fontWeight="900" color="$color" textAlign="center">
                {t('app.name', 'Receipt Splitter')}
              </Text>
              <Text fontSize="$5" color="$gray10" textAlign="center" maxWidth={280}>
                {t('app.subtitle', 'Split bills easily with friends')}
              </Text>
            </YStack>
          </YStack>

          {/* Feature Highlights - горизонтальные индикаторы */}
          <XStack gap="$6" alignItems="center">
            {[
              { icon: '📷', text: t('features.scan', 'Scan') },
              { icon: '➕', text: t('features.split', 'Split') },
              { icon: '💰', text: t('features.calculate', 'Calculate') },
            ].map((feature) => (
              <YStack key={feature.text} alignItems="center" gap="$2" maxWidth={80}>
                <YStack 
                  width={50} 
                  height={50} 
                  backgroundColor="$gray2" 
                  borderRadius="$6"
                  alignItems="center" 
                  justifyContent="center"
                >
                  <Text fontSize="$6">{feature.icon}</Text>
                </YStack>
                <Text fontSize="$3" color="$gray10" textAlign="center" fontWeight="500">
                  {feature.text}
                </Text>
              </YStack>
            ))}
          </XStack>
        </YStack>

        {/* Call to Action - внизу, четкий фокус */}
        <YStack gap="$5" marginBottom="$8">
          
          {/* Primary CTA */}
          <YStack alignItems="center" gap="$4">
            <Text fontSize="$6" fontWeight="700" textAlign="center" color="$color">
              {t('welcome.message', 'Welcome! Let\'s get started')}
            </Text>
            
            <Link href="/register" asChild>
              <Button 
                title={t('auth.createAccount', 'Create Account')} 
                variant="primary"
                size="large"
              />
            </Link>
          </YStack>

          {/* Secondary Action - менее навязчиво */}
          <YStack alignItems="center" gap="$3">
            <XStack alignItems="center" gap="$1">
              <YStack width={60} height={1} backgroundColor="$gray6" />
              <Text fontSize="$3" color="$gray9" paddingHorizontal="$3">
                {t('welcome.existingUser', 'Already have an account?')}
              </Text>
              <YStack width={60} height={1} backgroundColor="$gray6" />
            </XStack>
            
            <Link href="/login" asChild>
              <Button 
                title={t('auth.signIn', 'Sign In')} 
                variant="outline"
                size="medium"
              />
            </Link>
          </YStack>
        </YStack>
      </YStack>
    </ScreenContainer>
  );
}
