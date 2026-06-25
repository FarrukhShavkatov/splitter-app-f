import * as FileSystem from 'expo-file-system/legacy';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import type { SessionHistoryEntry } from '@/features/sessions/api/history.api';
import { DEFAULT_CURRENCY, formatCurrencyAmount } from '@/shared/lib/currency';

export type HistoryExportFormat = 'pdf' | 'csv' | 'doc' | 'txt';

export type HistoryExportLabels = {
  appTitle: string;
  exportedAt: string;
  bill: string;
  date: string;
  total: string;
  participants: string;
  participant: string;
  amount: string;
  status: string;
  paid: string;
  unpaid: string;
  items: string;
  itemName: string;
  itemShare: string;
  footer: string;
  fileNamePrefix: string;
};

const DATE_LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  uz: 'uz-UZ',
  ja: 'ja-JP',
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

const escapeCsv = (value: string) => {
  const normalized = value.replace(/"/g, '""');
  return `"${normalized}"`;
};

const formatDate = (value?: string, locale = 'en') => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const loc = DATE_LOCALE_MAP[locale] ?? locale;
  return date.toLocaleString(loc, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const fmtAmount = (value: number, currency: string) => formatCurrencyAmount(value, currency);

const getCurrency = (entry: SessionHistoryEntry) =>
  entry.currency ?? entry.totals?.currency ?? entry.payload?.totals?.currency ?? DEFAULT_CURRENCY;

type BillBlock = {
  entry: SessionHistoryEntry;
  currency: string;
  dateLabel: string;
  participants: Array<{
    username: string;
    uniqueId: string;
    amount: number;
    paid: boolean;
    items: Array<{ name: string; share: number }>;
  }>;
};

const buildBillBlocks = (entries: SessionHistoryEntry[], locale: string): BillBlock[] =>
  entries.map((entry) => {
    const currency = getCurrency(entry);
    const dateLabel = formatDate(entry.finalizedAt || entry.createdAt, locale);
    const paymentStatus = entry.payload?.paymentStatus ?? {};
    const byParticipant = entry.totals?.byParticipant ?? entry.payload?.totals?.byParticipant ?? [];
    const byItem = entry.totals?.byItem ?? entry.payload?.totals?.byItem ?? [];
    const itemsById = new Map(byItem.map((it) => [it.itemId, it.name]));
    const allocations = entry.allocations ?? entry.payload?.allocations ?? [];

    const itemsByParticipant = new Map<string, Array<{ name: string; share: number }>>();
    for (const alloc of allocations) {
      const list = itemsByParticipant.get(alloc.participantId) ?? [];
      list.push({
        name: itemsById.get(alloc.itemId) ?? alloc.itemId,
        share: alloc.shareAmount,
      });
      itemsByParticipant.set(alloc.participantId, list);
    }

    const participants = byParticipant.map((p) => ({
      username: p.username,
      uniqueId: p.uniqueId,
      amount: p.amountOwed ?? 0,
      paid: Boolean(paymentStatus[p.uniqueId]?.paid),
      items: itemsByParticipant.get(p.uniqueId) ?? [],
    }));

    return { entry, currency, dateLabel, participants };
  });

const buildPlainTextDocument = (
  blocks: BillBlock[],
  labels: HistoryExportLabels,
  exportedAt: string
): string => {
  const lines: string[] = [
    labels.appTitle,
    `${labels.exportedAt}: ${exportedAt}`,
    '',
  ];

  blocks.forEach((block, index) => {
    if (index > 0) lines.push('---', '');
    lines.push(
      `${labels.bill}: ${block.entry.sessionName || labels.bill}`,
      `${labels.date}: ${block.dateLabel}`,
      `${labels.total}: ${fmtAmount(block.entry.grandTotal ?? 0, block.currency)}`,
      '',
      labels.participants
    );
    for (const p of block.participants) {
      const status = p.paid ? labels.paid : labels.unpaid;
      lines.push(`  • ${p.username}: ${fmtAmount(p.amount, block.currency)} (${status})`);
      if (p.items.length) {
        lines.push(`    ${labels.items}:`);
        for (const item of p.items) {
          lines.push(`      - ${item.name}: ${fmtAmount(item.share, block.currency)}`);
        }
      }
    }
    lines.push('');
  });

  lines.push(labels.footer);
  return lines.join('\n');
};

const buildCsvDocument = (blocks: BillBlock[], labels: HistoryExportLabels): string => {
  const header = [
    labels.bill,
    labels.date,
    labels.total,
    labels.participant,
    labels.amount,
    labels.status,
    labels.itemName,
    labels.itemShare,
  ]
    .map(escapeCsv)
    .join(',');

  const rows: string[] = [header];

  for (const block of blocks) {
    const billName = block.entry.sessionName || labels.bill;
    const total = fmtAmount(block.entry.grandTotal ?? 0, block.currency);

    if (!block.participants.length) {
      rows.push(
        [
          billName,
          block.dateLabel,
          total,
          '',
          '',
          '',
          '',
          '',
        ]
          .map(escapeCsv)
          .join(',')
      );
      continue;
    }

    for (const p of block.participants) {
      const status = p.paid ? labels.paid : labels.unpaid;
      if (!p.items.length) {
        rows.push(
          [
            billName,
            block.dateLabel,
            total,
            p.username,
            fmtAmount(p.amount, block.currency),
            status,
            '',
            '',
          ]
            .map(escapeCsv)
            .join(',')
        );
        continue;
      }

      p.items.forEach((item, itemIndex) => {
        rows.push(
          [
            itemIndex === 0 ? billName : '',
            itemIndex === 0 ? block.dateLabel : '',
            itemIndex === 0 ? total : '',
            itemIndex === 0 ? p.username : '',
            itemIndex === 0 ? fmtAmount(p.amount, block.currency) : '',
            itemIndex === 0 ? status : '',
            item.name,
            fmtAmount(item.share, block.currency),
          ]
            .map(escapeCsv)
            .join(',')
        );
      });
    }
  }

  return rows.join('\n');
};

const buildHtmlDocument = (
  blocks: BillBlock[],
  labels: HistoryExportLabels,
  exportedAt: string
): string => {
  const billsHtml = blocks
    .map((block) => {
      const participantsHtml = block.participants
        .map((p) => {
          const status = p.paid ? labels.paid : labels.unpaid;
          const statusColor = p.paid ? '#27ae60' : '#e67e22';
          const itemsHtml = p.items.length
            ? `<ul style="margin:6px 0 0 18px;padding:0;font-size:12px;color:#555;">
                ${p.items
                  .map(
                    (item) =>
                      `<li>${escapeHtml(item.name)} — ${escapeHtml(fmtAmount(item.share, block.currency))}</li>`
                  )
                  .join('')}
              </ul>`
            : '';

          return `
            <div style="border:1px solid #e0e0e0;border-radius:8px;padding:12px;margin-bottom:10px;">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <strong style="font-size:15px;">${escapeHtml(p.username)}</strong>
                <strong style="color:#2ecc71;font-size:15px;">${escapeHtml(fmtAmount(p.amount, block.currency))}</strong>
              </div>
              <div style="margin-top:4px;font-size:12px;color:${statusColor};font-weight:600;">${escapeHtml(status)}</div>
              ${itemsHtml}
            </div>
          `;
        })
        .join('');

      return `
        <section style="margin-bottom:28px;page-break-inside:avoid;">
          <h2 style="margin:0 0 6px;font-size:18px;color:#111;">${escapeHtml(block.entry.sessionName || labels.bill)}</h2>
          <p style="margin:0 0 4px;font-size:12px;color:#666;">${escapeHtml(labels.date)}: ${escapeHtml(block.dateLabel)}</p>
          <p style="margin:0 0 14px;font-size:14px;color:#2ecc71;font-weight:700;">
            ${escapeHtml(labels.total)}: ${escapeHtml(fmtAmount(block.entry.grandTotal ?? 0, block.currency))}
          </p>
          <h3 style="margin:0 0 8px;font-size:13px;color:#444;">${escapeHtml(labels.participants)}</h3>
          ${participantsHtml}
        </section>
      `;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(labels.appTitle)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; padding: 24px; color: #222; }
    h1 { font-size: 22px; margin: 0 0 4px; }
    .meta { font-size: 12px; color: #888; margin-bottom: 24px; }
    footer { margin-top: 32px; font-size: 11px; color: #aaa; text-align: center; }
  </style>
</head>
<body>
  <h1>${escapeHtml(labels.appTitle)}</h1>
  <p class="meta">${escapeHtml(labels.exportedAt)}: ${escapeHtml(exportedAt)}</p>
  ${billsHtml}
  <footer>${escapeHtml(labels.footer)}</footer>
</body>
</html>`;
};

const buildWordDocument = (html: string): string =>
  `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head><meta charset="utf-8"><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--></head>
<body>${html.match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? html}</body>
</html>`;

const buildFileName = (labels: HistoryExportLabels, format: HistoryExportFormat, count: number) => {
  const stamp = new Date().toISOString().slice(0, 10);
  const suffix = count === 1 ? 'bill' : 'history';
  return `${labels.fileNamePrefix}-${suffix}-${stamp}.${format === 'doc' ? 'doc' : format}`;
};

export async function exportHistoryToFile(
  format: HistoryExportFormat,
  entries: SessionHistoryEntry[],
  labels: HistoryExportLabels,
  options?: { locale?: string }
): Promise<void> {
  if (!entries.length) {
    throw new Error('No bills to export');
  }

  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    throw new Error('Sharing is not available on this device');
  }

  const locale = options?.locale ?? 'en';
  const exportedAt = formatDate(new Date().toISOString(), locale);
  const blocks = buildBillBlocks(entries, locale);
  const fileName = buildFileName(labels, format, entries.length);

  if (format === 'pdf') {
    const html = buildHtmlDocument(blocks, labels, exportedAt);
    const { uri } = await Print.printToFileAsync({ html });
    await Sharing.shareAsync(uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: labels.appTitle,
    });
    return;
  }

  let content = '';
  let mimeType = 'text/plain';

  if (format === 'csv') {
    content = buildCsvDocument(blocks, labels);
    mimeType = 'text/csv';
  } else if (format === 'doc') {
    const html = buildHtmlDocument(blocks, labels, exportedAt);
    content = buildWordDocument(html);
    mimeType = 'application/msword';
  } else {
    content = buildPlainTextDocument(blocks, labels, exportedAt);
    mimeType = 'text/plain';
  }

  const path = `${FileSystem.cacheDirectory}${fileName}`;
  await FileSystem.writeAsStringAsync(path, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  await Sharing.shareAsync(path, {
    mimeType,
    dialogTitle: labels.appTitle,
  });
}

export const EXPORT_FORMATS: Array<{
  id: HistoryExportFormat;
  labelKey: string;
  descKey: string;
  extension: string;
}> = [
  { id: 'pdf', labelKey: 'billFeatures.export.formats.pdf', descKey: 'billFeatures.export.formats.pdfDesc', extension: '.pdf' },
  { id: 'csv', labelKey: 'billFeatures.export.formats.csv', descKey: 'billFeatures.export.formats.csvDesc', extension: '.csv' },
  { id: 'doc', labelKey: 'billFeatures.export.formats.doc', descKey: 'billFeatures.export.formats.docDesc', extension: '.doc' },
  { id: 'txt', labelKey: 'billFeatures.export.formats.txt', descKey: 'billFeatures.export.formats.txtDesc', extension: '.txt' },
];
