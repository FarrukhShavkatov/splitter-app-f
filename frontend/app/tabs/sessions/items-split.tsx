import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable } from 'react-native';
import { YStack, XStack, Text, Button, Circle, ScrollView, Spinner } from 'tamagui';
import { Users as UsersIcon, Check, Plus, Minus, Package as PackageIcon, Pencil } from '@tamagui/lucide-icons';
import Input from '@/shared/ui/Input';

import { useAppStore } from '@/shared/lib/stores/app-store';
import { useReceiptSessionStore } from '@/features/receipt/model/receipt-session.store';
import type { FinishPayload, ReceiptSplitItem } from '@/features/receipt/model/receipt-session.store';
import { ReceiptApi } from '@/features/receipt/api/receipt.api';
import { useTranslation } from 'react-i18next';
import type { FinalizeReceiptItemPayload, FinalizeTotalsByItem, FinalizeTotalsByParticipant, ReceiptAllocation } from '@/features/receipt/api/receipt.api';
import { formatCurrencyAmount, getCurrencyParts as splitCurrencyParts } from '@/shared/lib/currency';

// ===== Types =====
type Participant = { uniqueId: string; username: string };
type SplitMode = 'equal' | 'warikan' | 'count' | 'proportional' | 'excluded' | undefined;
type Item = {
  id: string;
  name: string;
  price: number;
  quantity: number;
  assignedTo: string[];
  perPersonCount?: Record<string, number>;
  splitMode?: SplitMode;
  kind?: string;
  totalPrice?: number;
};

// ===== Mock Data =====
const MOCK_ITEMS: Item[] = [
  {
    id: '1',
    name: 'Pizza Margherita',
    price: 89000,
    quantity: 2,
    assignedTo: [],
    perPersonCount: {},
    splitMode: 'count',
    totalPrice: 178000
  },
  {
    id: '2',
    name: 'Caesar Salad',
    price: 45000,
    quantity: 1,
    assignedTo: [],
    perPersonCount: {},
    splitMode: 'equal',
    totalPrice: 45000
  },
  {
    id: '3',
    name: 'Cola',
    price: 10000,
    quantity: 5,
    assignedTo: [],
    perPersonCount: {},
    splitMode: 'count',
    totalPrice: 50000
  },
  {
    id: '4',
    name: 'Tiramisu',
    price: 32000,
    quantity: 1,
    assignedTo: [],
    perPersonCount: {},
    splitMode: 'equal',
    totalPrice: 32000
  },
  {
    id: '5',
    name: 'Soup of the day',
    price: 28000,
    quantity: 1,
    assignedTo: [],
    perPersonCount: {},
    splitMode: 'equal',
    totalPrice: 28000
  },
];

const cloneItems = (source: Item[]): Item[] =>
  source.map((item) => ({
    ...item,
    assignedTo: [...item.assignedTo],
    perPersonCount: item.perPersonCount ? { ...item.perPersonCount } : {},
  }));

const ensureMode = (item: Item): Exclude<SplitMode, undefined> =>
  item.splitMode === 'count' ||
  item.splitMode === 'warikan' ||
  item.splitMode === 'proportional' ||
  item.splitMode === 'excluded'
    ? item.splitMode
    : 'equal';

const toLocalItems = (source: ReceiptSplitItem[]): Item[] =>
  source.map((item) => ({
    id: item.id,
    name: item.name,
    price: item.unitPrice,
    quantity: item.quantity,
    assignedTo: [...item.assignedTo],
    perPersonCount: item.perPersonCount ? { ...item.perPersonCount } : {},
    splitMode: item.splitMode ?? (item.quantity > 1 ? 'count' : 'equal'),
    kind: item.kind,
    totalPrice: item.totalPrice,
  }));

const toStoreItems = (source: Item[]): ReceiptSplitItem[] =>
  source.map((item) => {
    const mode = ensureMode(item);
    const perPersonEntries = Object.entries(item.perPersonCount ?? {}).filter(
      ([, value]) => typeof value === 'number' && value > 0
    );
    const perPersonCount = perPersonEntries.reduce<Record<string, number>>((acc, [uid, count]) => {
      acc[uid] = count;
      return acc;
    }, {});

    const assignedTo = mode === 'equal' || mode === 'warikan' ? [...(item.assignedTo || [])] : [];

    return {
      id: item.id,
      name: item.name,
      unitPrice: item.price,
      quantity: item.quantity,
      totalPrice: typeof item.totalPrice === 'number' ? item.totalPrice : item.price * item.quantity,
      kind: item.kind,
      splitMode: mode,
      assignedTo,
      perPersonCount: mode === 'count' ? perPersonCount : {},
    };
  });

const computeItemTotal = (item: Item) =>
  typeof item.totalPrice === 'number' ? item.totalPrice : item.price * item.quantity;

const toMinorUnits = (amount: number) => Math.round(amount * 100);
const fromMinorUnits = (amount: number) => Math.round(amount) / 100;

const buildWarikanAllocations = (
  warikanItems: Item[],
  participants: Participant[],
  organizerId?: string
) => {
  const participantIds = participants.map((participant) => participant.uniqueId);
  const safeOrganizerId =
    organizerId && participantIds.includes(organizerId) ? organizerId : participantIds[0];

  if (!safeOrganizerId || participantIds.length === 0 || warikanItems.length === 0) {
    return {
      allocations: [] as ReceiptAllocation[],
      participantTotals: {} as Record<string, number>,
    };
  }

  const totalMinor = warikanItems.reduce(
    (sum, item) => sum + toMinorUnits(computeItemTotal(item)),
    0
  );
  const baseShare = Math.floor(totalMinor / participantIds.length);
  const remainder = totalMinor - baseShare * participantIds.length;
  const remainingTargets = new Map<string, number>();
  participantIds.forEach((participantId) => {
    remainingTargets.set(participantId, baseShare);
  });
  remainingTargets.set(
    safeOrganizerId,
    (remainingTargets.get(safeOrganizerId) ?? 0) + remainder
  );

  const participantTotals = participantIds.reduce<Record<string, number>>((acc, participantId) => {
    acc[participantId] = 0;
    return acc;
  }, {});
  const allocations: ReceiptAllocation[] = [];

  for (const item of warikanItems) {
    const itemTotalMinor = toMinorUnits(computeItemTotal(item));
    let itemRemaining = itemTotalMinor;

    participantIds.forEach((participantId) => {
      if (itemRemaining <= 0) return;
      const targetRemaining = remainingTargets.get(participantId) ?? 0;
      if (targetRemaining <= 0) return;

      const shareMinor = Math.min(targetRemaining, itemRemaining);
      if (shareMinor <= 0) return;

      remainingTargets.set(participantId, targetRemaining - shareMinor);
      itemRemaining -= shareMinor;

      const shareAmount = fromMinorUnits(shareMinor);
      participantTotals[participantId] = (participantTotals[participantId] ?? 0) + shareAmount;
      allocations.push({
        itemId: item.id,
        participantId,
        shareAmount,
        shareRatio: itemTotalMinor > 0 ? shareMinor / itemTotalMinor : 0,
        splitMode: 'warikan',
      });
    });

    if (itemRemaining > 0) {
      const organizerRemaining = remainingTargets.get(safeOrganizerId) ?? 0;
      remainingTargets.set(
        safeOrganizerId,
        Math.max(0, organizerRemaining - itemRemaining)
      );
      const shareAmount = fromMinorUnits(itemRemaining);
      participantTotals[safeOrganizerId] =
        (participantTotals[safeOrganizerId] ?? 0) + shareAmount;
      allocations.push({
        itemId: item.id,
        participantId: safeOrganizerId,
        shareAmount,
        shareRatio: itemTotalMinor > 0 ? itemRemaining / itemTotalMinor : 0,
        splitMode: 'warikan',
      });
    }
  }

  return { allocations, participantTotals };
};

