import React, { useEffect, useMemo, useRef, useCallback } from 'react';
import { Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { YStack, XStack, Text, View, Circle } from 'tamagui';
import { ScanLine, Users, UserPlus, RefreshCw, PenLine } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { ScreenContainer } from '@/shared/ui/ScreenContainer';
import UserAvatar from '@/shared/ui/UserAvatar';
import type { SessionHistoryEntry } from '@/features/sessions/api/history.api';
import { useSessionsHistoryStore } from '@/features/sessions/model/history.store';
import { replaySessionFromHistory } from '@/features/sessions/lib/replay-session';
import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@/shared/lib/currency';

const HOME_HISTORY_LIMIT = 10;

const formatSessionDate = (value?: string, locale: string = 'en') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  };
  try {
    return date.toLocaleString(locale, options);
  } catch {
    return date.toLocaleString(undefined, options);
  }
};

function ActionButton({
  title,
  icon,
  onPress,
}: {
  title: string;
  icon: React.ReactNode;
  onPress: () => void;
}) {
  return (
    <XStack
      onPress={onPress}
      width={171}
      height={48}
      borderRadius={12}
      alignItems="center"
      justifyContent="center"
      gap={6}
      borderWidth={1}
      borderColor="$gray6"
      backgroundColor="transparent"
      pressStyle={{ backgroundColor: '$gray2' }}
      hoverStyle={{ backgroundColor: '$gray2' }}
      focusStyle={{ borderColor: '$gray7' }}
    >
      {icon}
      <Text fontSize={14} color="$color">{title}</Text>
    </XStack>
  );
}

function AvatarStack({ participantIds }: { participantIds: string[] }) {
  const shown = participantIds.slice(0, 3);
  const extra = Math.max(0, participantIds.length - shown.length);

  return (
    <XStack w={92} h={28} ai="center">
      {shown.map((uniqueId, i) => (
        <View key={uniqueId ?? i} ml={i === 0 ? 0 : -8}>
          <UserAvatar
            uri={undefined}
            label={(uniqueId || 'U').slice(0, 2).toUpperCase()}
            size={28}
            textSize={12}
            backgroundColor="$gray5"
          />
        </View>
      ))}
      {extra > 0 && (
        <View
          w={28}
          h={28}
          br={14}
          backgroundColor="$gray3"
          borderWidth={2}
          borderColor="$background"
          ml={shown.length === 0 ? 0 : -8}
          ai="center"
          jc="center"
        >
          <Text fontSize={10} color="$gray11">
            +{extra}
          </Text>
        </View>
      )}
    </XStack>
  );
}

function BillCard({
  title,
  sub,
  amountLabel,
  participantIds,
  onPress,
  onRepeat,
  repeatLabel,
}: {
  title: string;
  sub: string;
  amountLabel: string;
  participantIds: string[];
  onPress?: () => void;
  onRepeat?: () => void;
  repeatLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => ({
        width: 358,
        opacity: onPress && pressed ? 0.9 : 1,
      })}
    >
      <YStack
        h={110}
        br={12}
        borderWidth={1}
        borderColor="$gray6"
        p="$3"
        backgroundColor="$background"
      >
        <XStack jc="space-between" ai="center">
          <YStack>
            <Text fontSize={16} fontWeight="600" lineHeight={19} color="$color">
              {title}
            </Text>
            <Text mt="$1" fontSize={12} lineHeight={12} color="$gray10">
              {sub}
            </Text>
          </YStack>
          <Text fontSize={14} lineHeight={22} fontWeight="700" color="$primary">
            {amountLabel}
          </Text>
        </XStack>

        <XStack mt="auto" ai="center" jc="space-between">
          <AvatarStack participantIds={participantIds} />
          {onRepeat ? (
            <Pressable
              onPress={(e) => {
                e.stopPropagation?.();
                onRepeat();
              }}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <Text fontSize={12} fontWeight="700" color="$primary">
                {repeatLabel ?? 'Repeat'}
              </Text>
            </Pressable>
          ) : null}
        </XStack>
      </YStack>
    </Pressable>
  );
}

