export const DEFAULT_CURRENCY = 'UZS';

export const SELECTABLE_CURRENCIES = [
  { code: 'UZS', label: 'UZS', name: 'Uzbek sum' },
  { code: 'USD', label: 'USD', name: 'US dollar' },
  { code: 'JPY', label: 'JPY', name: 'Japanese yen' },
] as const;

export type SelectableCurrencyCode = (typeof SELECTABLE_CURRENCIES)[number]['code'];

const SELECTABLE_CODES = new Set<string>(SELECTABLE_CURRENCIES.map((currency) => currency.code));
const ZERO_FRACTION_CURRENCIES = new Set(['JPY', 'UZS', 'KRW']);

export const normalizeCurrencyCode = (
  value: unknown,
  fallback = DEFAULT_CURRENCY
): string => {
  if (typeof value !== 'string') return fallback;
  const code = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
};

export const normalizeSelectableCurrency = (
  value: unknown,
  fallback: SelectableCurrencyCode = DEFAULT_CURRENCY
): SelectableCurrencyCode => {
  const code = normalizeCurrencyCode(value, fallback);
  return SELECTABLE_CODES.has(code) ? (code as SelectableCurrencyCode) : fallback;
};

export const formatCurrencyAmount = (value: number, currency: string): string => {
  const code = normalizeCurrencyCode(currency);
  const amount = Number.isFinite(value) ? value : 0;
  const hasFraction = Math.abs(amount % 1) > 0.000001;
  const maximumFractionDigits = ZERO_FRACTION_CURRENCIES.has(code) ? 0 : 2;
  const minimumFractionDigits = hasFraction && maximumFractionDigits > 0 ? 2 : 0;

  return `${code} ${amount.toLocaleString('en-US', {
    minimumFractionDigits,
    maximumFractionDigits,
  })}`;
};

export const getCurrencyParts = (value: number, currency: string) => {
  const formatted = formatCurrencyAmount(value, currency);
  const [code, ...rest] = formatted.split(' ');
  return { currency: code || DEFAULT_CURRENCY, amount: rest.join(' ') || '0' };
};
