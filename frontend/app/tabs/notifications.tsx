import React, { useEffect, useCallback } from 'react';
import { RefreshControl } from 'react-native';
import { YStack, XStack, Text, ScrollView, Separator } from 'tamagui';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Bell, UserPlus, UserCheck, Receipt, Users } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { Button } from '@/shared/ui/Button';
import {
  useNotificationsStore,
  type AppNotification,
} from '@/features/notifications/model/notifications.store';

const ICON_MAP: Record<string, React.ReactNode> = {
  FRIEND_REQUEST: <UserPlus size={20} color="$blue10" />,
  FRIEND_ACCEPTED: <UserCheck size={20} color="$primary" />,
  SESSION_CREATED: <Receipt size={20} color="$gray11" />,
  SESSION_FINALIZED: <Receipt size={20} color="$primary" />,
  GROUP_INVITE: <Users size={20} color="$blue10" />,
};

function NotificationItem({ item }: { item: AppNotification }) {
  const ago = getTimeAgo(item.createdAt);

  return (
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
      <YStack f={1} gap="$1">
        <Text fontSize={14} fontWeight={item.read ? '400' : '600'}>
          {item.title}
        </Text>
        <Text fontSize={13} color="$gray10">
          {item.body}
        </Text>
        <Text fontSize={11} color="$gray9">
          {ago}
        </Text>
      </YStack>
    </XStack>
  );
}

function getTimeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const notifications = useNotificationsStore((s) => s.notifications);
  const loading = useNotificationsStore((s) => s.loading);
  const unreadCount = useNotificationsStore((s) => s.unreadCount);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const markAllAsRead = useNotificationsStore((s) => s.markAllAsRead);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const onRefresh = useCallback(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  return (
    <SafeAreaView style={{ flex: 1 }} edges={['bottom']}>
      <ScrollView
        f={1}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 32 }}
        refreshControl={
          <RefreshControl refreshing={loading} onRefresh={onRefresh} />
        }
      >
        <YStack p="$4" gap="$3">
          <XStack jc="space-between" ai="center">
            <Text fontSize={20} fontWeight="700">
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
              <NotificationItem item={item} />
              {index < notifications.length - 1 && <Separator />}
            </React.Fragment>
          ))}
        </YStack>
      </ScrollView>
    </SafeAreaView>
  );
}