export default function HomePage() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const sessions = useSessionsHistoryStore(state => state.sessions);
  const loading = useSessionsHistoryStore(state => state.loading);
  const initialized = useSessionsHistoryStore(state => state.initialized);
  const currentLimit = useSessionsHistoryStore(state => state.limit);
  const error = useSessionsHistoryStore(state => state.error);
  const fetchHistory = useSessionsHistoryStore(state => state.fetchHistory);
  const refreshIfStale = useSessionsHistoryStore(state => state.refreshIfStale);
  const forceRefresh = useSessionsHistoryStore(state => state.forceRefresh);

  const hasFetchedRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (hasFetchedRef.current) return;
    if (!initialized || (currentLimit ?? 0) < HOME_HISTORY_LIMIT) {
      hasFetchedRef.current = true;
      fetchHistory(HOME_HISTORY_LIMIT).catch(() => {
        hasFetchedRef.current = false;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialized, loading, currentLimit]);

  useFocusEffect(
    useCallback(() => {
      refreshIfStale(15_000, HOME_HISTORY_LIMIT).catch(() => {});
    }, [refreshIfStale])
  );

  const onManualRefresh = useCallback(() => {
    forceRefresh(HOME_HISTORY_LIMIT).catch(() => {});
  }, [forceRefresh]);

  const openFriends = () => router.push('/tabs/friends');
  const openGroups = () => router.push('/tabs/groups');
  const onScan = () => router.push('/tabs/scan-receipt');
  const onManualEntry = () => router.push('/tabs/manual-receipt');
  const openAllSessions = () => router.push('/tabs/sessions/history');

  const recent = useMemo<SessionHistoryEntry[]>(() => sessions.slice(0, 3), [sessions]);

  return (
    <ScreenContainer>
      <YStack f={1} ai="center" bg="$background">
        <XStack ai="center" jc="center" gap="$6" mt="$6" mb="$4">
          <YStack ai="center">
            <Pressable onPress={onScan}>
              <Circle size={64} bg="$primary" ai="center" jc="center" elevationAndroid={4}>
                <ScanLine size={26} color="white" />
              </Circle>
            </Pressable>
            <Text mt="$2" color="$gray10" fontSize={13}>
              {t('home.scan.cta', 'Scan receipt')}
            </Text>
          </YStack>
          <YStack ai="center">
            <Pressable onPress={onManualEntry}>
              <Circle size={64} bg="$primary" ai="center" jc="center" elevationAndroid={4}>
                <PenLine size={26} color="white" />
              </Circle>
            </Pressable>
            <Text mt="$2" color="$gray10" fontSize={13}>
              {t('home.manual.cta', 'Manual entry')}
            </Text>
          </YStack>
        </XStack>

        <XStack w={358} jc="space-between" mb="$5">
          <ActionButton
            title={t('home.actions.friends', 'Friends')}
            icon={<Users size={18} />}
            onPress={openFriends}
          />
          <ActionButton
            title={t('home.actions.groups', 'Groups')}
            icon={<UserPlus size={18} />}
            onPress={openGroups}
          />
        </XStack>

        <XStack w={358} jc="space-between" ai="center" mb="$3">
          <Text fontSize={18} fontWeight="600" color="$color">
            {t('home.recent.title', 'Recent bills')}
          </Text>

          {/* Справа: только иконка Refresh + кнопка Show more */}
          <XStack ai="center" gap="$3">
            <Pressable
              onPress={onManualRefresh}
              disabled={loading}
              accessibilityLabel="Refresh recent bills"
            >
              <XStack ai="center" opacity={loading ? 0.6 : 1}>
                <RefreshCw size={18} />
              </XStack>
            </Pressable>

            <Pressable onPress={openAllSessions}>
              <Text color="$primary">
                {t('home.recent.showMore', 'Show more')}
              </Text>
            </Pressable>
          </XStack>
        </XStack>

        <YStack gap="$3" pb="$6">
          {loading && (
            <Text color="$gray10" fontSize={14}>
              {t('home.recent.loading', 'Loading recent bills...')}
            </Text>
          )}
          {error && (
            <Text color="$red10" fontSize={14}>
              {error}
            </Text>
          )}
          {!loading && !error && !recent.length && (
            <Text color="$gray10" fontSize={14}>
              {t('home.recent.empty', 'No bills yet')}
            </Text>
          )}
          {recent.map((bill) => {
            const participantIds = bill.participantUniqueIds ?? [];
            const participantsLabel = t('home.recent.participants', {
              count: participantIds.length,
              defaultValue: `${participantIds.length} participants`,
            });
            const dateForSummary = bill.finalizedAt || bill.createdAt;
            const summary = `${formatSessionDate(dateForSummary, i18n.language)} • ${participantsLabel}`;
            const totalAmount = bill.grandTotal ?? 0;
            const currency = bill.currency || bill.payload?.totals?.currency || DEFAULT_CURRENCY;
            const amountLabel = formatCurrencyAmount(totalAmount, currency);

            return (
              <BillCard
                key={bill.sessionId}
                title={bill.sessionName || t('home.recent.fallbackName', 'Bill')}
                sub={summary}
                amountLabel={amountLabel}
                participantIds={participantIds}
                repeatLabel={t('sessions.history.repeat', 'Repeat bill')}
                onRepeat={async () => {
                  try {
                    await replaySessionFromHistory(bill, {
                      sessionNameSuffix: t('billFeatures.repeat.copySuffix', ' (copy)'),
                    });
                    router.push({
                      pathname: '/tabs/sessions/items-split',
                      params: { receiptId: String(bill.sessionId) },
                    });
                  } catch {
                    // ignore — user can retry from history detail
                  }
                }}
                onPress={() =>
                  router.push({
                    pathname: '/tabs/sessions/history/[historyId]',
                    params: { historyId: String(bill.sessionId) },
                  })
                }
              />
            );
          })}
        </YStack>
      </YStack>
    </ScreenContainer>
  );
}
