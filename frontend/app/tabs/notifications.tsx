import React, { useEffect, useCallback, useMemo } from 'react';
import { Pressable, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { YStack, XStack, Text, ScrollView, Separator } from 'tamagui';
import { ThemedSafeArea } from '@/shared/ui/ThemedSafeArea';
import { Bell, UserPlus, UserCheck, Receipt, Users, Wallet, BadgeCheck } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { FriendRequestActions } from '@/features/friends/ui/FriendRequestActions';
import { useFriendsStore } from '@/features/friends/model/friends.store';
import {
  useNotificationsStore,
  type AppNotification,
} from '@/features/notifications/model/notifications.store';
import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@/shared/lib/currency';

const ICON_MAP: Record<string, React.ReactNode> = {
  FRIEND_REQUEST: <UserPlus size={20} color="$blue10" />,
  FRIEND_ACCEPTED: <UserCheck size={20} color="$primary" />,
  SESSION_CREATED: <Receipt size={20} color="$gray11" />,
  SESSION_FINALIZED: <Receipt size={20} color="$primary" />,
  GROUP_INVITE: <Users size={20} color="$blue10" />,
  DEBT_REMINDER: <Wallet size={20} color="$orange10" />,
  PAYMENT_MARKED: <BadgeCheck size={20} color="$green10" />,
};

const EMPTY_INCOMING_REQUESTS: any[] = [];

type Translate = (...args: any[]) => any;

function buildNotificationCopy(
  item: AppNotification,
  t: Translate
) {
  const meta = item.meta ?? {};
  const sessionName = String(meta.sessionName ?? '').trim();
  const creatorUsername = String(meta.creatorUsername ?? '').trim();
  const currency = String(meta.currency ?? DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY;
  const grandTotal = Number(meta.grandTotal ?? 0);
  const amountOwed = Number(meta.amountOwed ?? 0);
  const participantUsername = String(meta.participantUsername ?? '').trim();
  const requesterUsername = String(meta.requesterUsername ?? '').trim();

  if (item.type === 'FRIEND_REQUEST') {
    const actor = requesterUsername || item.body.split(' ')[0] || t('friends.common.unknownUser', 'Someone');
    return {
      title: t('notifications.types.friendRequest.title', 'Friend request'),
      body: t('notifications.types.friendRequest.body', {
        actor,
        defaultValue: '{{actor}} sent you a friend request',
      }),
    };
  }

  if (item.type === 'SESSION_FINALIZED') {
    return {
      title: t('notifications.types.sessionFinalized.title', 'Bill finalized'),
      body: t('notifications.types.sessionFinalized.body', {
        name: sessionName || t('history.fallbackName', 'Bill'),
        actor: creatorUsername || t('friends.common.unknownUser', 'Someone'),
        amount: formatCurrencyAmount(grandTotal, currency),
        defaultValue: '{{actor}} finalized "{{name}}" — {{amount}}',
      }),
    };
  }

  if (item.type === 'DEBT_REMINDER') {
    return {
      title: t('notifications.types.debtReminder.title', 'Amount to pay'),
      body: t('notifications.types.debtReminder.body', {
        name: sessionName || t('history.fallbackName', 'Bill'),
        amount: formatCurrencyAmount(amountOwed, currency),
        defaultValue: 'You owe {{amount}} for "{{name}}"',
      }),
    };
  }

  if (item.type === 'PAYMENT_MARKED') {
    return {
      title: t('notifications.types.paymentMarked.title', 'Payment marked'),
      body: t('notifications.types.paymentMarked.body', {
        name: sessionName || t('history.fallbackName', 'Bill'),
        participant: participantUsername || t('friends.common.unknownUser', 'Someone'),
        defaultValue: '{{participant}} marked paid for "{{name}}"',
      }),
    };
  }

  return { title: item.title, body: item.body };
}

function resolveRequesterId(item: AppNotification, incoming: any[]): number {
  const fromMeta = Number(item.meta?.requesterId ?? 0);
  if (fromMeta > 0) return fromMeta;

  const username = String(item.meta?.requesterUsername ?? '').toLowerCase();
  if (username) {
    const match = incoming.find(
      (request) => (request.from?.username ?? '').toLowerCase() === username
    );
    if (match?.from?.id) return match.from.id;
  }

  if (incoming.length === 1 && incoming[0]?.from?.id) {
    return incoming[0].from.id;
  }

  return 0;
}

function NotificationItem({
  item,
  onPress,
  myUniqueId,
  incoming,
}: {
  item: AppNotification;
  onPress: () => void;
  myUniqueId?: string;
  incoming: any[];
}) {
  const { t } = useTranslation();
  const ago = getTimeAgo(item.createdAt, t);
  const copy = useMemo(() => buildNotificationCopy(item, t), [item, t]);
  const requesterId = resolveRequesterId(item, incoming);
  const stillPending = incoming.some(
    (request) => (request.from?.id ?? request.fromId) === requesterId
  );
  const isFriendRequest =
    item.type === 'FRIEND_REQUEST' && requesterId > 0 && stillPending && !!myUniqueId;

  const content = (
    <XStack
      gap="$3"
      p="$3"
      borderRadius={12}
      backgroundColor={item.read ? 'transparent' : '$backgroundPress'}
      ai="flex-start"
    >
      <YStack mt="$0.5">
        {ICON_MAP[item.type] ?? <Bell size={20} color="$gray11" />}
      </YStack>
      <YStack f={1} gap="$2">
        <YStack gap="$1">
          <Text fontSize={14} fontWeight={item.read ? '400' : '600'} color="$color">
            {copy.title}
          </Text>
          <Text fontSize={13} color="$gray10">
            {copy.body}
          </Text>
          <Text fontSize={11} color="$gray9">
            {ago}
          </Text>
        </YStack>
        {isFriendRequest && (
          <FriendRequestActions
            requesterId={requesterId}
            myUniqueId={myUniqueId}
            notificationId={item.id}
          />
        )}
      </YStack>
    </XStack>
  );

  if (isFriendRequest) {
    return content;
  }

  return <Pressable onPress={onPress}>{content}</Pressable>;
}

function getTimeAgo(dateStr: string, t: Translate): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return t('notifications.time.justNow', 'just now');
  if (minutes < 60) return t('notifications.time.minutesAgo', { count: minutes, defaultValue: '{{count}}m ago' });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t('notifications.time.hoursAgo', { count: hours, defaultValue: '{{count}}h ago' });
  const days = Math.floor(hours / 24);
  return t('notifications.time.daysAgo', { count: days, defaultValue: '{{count}}d ago' });
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const myUniqueId = useAppStore((s) => s.user?.uniqueId);
  const notifications = useNotificationsStore((s) => s.notifications);
  const loading = useNotificationsStore((s) => s.loading);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const fetchFriends = useFriendsStore((s) => s.fetchAll);
  const incoming = useFriendsStore((s) => s.requestsRaw?.incoming ?? EMPTY_INCOMING_REQUESTS);

  useEffect(() => {
    fetchNotifications();
    void fetchFriends();
  }, [fetchNotifications, fetchFriends]);

  const onRefresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const openNotification = useCallback(
    async (item: AppNotification) => {
      if (!item.read) {
        await markAsRead([item.id]);
      }

      const sessionId = Number(item.meta?.sessionId ?? 0);
      if (Number.isFinite(sessionId) && sessionId > 0) {
        router.push({
          pathname: '/tabs/sessions/history/[historyId]',
          params: { historyId: String(sessionId) },
        });
        return;
      }

      if (item.type === 'FRIEND_ACCEPTED') {
        router.push('/tabs/friends');
        return;
      }

      if (item.type === 'GROUP_INVITE') {
        router.push('/tabs/groups');
      }
    },
    [markAsRead, router]
  );

  return (
    <ThemedSafeArea edges={['bottom']}>
      <ScrollView
        f={1}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        <YStack p="$4" gap="$3">
          <XStack jc="space-between" ai="center">
            <Text fontSize={20} fontWeight="700" color="$color">
              {t('notifications.title', 'Notifications')}
            </Text>
            {unreadCount > 0 && (
              <Button
                title={t('notifications.markAllRead', 'Mark all read')}
                variant="outline"
                size="small"
                onPress={markAllAsRead}
              />
            )}
          </XStack>

          {!loading && notifications.length === 0 && (
            <YStack ai="center" jc="center" py="$8" gap="$2">
              <Bell size={40} color="$gray8" />
              <Text color="$gray10" fontSize={14}>
                {t('notifications.empty', 'No notifications yet')}
              </Text>
            </YStack>
          )}

          {notifications.map((item, index) => (
            <React.Fragment key={item.id}>
              <NotificationItem
                item={item}
                myUniqueId={myUniqueId}
                incoming={incoming}
                onPress={() => void openNotification(item)}
              />
              {index < notifications.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </YStack>
      </ScrollView>
    </ThemedSafeArea>
  );
}
