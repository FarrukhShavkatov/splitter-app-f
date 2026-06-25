import React from 'react';
import { ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack, Text, Button } from 'tamagui';
import { ChevronLeft } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { ThemedSafeArea } from '@/shared/ui/ThemedSafeArea';

const STEPS = [
  'step1',
  'step2',
  'step3',
  'step4',
  'step5',
  'step6',
  'step7',
  'step8',
  'step9',
] as const;

export default function FeaturesGuideScreen() {
  const router = useRouter();
  const { t } = useTranslation();

  return (
    <ThemedSafeArea>
      <YStack f={1} bg="$background" px="$4" pt="$3" pb="$4">
        <Button
          unstyled
          alignSelf="flex-start"
          mb="$3"
          onPress={() => router.back()}
          icon={<ChevronLeft size={18} color="$gray12" />}
        >
          <Text color="$gray11" fontSize={14}>
            {t('common.back', 'Back')}
          </Text>
        </Button>

        <Text fontSize={22} fontWeight="700" color="$color" mb="$1">
          {t('billFeatures.guide.title', 'How to use')}
        </Text>
        <Text fontSize={14} color="$primary" fontWeight="600" mb="$4">
          {t('billFeatures.guide.subtitle', 'Receipt → split → share → settle')}
        </Text>

        <ScrollView showsVerticalScrollIndicator={false}>
          <YStack gap="$3" pb="$6">
            {STEPS.map((step) => (
              <YStack
                key={step}
                p="$3"
                borderRadius={12}
                borderWidth={1}
                borderColor="$gray6"
                bg="$backgroundPress"
                gap="$1"
              >
                <Text fontSize={15} fontWeight="700" color="$color">
                  {t(`billFeatures.guide.${step}Title`)}
                </Text>
                <Text fontSize={13} color="$gray11" lineHeight={20}>
                  {t(`billFeatures.guide.${step}Body`)}
                </Text>
              </YStack>
            ))}
          </YStack>
        </ScrollView>
      </YStack>
    </ThemedSafeArea>
  );
}
