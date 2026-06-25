import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  YStack, XStack, Button, Spinner, Text, Input, ScrollView
} from 'tamagui';
import { Users as UsersIcon, Check } from '@tamagui/lucide-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFriendsStore } from '@/features/friends/model/friends.store';
import UserAvatar from '@/shared/ui/UserAvatar';
import { useAppStore } from '@/shared/lib/stores/app-store';
import { useGroupsStore } from '@/features/groups/model/groups.store';
import { useReceiptSessionStore } from '@/features/receipt/model/receipt-session.store';
import { useSessionsHistoryStore } from '@/features/sessions/model/history.store';
import { useTranslation } from 'react-i18next';

type LiteUser = { uniqueId: string; username: string; avatarUrl?: string | null };

export default function SessionParticipantsScreen() {
  const { t } = useTranslation();
  const { receiptId } = useLocalSearchParams<{ receiptId?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  // stores
  const me = useAppStore(s => s.user);
  const { friends, loading: friendsLoading, error: friendsError, fetchAll: fetchFriends } = useFriendsStore();
  const { groups, counts, fetchGroups, openGroup } = useGroupsStore();
  const historySessions = useSessionsHistoryStore((s) => s.sessions);
  const historyInitialized = useSessionsHistoryStore((s) => s.initialized);
  const fetchHistory = useSessionsHistoryStore((s) => s.fetchHistory);

  const session = useReceiptSessionStore((s) => s.session);
  const setReceiptParticipants = useReceiptSessionStore((s) => s.setParticipants);

  // -------- state --------
  const [q, setQ] = useState('');
  // Инициализируем пусто: «меня» добавим эффектом, когда будет доступен user
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [groupMembers, setGroupMembers] = useState<Record<number, LiteUser[]>>({});
  const [templatePeople, setTemplatePeople] = useState<Record<string, LiteUser>>({});
  const [groupLoading, setGroupLoading] = useState<Record<number, boolean>>({});
  // авто-добавленные из активной группы (чтобы корректно снимать при переключениях)
  const [autoFromGroup, setAutoFromGroup] = useState<Record<string, number | undefined>>({});
  const autoRef = useRef(autoFromGroup);
  useEffect(() => { autoRef.current = autoFromGroup; }, [autoFromGroup]);

  // -------- boot --------
  useEffect(() => { fetchFriends(); }, [fetchFriends]);
  useEffect(() => { fetchGroups(); }, [fetchGroups]);
  useEffect(() => {
    if (!historyInitialized) {
      fetchHistory(50).catch(() => {});
    }
  }, [fetchHistory, historyInitialized]);

  // robust me: берём uniqueId, иначе username, иначе id
  const meUid = useMemo(() => {
    return (me?.uniqueId || me?.username || (typeof me?.id === 'number' ? `id:${me.id}` : '')) as string;
  }, [me?.uniqueId, me?.username, me?.id]);
  const meName = useMemo(() => (me?.username || t('sessions.participants.you', 'You')) as string, [me?.username, t]);

  // гарантируем, что «я» всегда в selected = true при появлении user
  useEffect(() => {
    if (!meUid) return;
    setSelected(prev => ({ ...prev, [meUid]: true }));
  }, [meUid]);

  // helpers
  const dedupByUniqueId = (arr: LiteUser[]) => {
    const seen = new Set<string>();
    const out: LiteUser[] = [];
    for (const u of arr) {
      if (!u.uniqueId || seen.has(u.uniqueId)) continue;
      seen.add(u.uniqueId);
      out.push(u);
    }
    return out;
  };

  // Me FIRST + Friends («я» всегда есть в кандидатах)
  const basePeople: LiteUser[] = useMemo(() => {
    const res: LiteUser[] = [];
    if (meUid) res.push({ uniqueId: meUid, username: meName });
    (friends ?? []).forEach((f: any) => {
      const uid = f?.user?.uniqueId ?? f?.uniqueId;
      if (!uid) return;
      const uname = f?.user?.username ?? f?.username ?? uid;
      res.push({ uniqueId: uid, username: uname });
    });
    return res;
  }, [friends, meUid, meName]);

  // cache group members
  async function loadGroupMembers(gid: number): Promise<LiteUser[]> {
    if (groupMembers[gid]) return groupMembers[gid];
    setGroupLoading(m => ({ ...m, [gid]: true }));
    try {
      await openGroup(gid);
      const st = (useGroupsStore as any)?.getState?.();
      const raw = st?.current?.members ?? [];
      const mapped: LiteUser[] = raw
        .map((m: any) => ({
          uniqueId: m?.uniqueId ?? '',
          username: m?.username ?? (m?.uniqueId ?? ''),
        }))
        .filter((m: LiteUser) => !!m.uniqueId);
      setGroupMembers(mm => ({ ...mm, [gid]: mapped }));
      return mapped;
    } finally {
      setGroupLoading(m => ({ ...m, [gid]: false }));
    }
  }

  // снять авто-выбор конкретной группы из selected
  function stripAutoOfGroup(next: Record<string, boolean>, gid: number) {
    const auto = autoRef.current;
    Object.entries(auto).forEach(([uid, g]) => {
      if (g === gid) delete next[uid];
    });
  }

  // deactivate current group (toggle off)
  function deactivateGroup(gid: number) {
    setActiveGroupId(null);
    setSelected(prev => {
      const next = { ...prev };
      stripAutoOfGroup(next, gid);
      if (meUid) next[meUid] = true; // гарантируем «я»
      return next;
    });
    setAutoFromGroup(prev => {
      const cp: Record<string, number | undefined> = {};
      Object.entries(prev).forEach(([uid, g]) => { if (g !== gid) cp[uid] = g; });
      return cp;
    });
  }

  // activate / toggle group
  async function activateGroup(gid: number) {
    if (activeGroupId === gid) { deactivateGroup(gid); return; }

    // убираем авто-добавления предыдущей группы
    if (typeof activeGroupId === 'number') {
      setSelected(prev => {
        const next = { ...prev };
        stripAutoOfGroup(next, activeGroupId);
        if (meUid) next[meUid] = true;
        return next;
      });
      setAutoFromGroup(prev => {
        const cp: Record<string, number | undefined> = {};
        Object.entries(prev).forEach(([uid, g]) => { if (g !== activeGroupId) cp[uid] = g; });
        return cp;
      });
    }

    setActiveGroupId(gid);

    // если есть кэш — сразу применяем; иначе покажем «меня», потом дополним
    if (groupMembers[gid]) {
      const members = groupMembers[gid]!;
      setSelected(prev => {
        const next = { ...prev };
        const added: Record<string, number> = {};
        members.forEach(m => {
          if (!next[m.uniqueId]) { next[m.uniqueId] = true; added[m.uniqueId] = gid; }
        });
        if (meUid) next[meUid] = true;
        setAutoFromGroup(prevAuto => ({ ...prevAuto, ...added }));
        return next;
      });
      return;
    }

    setSelected(prev => {
      const next = { ...prev };
      if (meUid) next[meUid] = true;
      return next;
    });

    const members = await loadGroupMembers(gid);
    setSelected(prev => {
      const next = { ...prev };
      const added: Record<string, number> = {};
      members.forEach(m => {
        if (!next[m.uniqueId]) { next[m.uniqueId] = true; added[m.uniqueId] = gid; }
      });
      if (meUid) next[meUid] = true;
      setAutoFromGroup(prevAuto => ({ ...prevAuto, ...added }));
      return next;
    });
  }

  // candidates = Me + Friends + active group members (if any)
  const unionPeople: LiteUser[] = useMemo(() => {
    const fromGroup = activeGroupId ? (groupMembers[activeGroupId] || []) : [];
    return dedupByUniqueId([...basePeople, ...fromGroup, ...Object.values(templatePeople)]);
  }, [basePeople, activeGroupId, groupMembers, templatePeople]);

  const frequentTemplates = useMemo(() => {
    const buckets = new Map<
      string,
      { key: string; count: number; lastAt: number; people: LiteUser[]; sampleName: string }
    >();

    for (const entry of historySessions) {
      const people = (entry.participants ?? [])
        .filter((participant) => participant.uniqueId)
        .map((participant) => ({
          uniqueId: participant.uniqueId,
          username: participant.username || participant.uniqueId,
          avatarUrl: participant.avatarUrl,
        }));
      if (people.length < 2) continue;

      const key = people
        .map((person) => person.uniqueId)
        .sort((a, b) => a.localeCompare(b))
        .join('|');
      const dateValue = new Date(entry.finalizedAt || entry.createdAt || 0).getTime() || 0;
      const existing = buckets.get(key);
      if (existing) {
        existing.count += 1;
        existing.lastAt = Math.max(existing.lastAt, dateValue);
        continue;
      }
      buckets.set(key, {
        key,
        count: 1,
        lastAt: dateValue,
        people,
        sampleName: entry.sessionName || t('sessions.participants.templateFallback', 'Recent company'),
      });
    }

    return Array.from(buckets.values())
      .filter((template) => template.count >= 2)
      .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
      .slice(0, 3);
  }, [historySessions, t]);

  const filtered = useMemo(() => {
    if (!q) return unionPeople;
    const qq = q.toLowerCase();
    return unionPeople.filter(p =>
      p.username.toLowerCase().includes(qq) || p.uniqueId.toLowerCase().includes(qq)
    );
  }, [unionPeople, q]);

  // manual toggle: если юзера авто-добавила группа — снимаем метку, чтобы он остался при снятии группы
  const toggleUser = (uid: string) => {
    setSelected(s => ({ ...s, [uid]: !s[uid] }));
    setAutoFromGroup(prev => {
      if (prev[uid] !== undefined) {
        const cp = { ...prev };
        delete cp[uid];
        return cp;
      }
      return prev;
    });
  };

  const applyTemplate = (people: LiteUser[]) => {
    setTemplatePeople((prev) => {
      const next = { ...prev };
      people.forEach((person) => {
        next[person.uniqueId] = person;
      });
      return next;
    });
    setSelected((prev) => {
      const next = { ...prev };
      people.forEach((person) => {
        next[person.uniqueId] = true;
      });
      if (meUid) next[meUid] = true;
      return next;
    });
  };

  const selectedList = Object.keys(selected).filter(k => selected[k]);
  const canNext = selectedList.length >= 2;
  const selectedParticipants = useMemo(
    () => unionPeople.filter((p) => selected[p.uniqueId]),
    [selected, unionPeople]
  );

  const fmtUid = (uid: string) => `@${uid.toLowerCase().replace('user#', 'user')}`;
  const goNext = () => {
    const participants = unionPeople
      .filter(p => selected[p.uniqueId])
      .map(p => ({ uniqueId: p.uniqueId, username: p.username }));

    setReceiptParticipants(participants);

    const sessionId = session?.sessionId ? String(session.sessionId) : undefined;
    const params = new URLSearchParams();
    const effectiveReceiptId = receiptId ?? sessionId;
    if (effectiveReceiptId) params.set('receiptId', effectiveReceiptId);
    if (participants.length > 0) {
      params.set('participants', encodeURIComponent(JSON.stringify(participants)));
    }
    const qs = params.toString();
    const target = qs ? `/tabs/sessions/items-split?${qs}` : '/tabs/sessions/items-split';
    router.push(target as any);
  };

  // UI: Select pill (84×29)
  const SelectPill = ({ on, onPress }: { on: boolean; onPress: () => void }) => (
    <Button
      unstyled
      onPress={onPress}
      animation="bouncy"
      pressStyle={{ transform: [{ scale: 0.98 }] }}
      width={84}
      height={29}
      borderRadius={10}
      borderWidth={1}
      borderColor="$gray7"
      backgroundColor={on ? '$primary' : 'transparent'}
      ai="center"
      jc="center"
    >
      <Text fontSize={14} fontWeight="500" color={on ? '#FFFFFF' : '$gray11'}>
        {on ? t('sessions.participants.selected', 'Selected') : t('sessions.participants.select', 'Select')}
      </Text>
    </Button>
  );

  // group chip
  const GroupChip = ({
    id, name, count, active, loading, onPress,
  }: { id: number; name: string; count?: number; active?: boolean; loading?: boolean; onPress: () => void }) => (
    <Button
      unstyled
      onPress={onPress}
      animation="bouncy"
      pressStyle={{ transform: [{ scale: 0.98 }] }}
      h={32}
      px={12}
      borderRadius={18}
      borderWidth={1}
      borderColor={active ? '$primary' : '$gray7'}
      backgroundColor={active ? '$primary' : 'transparent'}
      ai="center"
      jc="center"
    >
      <XStack ai="center" gap="$1">
        <UsersIcon size={14} color={active ? '#FFFFFF' : '$gray11'} />
        <Text fontSize={14} fontWeight="500" color={active ? '#FFFFFF' : '$gray11'}>
          {name}
        </Text>
        <Text fontSize={12} color={active ? '#FFFFFF' : '$gray11'}>
          · {typeof count === 'number' ? count : (loading ? '…' : '—')}
        </Text>
        {loading && <Spinner size="small" color={active ? 'white' : '$gray10'} />}
        {active && !loading && <Check size={14} color="#FFFFFF" />}
      </XStack>
    </Button>
  );

  const groupCount = (id: number) =>
    (typeof counts?.[id] === 'number' ? counts![id] : (groupMembers[id]?.length));

  const TemplateChip = ({
    name,
    count,
    people,
  }: {
    name: string;
    count: number;
    people: LiteUser[];
  }) => (
    <Button
      unstyled
      onPress={() => applyTemplate(people)}
      h={32}
      px={12}
      borderRadius={18}
      borderWidth={1}
      borderColor="$gray7"
      backgroundColor="transparent"
      ai="center"
      jc="center"
      pressStyle={{ opacity: 0.85 }}
    >
      <XStack ai="center" gap="$1">
        <UsersIcon size={14} color="$gray11" />
        <Text fontSize={14} fontWeight="500" color="$gray11" numberOfLines={1}>
          {name}
        </Text>
        <Text fontSize={12} color="$gray10">
          В· {people.length} В· {count}x
        </Text>
      </XStack>
    </Button>
  );

  // space for fixed Next
  const bottomPad = (insets?.bottom ?? 0) + 72;

  return (
    <YStack f={1} bg="$background" p="$4" position="relative">
      <YStack
        p="$3"
        borderRadius={12}
        borderWidth={1}
        borderColor="$primary"
        bg="rgba(46,204,113,0.08)"
        gap="$1"
        mb="$3"
      >
        <Text fontSize={15} fontWeight="700" color="$primary">
          {t('sessions.participants.title', 'Choose participants')}
        </Text>
        <Text fontSize={12} color="$gray10" lineHeight={18}>
          {t(
            'sessions.participants.hint',
            'Only selected people will receive the finalized bill and see it in history.'
          )}
        </Text>
        <Text fontSize={12} color="$gray10" lineHeight={18}>
          {t(
            'sessions.participants.finalizeHint',
            'Notifications are sent after the bill is finalized, not at the scan step.'
          )}
        </Text>
      </YStack>

      {/* Groups */}
      {frequentTemplates.length > 0 && (
        <YStack gap="$2" mb="$2">
          <Text fontSize={13} fontWeight="700" color="$gray11">
            {t('sessions.participants.templates', 'Frequent companies')}
          </Text>
          <XStack flexWrap="wrap" gap="$2">
            {frequentTemplates.map((template) => (
              <TemplateChip
                key={template.key}
                name={template.sampleName}
                count={template.count}
                people={template.people}
              />
            ))}
          </XStack>
        </YStack>
      )}

      {(groups ?? []).length > 0 && (
        <XStack flexWrap="wrap" gap="$2" mb="$2">
          {(groups ?? []).map((g: any) => (
            <GroupChip
              key={g.id}
              id={g.id}
              name={g.name ?? `Group #${g.id}`}
              count={groupCount(g.id)}
              active={activeGroupId === g.id}
              loading={!!groupLoading[g.id]}
              onPress={() => activateGroup(g.id)}
            />
          ))}
        </XStack>
      )}

      {/* Search */}
      <Input
        placeholder={t('sessions.participants.search', 'Search…')}
        value={q}
        onChangeText={setQ}
        h={41}
        px={16}
        borderRadius={10}
        bg="$backgroundPress"
        borderWidth={0}
        mb="$3"
      />

      <YStack
        mb="$3"
        p="$3"
        borderRadius={12}
        borderWidth={1}
        borderColor="$gray5"
        bg="$color1"
        gap="$2"
      >
        <XStack ai="center" jc="space-between">
          <Text fontSize={13} color="$gray10">
            {t('sessions.participants.selectedSummary', 'Selected participants')}
          </Text>
          <Text fontSize={13} fontWeight="700" color="$color">
            {selectedParticipants.length}
          </Text>
        </XStack>
        <XStack flexWrap="wrap" gap="$2">
          {selectedParticipants.map((p) => (
            <XStack
              key={`sel-${p.uniqueId}`}
              ai="center"
              gap="$1"
              px="$2"
              py="$1"
              borderRadius={16}
              bg="rgba(46,204,113,0.1)"
            >
              <Text fontSize={12} fontWeight="600" color="$primary">
                {p.username}
              </Text>
            </XStack>
          ))}
        </XStack>
      </YStack>

      {/* List */}
      <ScrollView
        f={1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: bottomPad }}
      >
        <YStack borderWidth={1} borderColor="$gray5" borderRadius={8} overflow="hidden">
          {(friendsLoading && basePeople.length === 0) && (
            <XStack h={56} ai="center" jc="center"><Spinner /></XStack>
          )}

          {!!friendsError && (
            <XStack h={56} ai="center" jc="center">
              <Text color="$red10">{String(friendsError)}</Text>
            </XStack>
          )}

          {dedupByUniqueId(filtered).map((p, idx) => {
            const on = !!selected[p.uniqueId];
            const avatarUrl = p.avatarUrl ?? null;
            return (
              <React.Fragment key={p.uniqueId}>
                <XStack h={56} ai="center" jc="space-between" px="$4" bg="$color1">
                  <XStack ai="center" gap="$3">
                    <UserAvatar uri={avatarUrl ?? undefined} label={(p.username || "U").slice(0, 1).toUpperCase()} size={32} textSize={12} backgroundColor="$gray5" />
                    <YStack>
                      <Text fontSize={16} fontWeight="600" color="$color">{p.username}</Text>
                      <Text fontSize={12} color="$gray10">
                        @{p.uniqueId.toLowerCase().replace('user#', 'user')}
                      </Text>
                    </YStack>
                  </XStack>
                  <SelectPill on={on} onPress={() => toggleUser(p.uniqueId)} />
                </XStack>
                {idx < filtered.length - 1 && <XStack h={1} bg="$gray5" />}
              </React.Fragment>
            );
          })}
        </YStack>
      </ScrollView>

      {/* Fixed Next button */}
      <YStack
        position="absolute"
        left={0}
        right={0}
        bottom={(insets?.bottom ?? 0) + 8}
        ai="center"
        pointerEvents="box-none"
      >
        <Button
          unstyled
          onPress={goNext}
          disabled={!canNext}
          width={358}
          height={41}
          borderRadius={10}
          backgroundColor="$primary"
          ai="center"
          jc="center"
          opacity={canNext ? 1 : 0.5}
        >
          <Text fontSize={16} fontWeight="500" color="#FFFFFF" style={{ lineHeight: 25 }}>
            {t('sessions.participants.next', 'Next')}
          </Text>
        </Button>
        {!canNext && (
          <Text mt="$2" fontSize={12} color="$gray10" textAlign="center">
            {t(
              'sessions.participants.minimumHint',
              'Select at least two people to continue.'
            )}
          </Text>
        )}
      </YStack>
    </YStack>
  );
}
