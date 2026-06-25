import type { FinishPayload } from '@/features/receipt/model/receipt-session.store';
import type { SessionHistoryEntry } from '@/features/sessions/api/history.api';
import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@/shared/lib/currency';

export type ShareSummaryLabels = {
  title: string;
  total: string;
  perPerson: string;
  paid: string;
  unpaid: string;
  footer: string;
};

const fmt = (value: number, currency: string) => formatCurrencyAmount(value, currency);

export function buildShareTextFromFinish(
  payload: FinishPayload,
  labels: ShareSummaryLabels
): string {
  const currency = payload.currency || DEFAULT_CURRENCY;
  const lines: string[] = [
    labels.title,
    payload.sessionName || 'Bill',
    '',
    `${labels.total}: ${fmt(payload.grandTotal ?? 0, currency)}`,
    '',
    labels.perPerson,
  ];

  const list = payload.totalsByParticipant ?? [];
  for (const p of list) {
    const amount = p.amountOwed ?? 0;
    lines.push(`• ${p.username}: ${fmt(amount, currency)}`);
  }

  lines.push('', labels.footer);
  return lines.join('\n');
}

export function buildShareTextFromHistory(
  bill: SessionHistoryEntry,
  labels: ShareSummaryLabels
): string {
  const currency =
    bill.currency || bill.totals?.currency || bill.payload?.totals?.currency || DEFAULT_CURRENCY;
  const lines: string[] = [
    labels.title,
    bill.sessionName || 'Bill',
    '',
    `${labels.total}: ${fmt(bill.grandTotal ?? 0, currency)}`,
    '',
    labels.perPerson,
  ];

  const list = bill.totals?.byParticipant ?? bill.payload?.totals?.byParticipant ?? [];
  const paymentStatus = bill.payload?.paymentStatus ?? {};
  for (const p of list) {
    const amount = p.amountOwed ?? 0;
    const status = paymentStatus[p.uniqueId];
    const tag = status?.paid ? labels.paid : labels.unpaid;
    lines.push(`• ${p.username}: ${fmt(amount, currency)} (${tag})`);
  }

  lines.push('', labels.footer);
  return lines.join('\n');
}
