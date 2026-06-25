import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Share, Alert } from 'react-native';
import { YStack, XStack, Text, ScrollView, Button, Spinner } from 'tamagui';
import { Check, ChevronLeft, FileDown } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import UserAvatar from '@/shared/ui/UserAvatar';
import { useSessionsHistoryStore } from '@/features/sessions/model/history.store';
import { SessionActionsBar } from '@/features/sessions/ui/SessionActionsBar';
import { ExportHistoryModal } from '@/features/sessions/ui/ExportHistoryModal';
import {
  buildShareTextFromHistory,
} from '@/features/sessions/lib/share-summary';
import { replaySessionFromHistory } from '@/features/sessions/lib/replay-session';
import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@/shared/lib/currency';
import type {
  SessionHistoryEntry,
  SessionHistoryAllocation,
  SessionHistoryItem,
  SessionHistoryTotalsByParticipant,
  SessionPaymentStatusMap,
} from '@/features/sessions/api/history.api';

const fmtCurrency = (value: number, currency: string) =>
  formatCurrencyAmount(value, currency);
const BULLET = '\u2022';
const DETAIL_LIMIT = 50;

const DATE_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  uz: 'uz-UZ',
  ja: 'ja-JP',
};

const formatSessionDate = (value?: string, lang = 'en') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const locale = DATE_LOCALE_MAP[lang] ?? lang;
  return date.toLocaleString(locale, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

type ParticipantView = {
  participant: { uniqueId: string; username: string; avatarUrl?: string | null };
  avatarUrl?: string | null;
  amount: number;
  paid: boolean;
  items: { id: string; title: string; price: number }[];
};

const buildParticipantsView = (
  bill: SessionHistoryEntry | undefined,
  paymentStatus: SessionPaymentStatusMap,
  itemFallback: string
): ParticipantView[] => {
  if (!bill) return [];

  const totalsByParticipant = new Map<string, SessionHistoryTotalsByParticipant>();
  (bill.totals?.byParticipant ?? []).forEach((item) => {
    totalsByParticipant.set(item.uniqueId, item);
  });

  const itemsById = new Map<string, SessionHistoryItem>();
  (bill.totals?.byItem ?? []).forEach((item) => {
    itemsById.set(item.itemId, item);
  });

  const allocationsByParticipant = new Map<string, SessionHistoryAllocation[]>();
  (bill.allocations ?? []).forEach((alloc) => {
    const collection = allocationsByParticipant.get(alloc.participantId) ?? [];
    collection.push(alloc);
    allocationsByParticipant.set(alloc.participantId, collection);
  });

  return (bill.participants ?? []).map((p) => {
    const totals = totalsByParticipant.get(p.uniqueId);
    const allocations = allocationsByParticipant.get(p.uniqueId) ?? [];
    const items = allocations.map((allocation, index) => {
      const itemMeta = itemsById.get(allocation.itemId);
      return {
        id: `${allocation.itemId}-${p.uniqueId}-${index}`,
        title: itemMeta?.name || itemFallback,
        price: allocation.shareAmount,
      };
    });
    return {
      participant: {
        uniqueId: p.uniqueId,
        username: totals?.username || p.username || 'U',
        avatarUrl: p.avatarUrl ?? null,
      },
      avatarUrl: p.avatarUrl ?? null,
      amount: totals?.amountOwed ?? 0,
      paid: Boolean(paymentStatus[p.uniqueId]?.paid),
      items,
    };
  });
};

export default function HistoryDetailsScreen() {
  const { historyId } = useLocalSearchParams<{ historyId: string }>();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const sessions = useSessionsHistoryStore((state) => state.sessions);
  const loading = useSessionsHistoryStore((state) => state.loading);
  const initialized = useSessionsHistoryStore((state) => state.initialized);
  const currentLimit = useSessionsHistoryStore((state) => state.limit);
  const error = useSessionsHistoryStore((state) => state.error);
  const fetchHistory = useSessionsHistoryStore((state) => state.fetchHistory);
  const patchPaymentStatus = useSessionsHistoryStore((state) => state.patchPaymentStatus);

  const [busy, setBusy] = useState<'share' | 'repeat' | null>(null);
  const [paymentBusyId, setPaymentBusyId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);

  const bill: SessionHistoryEntry | undefined = useMemo(() => {
    if (!historyId) return undefined;
    const id = Number(historyId);
    if (Number.isNaN(id)) return undefined;
    return sessions.find((session) => session.sessionId === id);
  }, [historyId, sessions]);

  const paymentStatus = bill?.payload?.paymentStatus ?? {};

  useEffect(() => {
    if (loading) return;
    const hasBill = Boolean(bill);
    if (!initialized || (!hasBill && (currentLimit ?? 0) < DETAIL_LIMIT)) {
      fetchHistory(DETAIL_LIMIT).catch(() => {});
    }
  }, [initialized, loading, currentLimit, fetchHistory, bill]);

  const currency =
    bill?.currency ||
    bill?.totals?.currency ||
    bill?.payload?.totals?.currency ||
    DEFAULT_CURRENCY;

  const participants = useMemo(
    () =>
      buildParticipantsView(
        bill,
        paymentStatus,
        t('sessions.history.itemFallback', 'Item')
      ),
    [bill, paymentStatus, t]
  );

  const shareLabels = useMemo(
    () => ({
      title: t('billFeatures.share.title', 'Receipt Splitter'),
      total: t('billFeatures.share.total', 'Total'),
      perPerson: t('billFeatures.share.perPerson', 'Per person'),
      paid: t('billFeatures.share.paid', 'paid'),
      unpaid: t('billFeatures.share.unpaid', 'unpaid'),
      footer: t('billFeatures.share.footer', 'Shared via Receipt Splitter'),
    }),
    [t]
  );

  const onShare = useCallback(async () => {
    if (!bill) return;
    setBusy('share');
    try {
      const message = buildShareTextFromHistory(bill, shareLabels);
      await Share.share({ message });
    } finally {
      setBusy(null);
    }
  }, [bill, shareLabels]);

  const onRepeat = useCallback(async () => {
    if (!bill) return;
    setBusy('repeat');
    try {
      await replaySessionFromHistory(bill, {
        sessionNameSuffix: t('billFeatures.repeat.copySuffix', ' (copy)'),
      });
      router.push({
        pathname: '/tabs/sessions/items-split',
        params: { receiptId: String(bill.sessionId) },
      });
    } catch {
      Alert.alert(
        t('common.error', 'Error'),
        t('billFeatures.repeat.error', 'Could not repeat this bill')
      );
    } finally {
      setBusy(null);
    }
  }, [bill, router, t]);

  const onTogglePaid = useCallback(
    async (participantUniqueId: string, nextPaid: boolean) => {
      if (!bill) return;
      setPaymentBusyId(participantUniqueId);
      try {
        await patchPaymentStatus(bill.sessionId, participantUniqueId, nextPaid);
      } catch {
        Alert.alert(t('common.error', 'Error'), t('common.error', 'Error'));
      } finally {
        setPaymentBusyId(null);
      }
    },
    [bill, patchPaymentStatus, t]
  );

  if (!bill && loading) {
    return (
      <YStack f={1} bg="$background" ai="center" jc="center">
        <Spinner size="large" color="$primary" />
        <Text mt="$2" fontSize={14} color="$gray10">
          {t('sessions.history.loading', 'Loading…')}
        </Text>
      </YStack>
    );
  }

  if (!bill) {
    return (
      <YStack f={1} bg="$background" ai="center" jc="center" gap="$3" px="$4">
        <Text fontSize={16} fontWeight="600">
          {t('sessions.history.notFound', 'Bill not found')}
        </Text>
        {error ? (
          <Text fontSize={14} color="$red10">
            {error}
          </Text>
        ) : null}
        <Button onPress={() => router.back()}>
          {t('sessions.history.back', 'Back')}
        </Button>
      </YStack>
    );
  }

  return (
    <YStack f={1} bg="$background" px="$4" pt="$4" pb="$4" position="relative">
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 32, gap: 16 }}
      >
        <YStack w={358} gap="$3">
          <Button
            unstyled
            alignSelf="flex-start"
            onPress={() => router.back()}
            icon={<ChevronLeft size={18} color="$gray12" />}
          >
            <Text color="$gray11" fontSize={14}>
              {t('sessions.history.back', 'Back')}
            </Text>
          </Button>

          <Text fontSize={24} fontWeight="700" color="$color">
            {bill.sessionName || t('home.recent.fallbackName', 'Bill')}
          </Text>
          <Text fontSize={14} color="$gray10">
            {formatSessionDate(bill.finalizedAt || bill.createdAt, i18n.language)}{' '}
            {BULLET}{' '}
            {t('sessions.history.participantsCount', {
              count: (bill.participants ?? []).length,
              defaultValue: '{{count}} participants',
            })}
          </Text>
          <Text fontSize={18} fontWeight="700" color="$primary">
            {fmtCurrency(bill.grandTotal ?? 0, currency)}
          </Text>

          <SessionActionsBar
            shareLabel={t('sessions.history.share', 'Share')}
            repeatLabel={t('sessions.history.repeat', 'Repeat bill')}
            hint={t(
              'sessions.history.actionsHint',
              'Share with friends or repeat this bill with the same people.'
            )}
            onShare={onShare}
            onRepeat={onRepeat}
            busy={busy}
          />

          <Button
            unstyled
            h={40}
            borderRadius={10}
            borderWidth={1}
            borderColor="$gray6"
            bg="$backgroundPress"
            ai="center"
            jc="center"
            onPress={() => setExportOpen(true)}
            pressStyle={{ opacity: 0.9 }}
          >
            <XStack ai="center" gap="$2">
              <FileDown size={18} color="$gray11" />
              <Text fontSize={14} fontWeight="700" color="$color">
                {t('billFeatures.export.buttonSingle', 'Export bill')}
              </Text>
            </XStack>
          </Button>
        </YStack>

        {participants.map(({ participant, avatarUrl, amount, paid, items }) => (
          <YStack
            key={participant.uniqueId}
            w={358}
            borderWidth={1}
            borderColor={paid ? '$green8' : '$primary'}
            br={12}
            bg="$background"
            px={16}
            py={12}
            gap="$3"
          >
            <XStack jc="space-between" ai="center">
              <XStack ai="center" gap="$2" f={1}>
                <UserAvatar
                  uri={avatarUrl ?? undefined}
                  label={(participant.username || 'U').slice(0, 1).toUpperCase()}
                  size={40}
                  textSize={16}
                  backgroundColor="$gray5"
                />
                <YStack f={1}>
                  <Text fontSize={16} fontWeight="600" numberOfLines={1}>
                    {participant.username}
                  </Text>
                  {paid ? (
                    <XStack ai="center" gap="$1">
                      <Check size={14} color="$green10" />
                      <Text fontSize={12} color="$green10" fontWeight="600">
                        {t('sessions.history.markedPaid', 'Paid')}
                      </Text>
                    </XStack>
                  ) : amount > 0 ? (
                    <Text fontSize={12} color="$orange10">
                      {t('sessions.history.owed', {
                        amount: fmtCurrency(amount, currency),
                        defaultValue: 'Owes {{amount}}',
                      })}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>
              <Text fontSize={16} fontWeight="700" color="$primary">
                {fmtCurrency(amount, currency)}
              </Text>
            </XStack>

            <YStack gap={8}>
              {items.length ? (
                items.map((item) => (
                  <XStack key={item.id} jc="space-between" ai="center">
                    <Text fontSize={14} color="$color">
                      {item.title}
                    </Text>
                    <Text fontSize={14} fontWeight="600" color="$primary">
                      {fmtCurrency(item.price, currency)}
                    </Text>
                  </XStack>
                ))
              ) : (
                <Text fontSize={12} color="$gray9">
                  {t('sessions.history.noItems', 'No items linked')}
                </Text>
              )}
            </YStack>

            {amount > 0 ? (
              <Button
                unstyled
                h={36}
                borderRadius={8}
                bg={paid ? '$gray4' : '$primary'}
                ai="center"
                jc="center"
                onPress={() => onTogglePaid(participant.uniqueId, !paid)}
                disabled={paymentBusyId === participant.uniqueId}
                opacity={paymentBusyId === participant.uniqueId ? 0.6 : 1}
                pressStyle={{ opacity: 0.9 }}
              >
                <Text fontSize={14} fontWeight="600" color={paid ? '$gray11' : 'white'}>
                  {paid
                    ? t('sessions.history.markedPaid', 'Paid')
                    : t('sessions.history.markPaid', 'Mark as paid')}
                </Text>
              </Button>
            ) : null}
          </YStack>
        ))}
      </ScrollView>

      {bill ? (
        <ExportHistoryModal
          visible={exportOpen}
          onClose={() => setExportOpen(false)}
          entries={[bill]}
          scope="single"
        />
      ) : null}
    </YStack>
  );
}
