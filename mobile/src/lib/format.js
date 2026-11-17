const ZERO_DECIMAL = new Set(['COP', 'CLP', 'PYG', 'JPY', 'KRW']);
const SYMBOLS = { EUR: '€' };

export const MONTHS_SHORT = [
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic',
];

function groupDigits(integer) {
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/** 45000 -> "$45.000"; 12.5 USD -> "US$12,50". Separadores de es-CO. */
export function formatMoney(amount, currency = 'COP', { sign = false } = {}) {
  const value = Number(amount) || 0;
  const decimals = ZERO_DECIMAL.has(currency) ? 0 : 2;
  const [integer, fraction] = Math.abs(value).toFixed(decimals).split('.');
  const symbol = SYMBOLS[currency] || (currency === 'USD' ? 'US$' : '$');
  const prefix = value < 0 ? '−' : sign && value > 0 ? '+' : '';
  return `${prefix}${symbol}${groupDigits(integer)}${fraction ? `,${fraction}` : ''}`;
}

/** Montos cortos para ejes y chips: 1.250.000 -> "$1,3M"; 45.000 -> "$45k". */
export function formatCompact(amount) {
  const value = Math.abs(Number(amount) || 0);
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(value >= 1e7 ? 0 : 1).replace('.', ',')}M`;
  }
  if (value >= 1e3) {
    return `$${Math.round(value / 1e3)}k`;
  }
  return `$${Math.round(value)}`;
}

export function toISODate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function fromISODate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(iso, days) {
  const date = fromISODate(iso);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

export function formatDayLabel(iso, todayIso) {
  if (iso === todayIso) {
    return 'Hoy';
  }
  if (iso === addDays(todayIso, -1)) {
    return 'Ayer';
  }
  const date = fromISODate(iso);
  const sameYear = iso.slice(0, 4) === todayIso.slice(0, 4);
  return `${date.getDate()} ${MONTHS_SHORT[date.getMonth()]}${sameYear ? '' : ` ${date.getFullYear()}`}`;
}

/** Número -> texto editable con separadores es-CO: 5500000 -> "5.500.000"; 12.5 -> "12,5". */
export function formatAmountInput(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return '';
  }
  const [integer, fraction] = String(Math.abs(Math.round(number * 100) / 100)).split('.');
  return `${groupDigits(integer)}${fraction ? `,${fraction}` : ''}`;
}

const LETTER = /\p{L}/gu;

/**
 * Revisa que un texto libre (descripción o comercio) diga algo: rechaza "33333", "$%&"
 * o "aaaaaa". Devuelve el mensaje de error o null.
 */
export function textFieldError(value, { label = 'La descripción', minLetters = 2 } = {}) {
  const text = String(value || '').trim();
  const letters = text.match(LETTER) || [];
  if (letters.length < minLetters) {
    return `${label} debe tener palabras, no solo números o símbolos.`;
  }
  const compact = text.toLowerCase().replace(/\s/g, '');
  if (compact.length >= 3 && new Set(compact).size === 1) {
    return `${label} no puede ser un mismo carácter repetido.`;
  }
  return null;
}

/** Convierte lo que el usuario escribe ("45.000", "12,5") en número. */
export function parseAmountInput(text) {
  const clean = String(text).replace(/[^\d.,]/g, '');
  if (!clean) {
    return NaN;
  }
  const lastSep = Math.max(clean.lastIndexOf('.'), clean.lastIndexOf(','));
  const decimals = lastSep >= 0 ? clean.length - lastSep - 1 : 0;
  if (lastSep >= 0 && decimals > 0 && decimals <= 2) {
    const integer = clean.slice(0, lastSep).replace(/[.,]/g, '');
    return Number(`${integer}.${clean.slice(lastSep + 1)}`);
  }
  return Number(clean.replace(/[.,]/g, ''));
}
