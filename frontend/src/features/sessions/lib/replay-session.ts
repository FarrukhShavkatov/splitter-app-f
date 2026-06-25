import { ReceiptApi } from '@/features/receipt/api/receipt.api';
import type { ReceiptSplitItem } from '@/features/receipt/model/receipt-session.store';
import { useReceiptSessionStore } from '@/features/receipt/model/receipt-session.store';
import type { SessionHistoryEntry } from '@/features/sessions/api/history.api';
import { DEFAULT_CURRENCY } from '@/shared/lib/currency';

export async function replaySessionFromHistory(
  entry: SessionHistoryEntry,
  options?: { sessionNameSuffix?: string; groupId?: number }
): Promise<number> {
  const created = await ReceiptApi.createSession(options?.groupId);
  const byItem =
    entry.totals?.byItem ?? entry.payload?.totals?.byItem ?? [];
  const byParticipant =
    entry.totals?.byParticipant ?? entry.payload?.totals?.byParticipant ?? [];
  const currency =
    entry.currency ?? entry.totals?.currency ?? entry.payload?.totals?.currency ?? DEFAULT_CURRENCY;
  const grandTotal =
    entry.grandTotal ?? entry.totals?.grandTotal ?? entry.payload?.totals?.grandTotal ?? 0;
  const suffix = options?.sessionNameSuffix ?? '';
  const baseName = entry.sessionName || 'Bill';

  const items: ReceiptSplitItem[] = byItem.map((it, index) => {
    const total = typeof it.total === 'number' ? it.total : 0;
    return {
      id: `replay-${it.itemId}-${index}-${Date.now()}`,
      name: it.name,
      unitPrice: total,
      quantity: 1,
      totalPrice: total,
      kind: it.kind,
      splitMode: 'equal',
      assignedTo: [],
      perPersonCount: {},
    };
  });

  const participants = byParticipant.map((p) => ({
    uniqueId: p.uniqueId,
    username: p.username,
  }));

  useReceiptSessionStore.setState({
    capture: undefined,
    parsing: false,
    parseError: undefined,
    session: {
      sessionId: created.id,
      sessionName: `${baseName}${suffix}`,
      language: 'en',
      summary: { grandTotal, currency },
    },
    items,
    participants,
    currency,
    finalizing: false,
    finalizeError: undefined,
    finalized: undefined,
    lastFinishPayload: undefined,
  });

  return created.id;
}