const buildLocalFinalization = (
  items: Item[],
  participants: Participant[],
  organizerId?: string
) => {
  const totalsByItem: FinalizeTotalsByItem[] = [];
  const allocations: ReceiptAllocation[] = [];
  const proportionalItems: Item[] = [];
  const warikanItems: Item[] = [];

  const participantTotals = participants.reduce<Record<string, number>>((acc, participant) => {
    acc[participant.uniqueId] = 0;
    return acc;
  }, {});

  const addItemTotal = (item: Item, mode: Exclude<SplitMode, undefined>) => {
    const total = computeItemTotal(item);
    totalsByItem.push({
      itemId: item.id,
      name: item.name,
      total,
      splitMode: mode,
      excluded: mode === 'excluded',
    });
    return total;
  };

  for (const item of items) {
    const mode = ensureMode(item);
    const total = addItemTotal(item, mode);

    if (mode === 'excluded') {
      continue;
    }

    if (mode === 'proportional') {
      proportionalItems.push(item);
      continue;
    }

    if (mode === 'warikan') {
      warikanItems.push(item);
      continue;
    }

    if (mode === 'count') {
      const perPersonCount = item.perPersonCount ?? {};
      for (const [uid, rawCount] of Object.entries(perPersonCount)) {
        const count = Number(rawCount);
        if (!uid || Number.isNaN(count) || count <= 0) continue;

        const shareAmount = count * item.price;
        if (!(uid in participantTotals)) {
          participantTotals[uid] = 0;
        }
        participantTotals[uid] = (participantTotals[uid] ?? 0) + shareAmount;

        allocations.push({
          itemId: item.id,
          participantId: uid,
          shareAmount,
          shareUnits: count,
          splitMode: mode,
        });
      }

      continue;
    }

    const assigned = (item.assignedTo ?? []).filter(Boolean);
    const shareCount = assigned.length;
      if (shareCount === 0) {
      console.warn(`Item ${item.id} (${item.name}) has equal split mode but no assigned participants`);
    continue;
    } 

    const shareAmount = total / shareCount;
    const shareRatio = 1 / shareCount;

    assigned.forEach((uid) => {
      if (!(uid in participantTotals)) {
        participantTotals[uid] = 0;
      }
      participantTotals[uid] = (participantTotals[uid] ?? 0) + shareAmount;

      allocations.push({
        itemId: item.id,
        participantId: uid,
        shareAmount,
        shareRatio,
        splitMode: mode,
      });
    });
  }

  if (warikanItems.length > 0) {
    const warikanResult = buildWarikanAllocations(warikanItems, participants, organizerId);
    warikanResult.allocations.forEach((allocation) => {
      allocations.push(allocation);
      participantTotals[allocation.participantId] =
        (participantTotals[allocation.participantId] ?? 0) + allocation.shareAmount;
    });
  }

  for (const item of proportionalItems) {
    const total = computeItemTotal(item);
    const baseTotal = participants.reduce(
      (sum, participant) => sum + (participantTotals[participant.uniqueId] ?? 0),
      0
    );
    let allocated = 0;

    participants.forEach((participant, index) => {
      const ratio =
        baseTotal > 0
          ? (participantTotals[participant.uniqueId] ?? 0) / baseTotal
          : 1 / Math.max(1, participants.length);
      let shareAmount = total * ratio;
      if (index === participants.length - 1) {
        shareAmount = total - allocated;
      }
      shareAmount = Math.round(shareAmount * 100) / 100;
      allocated = Math.round((allocated + shareAmount) * 100) / 100;
      participantTotals[participant.uniqueId] =
        (participantTotals[participant.uniqueId] ?? 0) + shareAmount;
      allocations.push({
        itemId: item.id,
        participantId: participant.uniqueId,
        shareAmount,
        shareRatio: ratio,
        splitMode: 'proportional',
      });
    });
  }

  const totalsByParticipant: FinalizeTotalsByParticipant[] = participants.map((participant) => ({
    uniqueId: participant.uniqueId,
    username: participant.username,
    amountOwed: Math.round((participantTotals[participant.uniqueId] ?? 0) * 100) / 100,
  }));

  const grandTotal = totalsByItem.reduce((acc, entry) => acc + entry.total, 0);

  return {
    totalsMap: participantTotals,
    totalsByParticipant,
    totalsByItem,
    allocations,
    grandTotal,
  };
};
// ===== Helpers =====
const parseParticipantsParam = (raw?: string): Participant[] => {
  if (!raw) return [];
  try {
    const decoded = decodeURIComponent(raw);
    return JSON.parse(decoded);
  } catch {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
};

export default function ItemsSplitScreen() {
  const { t } = useTranslation();
  const { participants: participantsParam, receiptId } = useLocalSearchParams<{
    participants?: string;
    receiptId?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const me = useAppStore((s) => s.user);
  const session = useReceiptSessionStore((s) => s.session);
  const storeItems = useReceiptSessionStore((s) => s.items);
  const storeParticipants = useReceiptSessionStore((s) => s.participants);
  const setStoreItems = useReceiptSessionStore((s) => s.setItems);
  const setLastFinishPayload = useReceiptSessionStore((s) => s.setLastFinishPayload);

  const storeCurrency = useReceiptSessionStore((s) => s.currency);

  const fmtCurrency = useCallback((n: number) => {
    return formatCurrencyAmount(n, storeCurrency);
  }, [storeCurrency]);

  const getCurrencyParts = useCallback((n: number) => {
    return splitCurrencyParts(n, storeCurrency);
  }, [storeCurrency]);

  const [items, setLocalItems] = useState<Item[]>([]);

  type Editing = {
    id: string;
    splitMode: SplitMode;
    assignedTo: string[];
    perPersonCount: Record<string, number>;
  } | null;
  
  const [editing, setEditing] = useState<Editing>(null);
  type ItemMetaEditing = {
    id: string;
    name: string;
    price: string;
    quantity: string;
  } | null;
  const [itemMetaEdit, setItemMetaEdit] = useState<ItemMetaEditing>(null);
  const [saving, setSaving] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const participantsFromParams = useMemo(
    () => parseParticipantsParam(participantsParam),
    [participantsParam]
  );

  const participants = useMemo<Participant[]>(() => {
    const source =
      (storeParticipants?.length ?? 0) > 0 ? storeParticipants : participantsFromParams;
    const base =
      source.length > 0
        ? source
        : me?.uniqueId
        ? [{ uniqueId: me.uniqueId, username: me.username || me.uniqueId }]
        : [];

    const normalized = base.map((p) => ({
      uniqueId: p.uniqueId,
      username: p.username || p.uniqueId,
    }));

    const meId = me?.uniqueId;
    const sorted = [...normalized].sort((a, b) => {
      if (meId && a.uniqueId === meId) return -1;
      if (meId && b.uniqueId === meId) return 1;
      return (a.username || '').localeCompare(b.username || '');
    });

    return sorted;
  }, [storeParticipants, participantsFromParams, me?.uniqueId, me?.username]);

  const isMockSession = receiptId === 'mock-001';
  const sessionReceiptId = receiptId ?? (session ? String(session.sessionId) : undefined);

  const loadItemsFromSource = useCallback(() => {
    const hasStoreItems = Array.isArray(storeItems) && storeItems.length > 0;
    if (hasStoreItems) {
      setLocalItems(toLocalItems(storeItems));
    } else if (isMockSession) {
      const fallback = cloneItems(MOCK_ITEMS);
      setLocalItems(fallback);
      setStoreItems(toStoreItems(fallback));
    } else {
      setLocalItems([]);
    }
    setEditing(null);
    setSaving(false);
    setShowSuccess(false);
  }, [storeItems, isMockSession, setStoreItems]);

  const resetState = useCallback(() => {
    loadItemsFromSource();
  }, [loadItemsFromSource]);

  useEffect(() => {
    resetState();
  }, [resetState]);

  useFocusEffect(
    useCallback(() => {
      resetState();
    }, [resetState])
  );

  const commitItems = useCallback(
    (updater: (prev: Item[]) => Item[]) => {
      let nextForStore: Item[] | null = null;
      setLocalItems((prev) => {
        const next = updater(prev);
        const changed =
          next.length !== prev.length || next.some((item, index) => item !== prev[index]);
        if (!changed) {
          return prev;
        }
        nextForStore = next;
        return next;
      });
      if (nextForStore) {
        setStoreItems(toStoreItems(nextForStore));
      }
    },
    [setStoreItems]
  );

  // --- derived ---
  const countAssignedUnits = (it: Item) =>
    Object.values(it.perPersonCount || {}).reduce((a, b) => a + (b || 0), 0);

  const isPartiallyAssigned = (it: Item) => {
    const mode = ensureMode(it);
    if (mode === 'excluded' || mode === 'proportional' || mode === 'warikan') {
      return true;
    }
    if (mode === 'count') {
      return countAssignedUnits(it) > 0;
    }
    return (it.assignedTo?.length ?? 0) > 0;
  };

  const isFullyAssigned = (it: Item) => {
    const mode = ensureMode(it);
    if (mode === 'excluded' || mode === 'proportional' || mode === 'warikan') {
      return true;
    }
    if (mode === 'count') {
      const units = countAssignedUnits(it);
      const required = Math.max(1, it.quantity || 0);
      return units >= required;
    }
    return (it.assignedTo?.length ?? 0) > 0;
  };

  const assignedCount = useMemo(
    () => items.reduce((acc, it) => acc + (isFullyAssigned(it) ? 1 : 0), 0),
    [items]
  );

  const totalItems = items.length;
  const canContinue = assignedCount === totalItems && totalItems > 0;
  const participantAssignmentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    participants.forEach((p) => counts.set(p.uniqueId, 0));
    items.forEach((it) => {
      const mode = ensureMode(it);
      if (mode === 'excluded' || mode === 'proportional') return;
      const ids =
        mode === 'count'
          ? Object.entries(it.perPersonCount || {})
              .filter(([, count]) => (count || 0) > 0)
              .map(([uid]) => uid)
          : mode === 'warikan'
            ? participants.map((participant) => participant.uniqueId)
            : it.assignedTo || [];
      Array.from(new Set(ids)).forEach((uid) => {
        counts.set(uid, (counts.get(uid) || 0) + 1);
      });
    });
    return participants.map((p) => ({
      ...p,
      count: counts.get(p.uniqueId) || 0,
    }));
  }, [items, participants]);

  useEffect(() => {
    if (!canContinue && submitError) {
      setSubmitError(null);
    }
  }, [canContinue, submitError]);

  // --- modal helpers ---
  const editingItem = editing ? items.find((it) => it.id === editing.id) : null;
  const editingTotal = editingItem
    ? typeof editingItem.totalPrice === 'number'
      ? editingItem.totalPrice
      : editingItem.price * editingItem.quantity
    : 0;
  const editingPriceParts = getCurrencyParts(editingTotal);
  const effectiveMode =
    editing?.splitMode || (editingItem?.quantity && editingItem.quantity > 1 ? 'count' : 'equal');
  const isEqualMode = effectiveMode === 'equal';
  const isWarikanMode = effectiveMode === 'warikan';
  const isCountMode = effectiveMode === 'count';
  const isProportionalMode = effectiveMode === 'proportional';
  const isExcludedMode = effectiveMode === 'excluded';

  function openItemMetaModal(it: Item) {
    setItemMetaEdit({
      id: it.id,
      name: it.name,
      price: String(it.price),
      quantity: String(it.quantity),
    });
  }

  function closeItemMetaModal() {
    setItemMetaEdit(null);
  }

  function saveItemMeta() {
    if (!itemMetaEdit) return;
    const price = Number(itemMetaEdit.price);
    const quantity = Math.max(1, Math.floor(Number(itemMetaEdit.quantity) || 1));
    const name = itemMetaEdit.name.trim();
    if (!name || !Number.isFinite(price) || price < 0) return;

    commitItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemMetaEdit.id) return it;
        return {
          ...it,
          name,
          price,
          quantity,
          totalPrice: price * quantity,
        };
      })
    );
    closeItemMetaModal();
  }

  function deleteItemMeta() {
    if (!itemMetaEdit) return;
    commitItems((prev) => prev.filter((it) => it.id !== itemMetaEdit.id));
    closeItemMetaModal();
  }

  function openAssignModal(it: Item) {
    const initialMode: SplitMode = it.splitMode ?? (it.quantity > 1 ? 'count' : 'equal');
    const assigned =
      initialMode === 'equal' || initialMode === 'warikan' ? [...(it.assignedTo || [])] : [];
    const perCount = initialMode === 'count' ? { ...(it.perPersonCount || {}) } : {};

    setEditing({
      id: it.id,
      splitMode: initialMode,
      assignedTo: assigned,
      perPersonCount: perCount,
    });
  }

  function closeAssignModal() {
    setEditing(null);
  }

  function modalAll() {
    if (!editing) return;
    setEditing({
      ...editing,
      splitMode: 'equal',
      assignedTo: participants.map((p) => p.uniqueId),
      perPersonCount: {},
    });
  }

  function modalClear() {
    if (!editing) return;
    setEditing({
      ...editing,
      splitMode: effectiveMode,
      assignedTo: [],
      perPersonCount: {},
    });
  }

  function switchToEqual() {
    if (!editing) return;
    const participantsWithUnits = Object.entries(editing.perPersonCount)
      .filter(([, value]) => (value || 0) > 0)
      .map(([uid]) => uid);
    const baseAssigned = editing.assignedTo.length ? editing.assignedTo : participantsWithUnits;

    setEditing({
      ...editing,
      splitMode: 'equal',
      assignedTo: baseAssigned,
      perPersonCount: {},
    });
  }

  function switchToWarikan() {
    if (!editing) return;
    setEditing({
      ...editing,
      splitMode: 'warikan',
      assignedTo: participants.map((p) => p.uniqueId),
      perPersonCount: {},
    });
  }

  function switchToCount() {
    if (!editing || !editingItem) return;

    const existing = Object.entries(editing.perPersonCount).filter(
      ([, value]) => (value || 0) > 0
    );

    if (existing.length === 0 && editing.assignedTo.length > 0) {
      let remaining = editingItem.quantity;
      const counts: Record<string, number> = {};
      editing.assignedTo.forEach((uid) => {
        if (remaining <= 0) return;
        counts[uid] = 1;
        remaining -= 1;
      });

      setEditing({
        ...editing,
        splitMode: 'count',
        assignedTo: [],
        perPersonCount: counts,
      });
      return;
    }

    setEditing({
      ...editing,
      splitMode: 'count',
      assignedTo: [],
      perPersonCount: { ...editing.perPersonCount },
    });
  }

  function switchToProportional() {
    if (!editing) return;
    setEditing({
      ...editing,
      splitMode: 'proportional',
      assignedTo: [],
      perPersonCount: {},
    });
  }

  function switchToExcluded() {
    if (!editing) return;
    setEditing({
      ...editing,
      splitMode: 'excluded',
      assignedTo: [],
      perPersonCount: {},
    });
  }

  function modalToggleUser(uid: string) {
    if (!editing || !editingItem) return;
    if (effectiveMode === 'proportional' || effectiveMode === 'excluded' || effectiveMode === 'warikan') return;

    if (effectiveMode === 'count') {
      const current = editing.perPersonCount[uid] || 0;
      const next = { ...editing.perPersonCount };

      if (current > 0) {
        delete next[uid];
      } else {
        const othersTotal = Object.entries(editing.perPersonCount)
          .filter(([key]) => key !== uid)
          .reduce((sum, [, value]) => sum + (value || 0), 0);

        if (othersTotal >= editingItem.quantity) return;
        next[uid] = 1;
      }

      setEditing({
        ...editing,
        splitMode: 'count',
        assignedTo: [],
        perPersonCount: next,
      });
      return;
    }

    const has = editing.assignedTo.includes(uid);
    const next = has
      ? editing.assignedTo.filter((x) => x !== uid)
      : [...editing.assignedTo, uid];

    setEditing({
      ...editing,
      splitMode: 'equal',
      assignedTo: next,
      perPersonCount: {},
    });
  }

  function modalInc(uid: string) {
    if (!editing || !editingItem) return;
    const next = { ...editing.perPersonCount };
    const sum = Object.values(next).reduce((a, b) => a + (b || 0), 0);
    if (sum >= editingItem.quantity) return;

    next[uid] = (next[uid] || 0) + 1;
    setEditing({
      ...editing,
      splitMode: 'count',
      perPersonCount: next,
      assignedTo: [],
    });
  }

  function modalDec(uid: string) {
    if (!editing) return;
    const next = { ...editing.perPersonCount };
    const v = (next[uid] || 0) - 1;
    if (v <= 0) delete next[uid];
    else next[uid] = v;

    setEditing({
      ...editing,
      splitMode: 'count',
      perPersonCount: next,
      assignedTo: [],
    });
  }

  async function modalSave() {
  if (!editing) return;
  const mode: Exclude<SplitMode, undefined> =
    editing.splitMode ?? ((editingItem?.quantity && editingItem.quantity > 1) ? 'count' : 'equal');

  setSaving(true);
  try {
    commitItems((prev) =>
      prev.map((it) => {
        if (it.id !== editing.id) return it;
        
        // Ensure we preserve the assignments correctly
        const assignedTo =
          mode === 'equal' || mode === 'warikan' ? [...(editing.assignedTo || [])] : [];
        const perPersonCount = mode === 'count' ? { ...(editing.perPersonCount || {}) } : {};
        
        return {
          ...it,
          splitMode: mode,
          assignedTo,
          perPersonCount,
        };
      })
    );
    setEditing(null);
  } finally {
    setSaving(false);
  }
}

  // --- finalize and navigate ---
  const onContinue = useCallback(async () => {
  if (!canContinue || finalizing) return;

  setSubmitError(null);
  setFinalizing(true);

  try {
    setStoreItems(toStoreItems(items));

    const finalizeItems: FinalizeReceiptItemPayload[] = items.map((item) => {
      const mode = ensureMode(item);

      const payload: FinalizeReceiptItemPayload = {
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        kind: item.kind,
        splitMode: mode,
        assignedTo: mode === 'equal' || mode === 'warikan' ? (item.assignedTo || []) : undefined,
        perPersonCount: mode === 'count' ? (item.perPersonCount || {}) : undefined,
      };

  // Debug log
  console.log('Finalizing item:', {
    id: item.id,
    name: item.name,
    mode,
    assignedTo: payload.assignedTo,
    perPersonCount: payload.perPersonCount,
  });

  return payload;
});

      const effectiveSessionId =
      session?.sessionId ??
      (sessionReceiptId && !isMockSession ? parseInt(sessionReceiptId, 10) : undefined);

    if (!effectiveSessionId) {
      throw new Error('Session ID is required');
    }

      const fallbackFinalization = buildLocalFinalization(items, participants, me?.uniqueId);

      const result = await ReceiptApi.finalize({
      sessionId: effectiveSessionId,
      sessionName: session?.sessionName || 'Split Session',
      participants: participants.map((p) => ({
        uniqueId: p.uniqueId,
        username: p.username,
      })),
      items: finalizeItems,
      currency: storeCurrency, // ✅ Добавьте эту строку
    });

      const backendByParticipant = result.totals?.byParticipant ?? [];
      const hasBackendByParticipant = backendByParticipant.length > 0;

      const effectiveByParticipant = hasBackendByParticipant
        ? backendByParticipant
        : fallbackFinalization.totalsByParticipant;

      const totalsFromResponse = hasBackendByParticipant
        ? backendByParticipant.reduce<Record<string, number>>((acc, entry) => {
            acc[entry.uniqueId] = entry.amountOwed;
            return acc;
          }, {})
        : { ...fallbackFinalization.totalsMap };

      const backendByItem = result.totals?.byItem ?? [];
      const totalsByItem = backendByItem.length > 0 ? backendByItem : fallbackFinalization.totalsByItem;

      const backendAllocations = result.allocations ?? [];
      const allocations = backendAllocations.length > 0 ? backendAllocations : fallbackFinalization.allocations;

      const grandTotal =
        typeof result.totals?.grandTotal === 'number'
          ? result.totals.grandTotal
          : fallbackFinalization.grandTotal;

      const finalCurrency = result.totals?.currency || storeCurrency;

      const finishPayload: FinishPayload = {
  sessionId: result.sessionId,
  sessionName: result.sessionName,
  receiptId: sessionReceiptId ?? (isMockSession ? 'mock-001' : undefined),
  participants,
  totalsByParticipant: effectiveByParticipant,
  totalsByItem,
  allocations,
  grandTotal,
  currency: finalCurrency,
  status: result.status,
  createdAt: result.createdAt,
};

      setLastFinishPayload(finishPayload);
      setShowSuccess(true);

      setTimeout(() => {
        setShowSuccess(false);
        setFinalizing(false);

        try {
          const q = encodeURIComponent(JSON.stringify(finishPayload));
          router.push({
            pathname: '/tabs/sessions/finish',
            params: { data: q },
          });
        } catch {
          router.push('/tabs');
        }

        resetState();
      }, 1200);
    } catch (error) {
      setShowSuccess(false);
      setFinalizing(false);

      const message = error instanceof Error ? error.message : 'Failed to finalize session';
      setSubmitError(message);
      console.error('Finalize error:', error);
    }
  }, [
    canContinue,
    finalizing,
    items,
    session,
    sessionReceiptId,
    isMockSession,
    participants,
    storeCurrency,
    setStoreItems,
    setLastFinishPayload,
    router,
    resetState,
  ]);

  // --- UI atoms ---
  const Avatar = ({ name }: { name: string }) => (
    <Circle size={28} bg="$gray5" ai="center" jc="center">
      <Text color="white" fontWeight="700">
        {name?.[0]?.toUpperCase() || '?'}
      </Text>
    </Circle>
  );

  const ProgressBar = ({ value }: { value: number }) => (
    <YStack h={8} w="100%" br={999} bg="$gray5" overflow="hidden">
      <YStack h="100%" w={`${Math.max(0, Math.min(100, value))}%`} bg="$primary" />
    </YStack>
  );

  const ModeToggleButton = ({
    label,
    icon,
    active,
    onPress,
  }: {
    label: string;
    icon: React.ReactNode;
    active: boolean;
    onPress: () => void;
  }) => (
    <Button
      unstyled
      onPress={onPress}
      px={12}
      py={10}
      borderRadius={8}
      bg={active ? '$primary' : '$backgroundPress'}
      borderWidth={1}
      borderColor={active ? '$primary' : '$gray6'}
    >
      <XStack ai="center" gap="$2">
        {icon}
        <Text fontSize={13} fontWeight="600" color={active ? 'white' : '$gray11'}>
          {label}
        </Text>
      </XStack>
    </Button>
  );

  const gapBottom = (insets?.bottom ?? 0) + 72;

  return (
    <YStack f={1} bg="$background" position="relative">
      {/* Header */}
      <YStack bg="$background" p="$4" pb="$2">
        <XStack w="100%" ai="center" jc="flex-start" mb="$3">
          <YStack ai="flex-start">
            <Text fontSize={16} fontWeight="700" color="$color">
              {t('sessions.itemsSplit.orders', 'Orders')}
            </Text>
            <Text fontSize={12} color="$gray10">
              {sessionReceiptId ?? (isMockSession ? 'mock-001' : 'N/A')}
            </Text>
          </YStack>
        </XStack>
      </YStack>

      {/* Content */}
      <ScrollView
        f={1}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: gapBottom }}
      >
        <YStack px="$4" gap="$3">
          {/* Participants */}
          <YStack>
            <XStack w="100%" ai="center" jc="flex-start" mb="$2">
              <XStack ai="center" gap="$2">
                <UsersIcon size={18} color="$gray10" />
                <Text fontWeight="700" color="$color">{t('sessions.itemsSplit.participants', { count: participants.length, defaultValue: 'Participants ({{count}})' })}</Text>
              </XStack>
            </XStack>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <XStack gap="$2" pr="$4">
                {participants.map((p) => (
                  <XStack
                    key={p.uniqueId}
                    ai="center"
                    gap="$2"
                    px="$2"
                    py="$1"
                    borderWidth={1}
                    borderColor="$gray6"
                    borderRadius={16}
                    minWidth={100}
                  >
                    <Avatar name={p.username} />
                    <Text numberOfLines={1} fontSize={13}>
                      {p.username}
                    </Text>
                  </XStack>
                ))}
              </XStack>
            </ScrollView>
          </YStack>

          {/* Items */}
          <YStack gap="$3" mt="$2">
            <YStack
              p="$3"
              borderRadius={12}
              borderWidth={1}
              borderColor="$primary"
              bg="rgba(46,204,113,0.08)"
              gap="$1"
            >
              <Text fontSize={14} fontWeight="700" color="$primary">
                {t('sessions.itemsSplit.editBannerTitle', 'Check items before splitting')}
              </Text>
              <Text fontSize={12} color="$gray10" lineHeight={18}>
                {t(
                  'sessions.itemsSplit.editBannerHint',
                  'Fix names, prices, or quantities after scanning.'
                )}
              </Text>
              <Text fontSize={12} color="$gray10" lineHeight={18}>
                {t(
                  'sessions.itemsSplit.finalizeHint',
                  'After finalizing, selected participants will get a notification and this bill will appear in their history.'
                )}
              </Text>
              <Button
                mt="$2"
                size="$3"
                alignSelf="flex-start"
                borderRadius="$3"
                theme="active"
                onPress={() =>
                  commitItems((prev) =>
                    prev.map((item) => ({
                      ...item,
                      splitMode: 'warikan',
                      assignedTo: participants.map((participant) => participant.uniqueId),
                      perPersonCount: {},
                    }))
                  )
                }
              >
                {t('sessions.itemsSplit.applyWarikanAll', 'Split all with Warikan')}
              </Button>
            </YStack>

            <YStack
              p="$3"
              borderRadius={12}
              borderWidth={1}
              borderColor="$gray5"
              bg="$color1"
              gap="$2"
            >
              <Text fontSize={13} fontWeight="700" color="$color">
                {t('sessions.itemsSplit.participantStatus', 'Participant status')}
              </Text>
              <XStack flexWrap="wrap" gap="$2">
                {participantAssignmentCounts.map((participant) => {
                  const active = participant.count > 0;
                  return (
                    <XStack
                      key={`status-${participant.uniqueId}`}
                      ai="center"
                      gap="$1"
                      px="$2"
                      py="$1"
                      borderRadius={16}
                      bg={active ? 'rgba(46,204,113,0.1)' : '$backgroundPress'}
                    >
                      <Text
                        fontSize={12}
                        fontWeight="600"
                        color={active ? '$primary' : '$gray10'}
                      >
                        {participant.username}
                      </Text>
                      <Text fontSize={11} color={active ? '$primary' : '$gray10'}>
                        {active
                          ? t('sessions.itemsSplit.assignedState', 'Assigned')
                          : t('sessions.itemsSplit.unassignedState', 'Unassigned')}
                      </Text>
                    </XStack>
                  );
                })}
              </XStack>
            </YStack>

            {items.map((it) => {
              const total =
                typeof it.totalPrice === 'number' ? it.totalPrice : it.price * it.quantity;
              const assigned = isPartiallyAssigned(it);
              const mode = ensureMode(it);
              const singleOwner = mode === 'equal' && it.assignedTo.length === 1;
              const ownerName = singleOwner
                ? participants.find((p) => p.uniqueId === it.assignedTo[0])?.username
                : undefined;
              const priceParts = getCurrencyParts(total);
              const assignedUnits =
                mode === 'count'
                  ? countAssignedUnits(it)
                  : 0;
              const missingUnits =
                mode === 'count'
                  ? Math.max(0, (it.quantity || 0) - assignedUnits)
                  : 0;
              const isCountAndMissing = mode === 'count' && missingUnits > 0;

              let summaryText = '';
              if (mode === 'excluded') {
                summaryText = t('sessions.itemsSplit.notSplit', 'Not split');
              } else if (mode === 'warikan') {
                summaryText = t(
                  'sessions.itemsSplit.warikanSummary',
                  'Warikan: equal split, remainder to organizer'
                );
              } else if (mode === 'proportional') {
                summaryText = t('sessions.itemsSplit.proportional', 'Proportional');
              } else if (mode === 'count') {
                summaryText = t('sessions.itemsSplit.assignedUnits', {
                  assigned: assignedUnits,
                  total: it.quantity,
                  defaultValue: '{{assigned}}/{{total}} assigned',
                });
              } else if (singleOwner) {
                summaryText = ownerName ?? '';
              } else if (it.quantity > 1) {
                summaryText = `1x ${fmtCurrency(it.price)}`;
              }

              const showUnitIcon = (it.quantity > 1 || mode === 'proportional' || mode === 'excluded') && summaryText !== '';

              return (
                <YStack
                  key={it.id}
                  w="100%"
                  borderWidth={1}
                  borderColor={
                    isCountAndMissing ? '$red10' : assigned ? '$primary' : '$gray6'
                  }
                  borderRadius={12}
                  bg="$color1"
                >
                  <XStack w="100%" ai="center" jc="space-between" px={16} py="$3" gap="$3">
                    <YStack f={1} pr={12} gap="$1">
                      <Text fontSize={16} fontWeight="700" numberOfLines={1} color="$color">
                        {it.name}
                        {it.quantity > 1 ? ` (${it.quantity}x)` : ''}
                      </Text>
                      {summaryText && (
                        <XStack ai="center" gap="$1">
                          {showUnitIcon && <PackageIcon size={14} color="$gray10" />}
                          <Text fontSize={12} color="$gray10" numberOfLines={1}>
                            {summaryText}
                          </Text>
                        </XStack>
                      )}
                      {isCountAndMissing && (
                        <Text fontSize={12} color="$red10">
                          {t('sessions.itemsSplit.remainingUnits', {
                            count: missingUnits,
                            defaultValue:
                              missingUnits === 1
                                ? 'Assign 1 remaining unit'
                                : `Assign ${missingUnits} remaining units`,
                          })}
                        </Text>
                      )}
                    </YStack>

                    <YStack ai="flex-end" gap="$2" flexShrink={0}>
                      <XStack ai="baseline" gap="$1">
                        <Text fontSize={12} color="$gray10">
                          {priceParts.currency}
                        </Text>
                        <Text fontSize={16} fontWeight="700" color="$primary">
                          {priceParts.amount}
                        </Text>
                      </XStack>

                      <XStack gap="$2">
                        <Button
                          unstyled
                          onPress={() => openItemMetaModal(it)}
                          minHeight={29}
                          px={10}
                          borderRadius={5}
                          borderWidth={1}
                          borderColor="$gray6"
                          bg="$backgroundPress"
                          ai="center"
                          jc="center"
                          icon={<Pencil size={14} color="$gray11" />}
                        >
                          <Text fontSize={13} fontWeight="600" color="$gray11">
                            {t('sessions.itemsSplit.editItem', 'Edit')}
                          </Text>
                        </Button>
                      <Button
                        unstyled
                        onPress={() => openAssignModal(it)}
                        width={assigned ? 109 : undefined}
                        minHeight={assigned ? 29 : 32}
                        px={assigned ? 16 : 12}
                        py={assigned ? 6 : undefined}
                        borderRadius={assigned ? 5 : 6}
                        bg={assigned ? 'rgba(46,204,113,0.1)' : '$backgroundPress'}
                        borderWidth={assigned ? 0 : 1}
                        borderColor={assigned ? 'transparent' : '$gray6'}
                        ai="center"
                        jc="center"
                      >
                        <Text
                          fontSize={14}
                          fontWeight="600"
                          color={assigned ? '$primary' : '$gray11'}
                        >
                          {assigned
                            ? t('sessions.itemsSplit.change', 'Change')
                            : t('sessions.itemsSplit.who', 'Who?')}
                        </Text>
                      </Button>
                      </XStack>
                    </YStack>
                  </XStack>
                </YStack>
              );
            })}
          </YStack>
        </YStack>
      </ScrollView>

      {/* Bottom progress -> button */}
      <YStack
        position="absolute"
        left={0}
        right={0}
        bottom={(insets?.bottom ?? 0) + 8}
        px="$4"
      >
        {!canContinue ? (
          <YStack p="$3" borderWidth={1} borderColor="$gray5" borderRadius={12} bg="$color1">
            <XStack w="100%" ai="center" jc="space-between" mb="$2">
              <Text color="$gray10" fontSize={13}>
                {t('sessions.itemsSplit.assignProgress', 'Assignment progress')}
              </Text>
              <Text fontSize={13} fontWeight="700">
                {assignedCount}/{totalItems}
              </Text>
            </XStack>
            <ProgressBar
              value={Math.round((assignedCount / Math.max(1, totalItems)) * 100)}
            />
          </YStack>
        ) : (
          <YStack>
            <Button
              unstyled
              onPress={onContinue}
              height={41}
              borderRadius={10}
              bg="$primary"
              ai="center"
              jc="center"
              pressStyle={finalizing ? undefined : { opacity: 0.9 }}
              disabled={finalizing}
              opacity={finalizing ? 0.6 : 1}
            >
              <Text fontSize={16} fontWeight="600" color="white">
                {finalizing ? t('sessions.itemsSplit.saving', 'Saving...') : t('sessions.itemsSplit.continue', 'Continue')}
              </Text>
            </Button>
            {submitError && (
              <Text mt="$2" color="$red10" fontSize={13} textAlign="center">
                {submitError}
              </Text>
            )}
          </YStack>
        )}
      </YStack>

      {/* Assign Modal */}
      {editing && (
        <YStack
          position="absolute"
          inset={0}
          bg="rgba(0,0,0,0.35)"
          ai="center"
          pt={insets.top + 12}
        >
          <YStack
            w={358}
            maxWidth={358}
            h={(editingItem?.quantity || 1) > 1 ? 666 : 588}
            bg="$color1"
            borderRadius={8}
            p="$3"
          >
            {/* Header product + price */}
            <XStack w="100%" ai="center" jc="space-between" mb="$3">
              <Text fontSize={16} fontWeight="700" numberOfLines={1}>
                {editingItem?.name}
                {editingItem && editingItem.quantity > 1 ? ` (${editingItem.quantity}x)` : ''}
              </Text>
              <XStack ai="baseline" gap="$1">
                <Text fontSize={12} color="$gray10">
                  {editingPriceParts.currency}
                </Text>
                <Text fontSize={16} fontWeight="700" color="$primary">
                  {editingPriceParts.amount}
                </Text>
              </XStack>
            </XStack>

            {editingItem && (
              <XStack gap="$2" mb="$2" flexWrap="wrap">
                <ModeToggleButton
                  label={t('sessions.itemsSplit.equalSplit', 'Equal split')}
                  icon={<UsersIcon size={16} color={isEqualMode ? 'white' : '$gray11'} />}
                  active={isEqualMode}
                  onPress={switchToEqual}
                />
                <ModeToggleButton
                  label={t('sessions.itemsSplit.warikan', 'Warikan')}
                  icon={<UsersIcon size={16} color={isWarikanMode ? 'white' : '$gray11'} />}
                  active={isWarikanMode}
                  onPress={switchToWarikan}
                />
                {editingItem.quantity > 1 && (
                  <ModeToggleButton
                    label={t('sessions.itemsSplit.byUnits', 'By units')}
                    icon={<PackageIcon size={16} color={isCountMode ? 'white' : '$gray11'} />}
                    active={isCountMode}
                    onPress={switchToCount}
                  />
                )}
                <ModeToggleButton
                  label={t('sessions.itemsSplit.proportional', 'Proportional')}
                  icon={<PackageIcon size={16} color={isProportionalMode ? 'white' : '$gray11'} />}
                  active={isProportionalMode}
                  onPress={switchToProportional}
                />
                <ModeToggleButton
                  label={t('sessions.itemsSplit.notSplit', 'Not split')}
                  icon={<PackageIcon size={16} color={isExcludedMode ? 'white' : '$gray11'} />}
                  active={isExcludedMode}
                  onPress={switchToExcluded}
                />
              </XStack>
            )}

            {!isProportionalMode && !isExcludedMode && !isWarikanMode ? (
              <>
                <XStack w="100%" ai="center" jc="space-between" mb="$2">
                  <Text fontWeight="600" color="$color">{t('sessions.itemsSplit.assignTo', 'Assign to:')}</Text>
                  <XStack ai="center" gap="$2">
                    <Button chromeless onPress={modalAll}>
                      <Text color="$primary" fontWeight="700">
                        {t('sessions.itemsSplit.all', 'All')}
                      </Text>
                    </Button>
                    <Text color="$gray8">|</Text>
                    <Button chromeless onPress={modalClear}>
                      <Text color="$red10" fontWeight="700">
                        {t('sessions.itemsSplit.clear', 'Clear')}
                      </Text>
                    </Button>
                  </XStack>
                </XStack>

                <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator>
                  <YStack gap="$2" pb="$2">
                    {participants.map((p) => {
                  const mode = effectiveMode;
                  const isCountRow = mode === 'count';
                  const assignedQty = editing.perPersonCount?.[p.uniqueId] || 0;
                  const isSelected = isCountRow
                    ? assignedQty > 0
                    : editing.assignedTo.includes(p.uniqueId);

                  return (
                    <Pressable
                      key={`m-${editing.id}-${p.uniqueId}`}
                      onPress={() => modalToggleUser(p.uniqueId)}
                      style={({ pressed }) => ({
                        width: '100%',
                        opacity: pressed ? 0.95 : 1,
                      })}
                    >
                      <XStack
                        h={60}
                        ai="center"
                        jc="space-between"
                        px={16}
                        borderWidth={1}
                        borderColor={isSelected ? '$primary' : '$gray6'}
                        borderRadius={12}
                        bg="$color1"
                      >
                        <XStack ai="center" gap="$3">
                          <Avatar name={p.username} />
                          <Text fontWeight="600">{p.username}</Text>
                        </XStack>

                        <XStack ai="center" gap="$3">
                          {isCountRow && (
                            <XStack ai="center" gap="$2">
                              <Button
                                unstyled
                                onPress={(e: any) => {
                                  e?.stopPropagation?.();
                                  modalDec(p.uniqueId);
                                }}
                                width={28}
                                height={28}
                                br={999}
                                bg="$gray6"
                                ai="center"
                                jc="center"
                              >
                                <Minus size={16} color="$gray11" />
                              </Button>
                              <Text minWidth={12} textAlign="center">
                                {assignedQty}
                              </Text>
                              <Button
                                unstyled
                                onPress={(e: any) => {
                                  e?.stopPropagation?.();
                                  modalInc(p.uniqueId);
                                }}
                                width={28}
                                height={28}
                                br={999}
                                bg="$gray6"
                                ai="center"
                                jc="center"
                              >
                                <Plus size={16} color="$gray11" />
                              </Button>
                            </XStack>
                          )}

                          <Circle
                            size={22}
                            borderColor="$primary"
                            borderWidth={2}
                            ai="center"
                            jc="center"
                            bg={isSelected ? '$primary' : 'transparent'}
                          >
                            {isSelected && <Check size={14} color="white" />}
                          </Circle>
                        </XStack>
                      </XStack>
                    </Pressable>
                  );
                    })}
                  </YStack>
                </ScrollView>
              </>
            ) : (
              <YStack p="$3" borderRadius={8} bg="$backgroundPress" mb="$2">
                <Text fontSize={13} color="$gray11" lineHeight={18}>
                  {isProportionalMode
                    ? t(
                        'sessions.itemsSplit.proportionalHint',
                        'This item will be distributed by each participant subtotal from the other assigned items.'
                      )
                    : t(
                        'sessions.itemsSplit.notSplitHint',
                        'This item stays in the receipt total but is not charged to any participant.'
                      )}
                </Text>
              </YStack>
            )}

            {effectiveMode === 'equal' && editing.assignedTo.length > 0 && (
              <YStack mt="$2" p={8} borderRadius={5} bg="rgba(46,204,113,0.1)">
                <Text fontSize={13} fontWeight="700" color="$primary">
                  {t('sessions.itemsSplit.equalAssigned', {
                    count: editing.assignedTo.length,
                    defaultValue: 'Assigned to {{count}} participant(s)',
                  })}
                </Text>
                <Text fontSize={12} color="$primary">
                  {t('sessions.itemsSplit.equalSplitHint', 'Price split equally:')}{' '}
                  {fmtCurrency(editingTotal / Math.max(1, editing.assignedTo.length))} each
                </Text>
              </YStack>
            )}

            {effectiveMode === 'warikan' && (
              <YStack mt="$2" p={8} borderRadius={5} bg="rgba(46,204,113,0.1)">
                <Text fontSize={13} fontWeight="700" color="$primary">
                  {t('sessions.itemsSplit.warikanHintTitle', 'Strict even split')}
                </Text>
                <Text fontSize={12} color="$primary">
                  {t(
                    'sessions.itemsSplit.warikanHint',
                    'Everyone gets the same base amount. Any remainder is assigned to the organizer.'
                  )}
                </Text>
              </YStack>
            )}

            {effectiveMode === 'count' &&
              Object.values(editing.perPersonCount).reduce((a, b) => a + (b || 0), 0) > 0 && (
                <YStack mt="$2" p={8} borderRadius={5} bg="rgba(46,204,113,0.1)">
                  <Text fontSize={13} fontWeight="700" color="$primary">
                    {t('sessions.itemsSplit.countAssigned', {
                      count: Object.values(editing.perPersonCount).reduce((a, b) => a + (b || 0), 0),
                      defaultValue: '{{count}} unit(s) assigned',
                    })}
                  </Text>
                  <Text fontSize={12} color="$primary">
                    {t('sessions.itemsSplit.perUnit', 'Per unit:')} {fmtCurrency(editingItem?.price || 0)}
                  </Text>
                </YStack>
              )}

            <XStack mt="auto" gap="$2">
              <Button
                unstyled
                onPress={closeAssignModal}
                width={155}
                height={41}
                borderRadius={10}
                borderWidth={1}
                borderColor="$gray6"
                ai="center"
                jc="center"
              >
                <Text>{t('common.cancel', 'Cancel')}</Text>
              </Button>
              <Button
                unstyled
                onPress={modalSave}
                width={155}
                height={41}
                borderRadius={10}
                bg="$primary"
                ai="center"
                jc="center"
                disabled={saving}
                pressStyle={{ opacity: 0.9 }}
              >
                <Text color="white" fontWeight="600">
                  {t('sessions.itemsSplit.saveItem', 'Save')}
                </Text>
              </Button>
            </XStack>
          </YStack>
        </YStack>
      )}

      {itemMetaEdit && (
        <YStack
          position="absolute"
          inset={0}
          bg="rgba(0,0,0,0.35)"
          ai="center"
          jc="center"
          px="$4"
        >
          <YStack w={358} maxWidth={358} p="$4" bg="$color1" br={12} gap="$3">
            <Text fontSize={16} fontWeight="700" color="$color">
              {t('sessions.itemsSplit.editModalTitle', 'Edit item')}
            </Text>
            <YStack gap="$2">
              <Text fontSize={12} color="$gray10">
                {t('sessions.itemsSplit.itemName', 'Item name')}
              </Text>
              <Input
                value={itemMetaEdit.name}
                onChangeText={(name) => setItemMetaEdit((prev) => (prev ? { ...prev, name } : prev))}
              />
            </YStack>
            <YStack gap="$2">
              <Text fontSize={12} color="$gray10">
                {t('sessions.itemsSplit.unitPrice', 'Unit price')}
              </Text>
              <Input
                value={itemMetaEdit.price}
                onChangeText={(price) => setItemMetaEdit((prev) => (prev ? { ...prev, price } : prev))}
                keyboardType="numeric"
              />
            </YStack>
            <YStack gap="$2">
              <Text fontSize={12} color="$gray10">
                {t('sessions.itemsSplit.quantity', 'Quantity')}
              </Text>
              <Input
                value={itemMetaEdit.quantity}
                onChangeText={(quantity) =>
                  setItemMetaEdit((prev) => (prev ? { ...prev, quantity } : prev))
                }
                keyboardType="number-pad"
              />
            </YStack>
            <XStack gap="$2" mt="$2">
              <Button
                f={1}
                unstyled
                h={40}
                borderRadius={8}
                borderWidth={1}
                borderColor="$red8"
                ai="center"
                jc="center"
                onPress={deleteItemMeta}
              >
                <Text fontSize={14} fontWeight="600" color="$red10">
                  {t('sessions.itemsSplit.deleteItem', 'Remove item')}
                </Text>
              </Button>
              <Button
                f={1}
                unstyled
                h={40}
                borderRadius={8}
                bg="$primary"
                ai="center"
                jc="center"
                onPress={saveItemMeta}
              >
                <Text fontSize={14} fontWeight="600" color="white">
                  {t('sessions.itemsSplit.saveItem', 'Save')}
                </Text>
              </Button>
            </XStack>
            <Button unstyled onPress={closeItemMetaModal} ai="center">
              <Text fontSize={13} color="$gray10">
                {t('common.cancel', 'Cancel')}
              </Text>
            </Button>
          </YStack>
        </YStack>
      )}

      {/* Finalizing spinner */}
      {finalizing && !showSuccess && (
        <YStack
          position="absolute"
          inset={0}
          ai="center"
          jc="center"
          bg="rgba(0,0,0,0.25)"
        >
          <YStack w={390} h={156} ai="center" jc="center" bg="$color1" br={12}>
            <Spinner size="large" color="$primary" />
            <Text mt="$2" color="$primary" fontSize={16} fontWeight="600">
              Saving split...
            </Text>
          </YStack>
        </YStack>
      )}

      {/* Success overlay */}
      {showSuccess && (
        <YStack
          position="absolute"
          inset={0}
          ai="center"
          jc="center"
          bg="rgba(0,0,0,0.25)"
        >
          <YStack w={390} h={156} ai="center" jc="center" bg="$primary" br={12}>
            <Check size={42} color="white" />
            <Text mt="$2" color="white" fontSize={18} fontWeight="700">
              Bill confirmed
            </Text>
          </YStack>
        </YStack>
      )}
    </YStack>
  );
}
