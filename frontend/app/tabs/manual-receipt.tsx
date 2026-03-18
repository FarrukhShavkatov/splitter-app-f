import React, { useState, useCallback, useMemo } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Pressable } from 'react-native';
import { YStack, XStack, Text, Input as TInput, Separator } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Plus, Trash2 } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { useReceiptSessionStore } from '@/features/receipt/model/receipt-session.store';

interface ManualItem {
  localId: string;
  name: string;
  price: string;
  quantity: string;
}

const makeId = () => `m-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

const CURRENCIES = ['UZS', 'USD', 'EUR', 'RUB', 'JPY'];

export default function ManualReceiptScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const createManualSession = useReceiptSessionStore((s) => s.createManualSession);
  const parsing = useReceiptSessionStore((s) => s.parsing);

  const [sessionName, setSessionName] = useState('');
  const [currency, setCurrency] = useState('UZS');
  const [items, setItems] = useState<ManualItem[]>([
    { localId: makeId(), name: '', price: '', quantity: '1' },
  ]);

  const addItem = useCallback(() => {
    setItems((prev) => [...prev, { localId: makeId(), name: '', price: '', quantity: '1' }]);
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => (prev.length <= 1 ? prev : prev.filter((i) => i.localId !== id)));
  }, []);

  const updateItem = useCallback((id: string, field: keyof ManualItem, value: string) => {
    setItems((prev) => prev.map((i) => (i.localId === id ? { ...i, [field]: value } : i)));
  }, []);

  const grandTotal = useMemo(() => {
    return items.reduce((sum, item) => {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.quantity, 10) || 1;
      return sum + price * qty;
    }, 0);
  }, [items]);

  const handleContinue = useCallback(async () => {
    const name = sessionName.trim() || t('manual.defaultName', 'Manual bill');
    const validItems = items.filter((i) => i.name.trim() && parseFloat(i.price) > 0);
    if (validItems.length === 0) {
      Alert.alert(t('common.error', 'Error'), t('manual.noItems', 'Add at least one item with a name and price.'));
      return;
    }

    const storeItems = validItems.map((i) => ({
      id: i.localId,
      name: i.name.trim(),
      unitPrice: parseFloat(i.price) || 0,
      quantity: parseInt(i.quantity, 10) || 1,
      totalPrice: (parseFloat(i.price) || 0) * (parseInt(i.quantity, 10) || 1),
    }));

    try {
      await createManualSession(name, currency, storeItems);
      router.push('/tabs/sessions/participants');
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Error';
      Alert.alert(t('common.error', 'Error'), msg);
    }
  }, [sessionName, items, currency, createManualSession, router, t]);

  return (
    <YStack f={1} bg="$background">
      <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
            keyboardShouldPersistTaps="handled"
          >
            <YStack f={1} p="$4" gap="$4">
              {/* Session name */}
              <YStack gap="$2">
                <Text fontSize={14} fontWeight="600" color="$gray12">
                  {t('manual.sessionName', 'Bill name')}
                </Text>
                <TInput
                  value={sessionName}
                  onChangeText={setSessionName}
                  placeholder={t('manual.sessionNamePlaceholder', 'e.g. Dinner at cafe')}
                  borderRadius={10}
                  h={44}
                  backgroundColor="$background"
                  borderWidth={1}
                  borderColor="$gray7"
                  color="$gray12"
                  placeholderTextColor="$gray9"
                  focusStyle={{ borderColor: '$green9' }}
                />
              </YStack>

              {/* Currency */}
              <YStack gap="$2">
                <Text fontSize={14} fontWeight="600" color="$gray12">
                  {t('manual.currency', 'Currency')}
                </Text>
                <XStack gap="$2" flexWrap="wrap">
                  {CURRENCIES.map((c) => (
                    <Button
                      key={c}
                      title={c}
                      variant={c === currency ? 'primary' : 'outline'}
                      size="small"
                      onPress={() => setCurrency(c)}
                    />
                  ))}
                </XStack>
              </YStack>

              <Separator borderColor="$gray5" />

              {/* Items */}
              <YStack gap="$3">
                <XStack jc="space-between" ai="center">
                  <Text fontSize={16} fontWeight="600" color="$gray12">
                    {t('manual.items', 'Items')}
                  </Text>
                  <Pressable
                    onPress={addItem}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={16} color="$primary" />
                    <Text fontSize={14} fontWeight="600" color="$primary">
                      {t('manual.addItem', 'Add item')}
                    </Text>
                  </Pressable>
                </XStack>

                {items.map((item, index) => (
                  <YStack
                    key={item.localId}
                    gap="$2"
                    p="$3"
                    borderWidth={1}
                    borderColor="$gray6"
                    borderRadius={12}
                    backgroundColor="$gray2"
                  >
                    <XStack jc="space-between" ai="center">
                      <Text fontSize={13} color="$gray10" fontWeight="500">
                        #{index + 1}
                      </Text>
                      {items.length > 1 && (
                        <Pressable
                          onPress={() => removeItem(item.localId)}
                          hitSlop={8}
                        >
                          <Trash2 size={18} color="$red10" />
                        </Pressable>
                      )}
                    </XStack>

                    <TInput
                      value={item.name}
                      onChangeText={(v) => updateItem(item.localId, 'name', v)}
                      placeholder={t('manual.itemName', 'Item name')}
                      h={40}
                      borderRadius={8}
                      backgroundColor="$background"
                      borderWidth={1}
                      borderColor="$gray7"
                      color="$gray12"
                      placeholderTextColor="$gray9"
                      focusStyle={{ borderColor: '$green9' }}
                    />

                    <XStack gap="$2">
                      <YStack f={1} gap="$1">
                        <Text fontSize={12} color="$gray10">
                          {t('manual.price', 'Price')}
                        </Text>
                        <TInput
                          value={item.price}
                          onChangeText={(v) => updateItem(item.localId, 'price', v)}
                          placeholder="0"
                          keyboardType="decimal-pad"
                          h={40}
                          borderRadius={8}
                          backgroundColor="$background"
                          borderWidth={1}
                          borderColor="$gray7"
                          color="$gray12"
                          placeholderTextColor="$gray9"
                          focusStyle={{ borderColor: '$green9' }}
                        />
                      </YStack>
                      <YStack w={80} gap="$1">
                        <Text fontSize={12} color="$gray10">
                          {t('manual.quantity', 'Qty')}
                        </Text>
                        <TInput
                          value={item.quantity}
                          onChangeText={(v) => updateItem(item.localId, 'quantity', v)}
                          placeholder="1"
                          keyboardType="number-pad"
                          h={40}
                          borderRadius={8}
                          textAlign="center"
                          backgroundColor="$background"
                          borderWidth={1}
                          borderColor="$gray7"
                          color="$gray12"
                          placeholderTextColor="$gray9"
                          focusStyle={{ borderColor: '$green9' }}
                        />
                      </YStack>
                    </XStack>
                  </YStack>
                ))}
              </YStack>

              <Separator borderColor="$gray5" />

              {/* Total */}
              <YStack
                p="$3"
                borderRadius={12}
                backgroundColor="$gray2"
                borderWidth={1}
                borderColor="$gray5"
              >
                <XStack jc="space-between" ai="center">
                  <Text fontSize={16} fontWeight="600" color="$gray12">
                    {t('manual.total', 'Total')}
                  </Text>
                  <Text fontSize={22} fontWeight="700" color="$primary">
                    {grandTotal.toLocaleString()} {currency}
                  </Text>
                </XStack>
              </YStack>

              {/* Continue button */}
              <Button
                title={parsing ? t('common.loading', 'Loading...') : t('manual.continue', 'Continue')}
                variant="primary"
                size="large"
                disabled={parsing}
                onPress={handleContinue}
              />
            </YStack>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </YStack>
  );
}
