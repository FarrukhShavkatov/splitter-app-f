import React, { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  YStack,
  XStack,
  Paragraph,
  Separator,
  Button,
  Spinner,
  Input,
  Text,
} from 'tamagui';
import { useTranslation } from 'react-i18next';
import { useFriendsStore } from '@/features/friends/model/friends.store';
import UserAvatar from '@/shared/ui/UserAvatar';
import { FriendRequestActions } from '@/features/friends/ui/FriendRequestActions';
import { useAppStore } from '@/shared/lib/stores/app-store';

const LIST_W = 358;
const ROW_H = 60;

function useAutoNotice() {
  const [text, setText] = useState<string | undefined>();
  const [kind, setKind] = useState<'success' | 'error' | undefined>();

  useEffect(() => {
    if (!text) return;
    const timeout = setTimeout(() => {
      setText(undefined);
      setKind(undefined);
    }, 2200);
    return () => clearTimeout(timeout);
  }, [text]);

  return {
    ok: (message: string) => {
      setKind('success');
      setText(message);
    },
    err: (message: string) => {
      setKind('error');
      setText(message);
    },
    node: text ? (
      <Paragraph col={kind === 'error' ? '$red10' : '$green10'}>{text}</Paragraph>
    ) : null,
  };
}

type UserLite = { uniqueId?: string; username?: string; displayName?: string; id?: number };

const MIN_SEARCH_QUERY_LENGTH = 2;
const SEARCH_DEBOUNCE_MS = 300;

interface UserRowProps {
  title: string;
  uid?: string;
  right?: React.ReactNode;
  index: number;
  total: number;
  avatarUrl?: string;
}

function UserRow({ title, uid, right, index, total, avatarUrl }: UserRowProps) {
  const isFirst = index === 0;
  const isLast = index === total - 1;
  const avatarLabel = (title || 'U').slice(0, 1).toUpperCase() || 'U';

  return (
    <XStack
      w={LIST_W}
      h={ROW_H}
      ai="center"
      jc="space-between"
      px={16}
      alignSelf="center"
      bg="$color1"
      borderColor="$gray5"
      borderLeftWidth={1}
      borderRightWidth={1}
      borderTopWidth={isFirst ? 1 : 0}
      borderBottomWidth={isLast ? 1 : 0}
    >
      <XStack ai="center" gap="$3">
        <UserAvatar
          uri={avatarUrl ?? undefined}
          label={avatarLabel}
          size={36}
          textSize={14}
          backgroundColor="$gray5"
        />
        <YStack>
          <Text fontSize={17} fontWeight="600">
            {title}
          </Text>
          {!!uid && (
            <Paragraph fontSize={14} color="$gray10">
              {uid}
            </Paragraph>
          )}
        </YStack>
      </XStack>
      {right}
    </XStack>
  );
}

