import React, { useState } from 'react';
import { XStack, Text, Button } from 'tamagui';
import { CircleCheck, CircleX } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';

import { FriendsApi } from '@/features/friends/api/friends.api';
import { useFriendsStore } from '@/features/friends/model/friends.store';
import { useNotificationsStore } from '@/features/notifications/model/notifications.store';

const TINT_REJECT = '#E74C3C1A';
const TINT_ACCEPT = 'rgba(46,204,113,0.1)';

type Props = {
  requesterId: number;
  myUniqueId: string;
  notificationId?: number;
  onAccepted?: () => void;
  onRejected?: () => void;
  onError?: (message: string) => void;
};

export function FriendRequestActions({
  requesterId,
  myUniqueId,
  notificationId,
  onAccepted,
  onRejected,
  onError,
}: Props) {
  const { t } = useTranslation();
  const fetchAll = useFriendsStore((s) => s.fetchAll);
  const removeIncomingRequest = useFriendsStore((s) => s.removeIncomingRequest);
  const fetchNotifications = useNotificationsStore((s) => s.fetchNotifications);
  const fetchUnreadCount = useNotificationsStore((s) => s.fetchUnreadCount);
  const markAsRead = useNotificationsStore((s) => s.markAsRead);
  const removeFriendRequestNotifications = useNotificationsStore(
    (s) => s.removeFriendRequestNotifications
  );
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await Promise.all([fetchAll(), fetchNotifications(), fetchUnreadCount()]);
  };

  const handleResolved = async () => {
    removeIncomingRequest(requesterId);
    removeFriendRequestNotifications(requesterId, notificationId);
    if (notificationId) {
      await markAsRead([notificationId]);
    }
    await refresh();
  };

  const accept = async () => {
    setBusy(true);
    try {
      await FriendsApi.accept(myUniqueId, requesterId);
      await handleResolved();
      onAccepted?.();
    } catch (error: any) {
      onError?.(error?.message ?? t('friends.common.error', 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  const reject = async () => {
    setBusy(true);
    try {
      await FriendsApi.reject(myUniqueId, requesterId);
      await handleResolved();
      onRejected?.();
    } catch (error: any) {
      onError?.(error?.message ?? t('friends.common.error', 'Something went wrong'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <XStack gap="$2">
      <Button
        unstyled
        h={34}
        px="$3"
        borderRadius={10}
        borderWidth={1}
        borderColor="$red8"
        bg={TINT_REJECT}
        onPress={() => void reject()}
        disabled={busy}
        opacity={busy ? 0.6 : 1}
        pressStyle={{ opacity: 0.9 }}
      >
        <XStack ai="center" gap="$1">
          <CircleX size={14} color="#E74C3C" />
          <Text fontSize={13} fontWeight="600" color="$red10">
            {t('friends.requestsScreen.rejectCta', 'Reject')}
          </Text>
        </XStack>
      </Button>
      <Button
        unstyled
        h={34}
        px="$3"
        borderRadius={10}
        borderWidth={1}
        borderColor="$green8"
        bg={TINT_ACCEPT}
        onPress={() => void accept()}
        disabled={busy}
        opacity={busy ? 0.6 : 1}
        pressStyle={{ opacity: 0.9 }}
      >
        <XStack ai="center" gap="$1">
          <CircleCheck size={14} color="$primary" />
          <Text fontSize={13} fontWeight="700" color="$primary">
            {t('friends.requestsScreen.acceptCta', 'Accept')}
          </Text>
        </XStack>
      </Button>
    </XStack>
  );
}
