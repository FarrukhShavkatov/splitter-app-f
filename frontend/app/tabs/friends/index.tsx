import React, { useEffect, useState, useMemo } from 'react';
import { YStack, XStack, Paragraph, Input, ScrollView, Spinner, Separator, Text } from 'tamagui';
import { useRouter } from 'expo-router';
import { Search } from '@tamagui/lucide-icons';
import { useTranslation } from 'react-i18next';
import { useFriendsStore } from '@/features/friends/model/friends.store';
import { FriendListItem } from '@/features/friends/ui/FriendListItem';
import { FriendRequestActions } from '@/features/friends/ui/FriendRequestActions';
import UserAvatar from '@/shared/ui/UserAvatar';
import Fab from '@/shared/ui/Fab';
import { ScreenContainer } from '@/shared/ui/ScreenContainer';
import { useAppStore } from '@/shared/lib/stores/app-store';

export default function FriendsScreen() {
  const { friends, requestsRaw, loading, error, fetchAll } = useFriendsStore();
  const router = useRouter();
  const { t } = useTranslation();
  const myUniqueId = useAppStore((s) => s.user?.uniqueId);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const incoming = useMemo(() => requestsRaw?.incoming ?? [], [requestsRaw]);

  const filteredFriends = useMemo(() => {
    if (!searchQuery) {
      return friends;
    }
    const lowerCaseQuery = searchQuery.toLowerCase();
    return friends.filter(friend => {
      const title = (
        friend?.user?.displayName || friend?.user?.username || ''
      ).toLowerCase();
      const uniqueId = (friend?.user?.uniqueId || friend?.uniqueId || '').toLowerCase();
      return title.includes(lowerCaseQuery) || uniqueId.includes(lowerCaseQuery);
    });
  }, [friends, searchQuery]);

  if (loading && friends.length === 0 && incoming.length === 0) {
    return (
      <ScreenContainer>
        <Spinner size="large" color="$gray10" />
      </ScreenContainer>
    );
  }

  const unknownUser = t('friends.common.unknownUser', 'Unknown user');

  return (
    <YStack f={1} bg="$background">
      <YStack f={1} p="$4">
        <XStack position="relative" ai="center" mb="$4">
          <Input
            placeholder={t('friends.searchPlaceholder', 'Search friends...')}
            value={searchQuery}
            onChangeText={setSearchQuery}
            f={1}
            h={40}
            pl={40}
            borderRadius={10}
            bg="$backgroundPress"
            borderWidth={0}
          />
          <Search
            size={20}
            color="$gray10"
            position="absolute"
            left={12}
            pointerEvents="none"
          />
        </XStack>

        {error && <Paragraph col="$red10" p="$4">{error}</Paragraph>}

        <ScrollView f={1} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 100 }}>
          {incoming.length > 0 && myUniqueId && (
            <YStack mb="$4" gap="$2">
              <Text fontSize={16} fontWeight="700" color="$color">
                {t('friends.incomingSection', 'Incoming requests')}
              </Text>
              <YStack borderWidth={1} borderColor="$primary" borderRadius={8} overflow="hidden">
                {incoming.map((request: any, index: number) => {
                  const name =
                    request.from?.displayName ||
                    request.from?.username ||
                    unknownUser;
                  const uid = request.from?.uniqueId;
                  const fromId = request.from?.id as number;
                  const avatarUrl = request.from?.avatarUrl ?? null;
                  const avatarLabel = (name || 'U').slice(0, 1).toUpperCase();

                  return (
                    <React.Fragment key={`req-${fromId}-${index}`}>
                      <XStack ai="center" jc="space-between" p="$3" bg="$backgroundPress" gap="$3">
                        <XStack ai="center" gap="$3" f={1}>
                          <UserAvatar
                            uri={avatarUrl ?? undefined}
                            label={avatarLabel}
                            size={40}
                            textSize={14}
                          />
                          <YStack f={1}>
                            <Text fontSize={16} fontWeight="600">{name}</Text>
                            {!!uid && (
                              <Text fontSize={13} color="$gray10">{uid}</Text>
                            )}
                          </YStack>
                        </XStack>
                        <FriendRequestActions
                          requesterId={fromId}
                          myUniqueId={myUniqueId}
                        />
                      </XStack>
                      {index < incoming.length - 1 && <Separator />}
                    </React.Fragment>
                  );
                })}
              </YStack>
            </YStack>
          )}

          {filteredFriends.length > 0 && (
            <YStack borderWidth={1} borderColor="$gray5" borderRadius={8} overflow="hidden">
              {filteredFriends.map((f, index) => (
                <React.Fragment key={f.user?.id ?? f.userId ?? f.uniqueId ?? index}>
                  <FriendListItem friend={f} />
                  {index < filteredFriends.length - 1 && <Separator />}
                </React.Fragment>
              ))}
            </YStack>
          )}

          {filteredFriends.length === 0 && incoming.length === 0 && !loading && (
             <Paragraph ta="center" col="$gray10" mt="$4">
                {searchQuery
                  ? t('friends.search.noResults', 'No friends found')
                  : t('friends.empty', 'No friends yet. Tap + to add.')
                }
              </Paragraph>
          )}
        </ScrollView>
      </YStack>

      <Fab onPress={() => router.push('/tabs/friends/requests')} />
    </YStack>
  );
}