export default function FriendsRequestsUnified() {
  const notice = useAutoNotice();
  const { t } = useTranslation();

  const { requestsRaw, fetchAll, loading, error, search, send, friends } = useFriendsStore();
  const meUniqueId = useAppStore((s) => s.user?.uniqueId);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<UserLite[]>([]);
  const [hasSearched, setHasSearched] = useState(false);
  const [searching, setSearching] = useState(false);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const searchRequestIdRef = useRef(0);
  const searchRef = useRef(search);
  const tRef = useRef(t);
  const noticeOkRef = useRef(notice.ok);
  const noticeErrRef = useRef(notice.err);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    noticeOkRef.current = notice.ok;
    noticeErrRef.current = notice.err;
  }, [notice]);

  const incoming = useMemo(() => requestsRaw?.incoming ?? [], [requestsRaw]);
  const outgoing = useMemo(() => requestsRaw?.outgoing ?? [], [requestsRaw]);

  const friendsSet = useMemo(() => {
    const set = new Set<string>();
    (friends ?? []).forEach((friend: any) => {
      const uid = friend?.user?.uniqueId ?? friend?.uniqueId;
      if (uid) set.add(uid);
    });
    return set;
  }, [friends]);

  const outgoingSet = useMemo(() => {
    const set = new Set<string>();
    (outgoing ?? []).forEach((request: any) => {
      const uid = request?.to?.uniqueId ?? request?.toUniqueId ?? request?.uniqueId;
      if (uid) set.add(uid);
    });
    return set;
  }, [outgoing]);

  const incomingSet = useMemo(() => {
    const set = new Set<string>();
    (incoming ?? []).forEach((request: any) => {
      const uid = request?.from?.uniqueId ?? request?.fromUniqueId ?? request?.uniqueId;
      if (uid) set.add(uid);
    });
    return set;
  }, [incoming]);

  const statusLabels = useMemo(
    () => ({
      add: t('friends.status.add', 'Add'),
      you: t('friends.status.you', 'You'),
      friend: t('friends.status.friend', 'Friend'),
      requested: t('friends.status.requested', 'Requested'),
      incoming: t('friends.status.incoming', 'Incoming'),
    }),
    [t]
  );

  const unknownUser = t('friends.common.unknownUser', 'Unknown user');

  const renderIncomingList = () => {
    if (incoming.length === 0) {
      return (
        <Paragraph col="$gray10" alignSelf="center" w={LIST_W}>
          {t('friends.requestsScreen.emptyIncoming', 'No incoming requests')}
        </Paragraph>
      );
    }

    return incoming.map((request: any, index: number) => {
      const name =
        request.from?.displayName ||
        request.from?.username ||
        (request.from?.id ? `User #${request.from.id}` : undefined) ||
        unknownUser;
      const uid = request.from?.uniqueId;
      const fromId = request.from?.id as number;
      const avatarUrl = request.from?.avatarUrl ?? null;

      return (
        <UserRow
          key={`in-${fromId}-${index}`}
          index={index}
          total={incoming.length}
          title={name}
          uid={uid}
          avatarUrl={avatarUrl ?? undefined}
          right={
            meUniqueId ? (
              <FriendRequestActions
                requesterId={fromId}
                myUniqueId={meUniqueId}
                onAccepted={() =>
                  notice.ok(t('friends.requestsScreen.accepted', { target: name }))
                }
                onRejected={() =>
                  notice.ok(t('friends.requestsScreen.rejected', { target: name }))
                }
                onError={(message) => notice.err(message)}
              />
            ) : null
          }
        />
      );
    });
  };

  const runSearch = useCallback(async (value: string, notifyOnEmpty = false) => {
    const trimmed = value.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      searchRequestIdRef.current += 1;
      setResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    const requestId = ++searchRequestIdRef.current;
    setSearching(true);
    try {
      const response = await searchRef.current(trimmed);
      if (requestId !== searchRequestIdRef.current) return;
      setResults(response || []);
    } catch (error: any) {
      if (requestId !== searchRequestIdRef.current) return;
      noticeErrRef.current(
        error?.message ?? tRef.current('friends.search.error', 'Search failed')
      );
      setResults([]);
    } finally {
      if (requestId === searchRequestIdRef.current) {
        setHasSearched(true);
        setSearching(false);
      }
    }
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed || trimmed.length < MIN_SEARCH_QUERY_LENGTH) {
      searchRequestIdRef.current += 1;
      setResults([]);
      setHasSearched(false);
      setSearching(false);
      return;
    }

    const timeout = setTimeout(() => {
      void runSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);

    return () => clearTimeout(timeout);
  }, [query, runSearch]);

  async function sendInvite(uniqueId?: string, label?: string) {
    if (!uniqueId) return;
    setSendingId(uniqueId);
    try {
      await send(uniqueId);
      const target = label ?? uniqueId ?? unknownUser;
      notice.ok(t('friends.search.inviteSent', { target }));
    } catch (error: any) {
      notice.err(error?.message ?? t('friends.search.inviteFailed', 'Could not send invite'));
    } finally {
      setSendingId(null);
    }
  }

  const onSubmitSearch = () => {
    if (!searching) {
      void runSearch(query, true);
    }
  };

  return (
    <YStack f={1} p="$4" gap="$4" bg="$background">
      {notice.node}
      {error && <Paragraph col="$red10">{error}</Paragraph>}

      <YStack
        alignSelf="center"
        w={LIST_W}
        p="$3"
        borderRadius={12}
        borderWidth={1}
        borderColor="$primary"
        bg="rgba(46,204,113,0.08)"
        gap="$1"
      >
        <Text fontSize={15} fontWeight="700" color="$primary">
          {t('friends.requestsScreen.title', 'Friend requests')}
        </Text>
        <Paragraph color="$gray10">
          {t(
            'friends.requestsScreen.hint',
            'Open Incoming to accept requests. Accepted friends will appear in split participants right away.'
          )}
        </Paragraph>
      </YStack>

      <YStack gap="$2" alignSelf="center" w={LIST_W}>
        <Text fontSize={15} fontWeight="700" color="$color">
          {t('friends.requestsScreen.tabIncoming', 'Incoming')}
        </Text>
        {loading && incoming.length === 0 ? <Spinner /> : renderIncomingList()}
      </YStack>

      <Separator />

      {/* Search */}
      <XStack ai="center" alignSelf="center">
        <Input
          w={LIST_W}
          value={query}
          onChangeText={setQuery}
          placeholder={t('friends.search.placeholder', 'Enter User ID or Username')}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          onSubmitEditing={onSubmitSearch}
          h={41}
          px={16}
          borderRadius={10}
          fontSize={14}
          fontWeight="500"
          bg="$backgroundPress"
          borderWidth={0}
          color="$gray12"
          placeholderTextColor="$gray10"
        />
      </XStack>

      {/* Search results */}
      {searching ? (
        <Spinner />
      ) : results.length === 0 && hasSearched ? (
        <Paragraph col="$gray10">
          {t('friends.search.notFound', 'User not found')}
        </Paragraph>
      ) : results.length > 0 ? (
        <>
          <Separator />
          {results.map((user, index) => {
            const uid = user.uniqueId;
            const avatarUrl = (user as any)?.avatarUrl ?? (user as any)?.user?.avatarUrl ?? undefined;
            const fallbackTitle = user.displayName || user.username || uid;
            const title = fallbackTitle || unknownUser;

            const isMe = !!uid && !!meUniqueId && uid === meUniqueId;
            const isFriend = !!uid && friendsSet.has(uid);
            const isOutgoing = !!uid && outgoingSet.has(uid);
            const isIncoming = !!uid && incomingSet.has(uid);

            let label = statusLabels.add;
            let disabled = false;
            if (isMe) {
              label = statusLabels.you;
              disabled = true;
            } else if (isFriend) {
              label = statusLabels.friend;
              disabled = true;
            } else if (isOutgoing) {
              label = statusLabels.requested;
              disabled = true;
            } else if (isIncoming) {
              label = statusLabels.incoming;
              disabled = true;
            }

            const isBusy = sendingId === uid;

            return (
              <UserRow
                key={`${uid ?? 'u'}-${index}`}
                index={index}
                total={results.length}
                title={title}
                uid={uid}
                avatarUrl={avatarUrl}
                right={
                  <Button
                    size="$2"
                    borderRadius={10}
                    borderWidth={1}
                    h={37}
                    px={10}
                    gap={10}
                    onPress={() => sendInvite(uid, title)}
                    disabled={!uid || disabled || isBusy}
                  >
                    {isBusy ? '...' : label}
                  </Button>
                }
              />
            );
          })}
        </>
      ) : null}

      <Separator />
      <Text fontSize={15} fontWeight="700" color="$color" alignSelf="center" w={LIST_W}>
        {t('friends.requestsScreen.tabOutgoing', 'Outgoing')}
      </Text>
      {outgoing.length === 0 ? (
        <Paragraph col="$gray10" alignSelf="center" w={LIST_W}>
          {t('friends.requestsScreen.emptyOutgoing', 'No outgoing requests')}
        </Paragraph>
      ) : (
        outgoing.map((request: any, index: number) => {
          const name =
            request.to?.displayName ||
            request.to?.username ||
            request.to?.uniqueId ||
            unknownUser;
          const uid = request.to?.uniqueId;
          const avatarUrl = request.to?.avatarUrl ?? null;

          return (
            <UserRow
              key={`out-${uid ?? index}`}
              index={index}
              total={outgoing.length}
              title={name}
              uid={uid}
              avatarUrl={avatarUrl ?? undefined}
              right={
                <Paragraph size="$2" col="$gray10">
                  {t('friends.requestsScreen.requestedLabel', 'Requested')}
                </Paragraph>
              }
            />
          );
        })
      )}
    </YStack>
  );
}
