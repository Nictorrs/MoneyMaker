export const colors = {
  night: '#0A0620',
  deepPurple: '#2A0E61',
  purple: '#7C3AED',
  violet: '#A78BFA',
  electric: '#2563EB',
  cyan: '#22D3EE',
  emerald: '#10B981',
  neonGreen: '#3DFFA2',
  softRed: '#FF7A7A',
  orange: '#FFA062',
  amber: '#FBBF24',

  text: '#FFFFFF',
  textMuted: 'rgba(255,255,255,0.70)',
  textFaint: 'rgba(255,255,255,0.46)',

  glassFill: 'rgba(255,255,255,0.08)',
  glassFillPressed: 'rgba(255,255,255,0.18)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.26)',
  glassBorderPressed: 'rgba(255,255,255,0.80)',
  scrim: 'rgba(6,3,20,0.62)',
};

export const radii = { sm: 12, md: 20, lg: 28, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };

// Fuente del sistema con pesos y tracking de estilo geométrico. Para usar una
// tipografía propia (p. ej. Outfit), enlazarla con react-native-asset y
// definir fontFamily aquí.
export const type = {
  display: { fontSize: 36, fontWeight: '700', letterSpacing: -1, color: colors.text },
  title: { fontSize: 22, fontWeight: '700', letterSpacing: -0.4, color: colors.text },
  heading: { fontSize: 17, fontWeight: '600', letterSpacing: -0.2, color: colors.text },
  body: { fontSize: 15, fontWeight: '400', color: colors.text },
  caption: { fontSize: 13, fontWeight: '500', color: colors.textMuted },
  overline: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
};

export const shadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.28,
  shadowRadius: 24,
  elevation: 10,
};

export const CATEGORIES = {
  food: { label: 'Comida', color: '#FFA062', icon: 'food' },
  groceries: { label: 'Mercado', color: '#FBBF24', icon: 'cart' },
  transport: { label: 'Transporte', color: '#22D3EE', icon: 'car' },
  housing: { label: 'Vivienda', color: '#A78BFA', icon: 'home' },
  utilities: { label: 'Servicios', color: '#60A5FA', icon: 'bolt' },
  health: { label: 'Salud', color: '#F472B6', icon: 'heart' },
  entertainment: { label: 'Entretenimiento', color: '#E879F9', icon: 'ticket' },
  subscriptions: { label: 'Suscripciones', color: '#818CF8', icon: 'repeat' },
  shopping: { label: 'Compras', color: '#FB7185', icon: 'bag' },
  education: { label: 'Educación', color: '#34D399', icon: 'book' },
  travel: { label: 'Viajes', color: '#38BDF8', icon: 'plane' },
  transfer: { label: 'Transferencias', color: '#94A3B8', icon: 'swap' },
  salary: { label: 'Salario', color: '#3DFFA2', icon: 'briefcase' },
  freelance: { label: 'Freelance', color: '#6EE7B7', icon: 'spark' },
  other: { label: 'Otros', color: '#CBD5E1', icon: 'dots' },
};

export const EXPENSE_CATEGORY_IDS = [
  'food', 'groceries', 'transport', 'housing', 'utilities', 'health', 'entertainment',
  'subscriptions', 'shopping', 'education', 'travel', 'transfer', 'other',
];
export const INCOME_CATEGORY_IDS = ['salary', 'freelance', 'transfer', 'other'];

export const categoryMeta = id => CATEGORIES[id] || CATEGORIES.other;

export const categoryIdsFor = txType => (txType === 'income' ? INCOME_CATEGORY_IDS : EXPENSE_CATEGORY_IDS);

/**
 * La categoría si sirve para el tipo de movimiento; si no, `fallback` (por defecto, la
 * primera permitida). La base rechaza, p. ej., un gasto con categoría Salario.
 */
export const fitCategory = (txType, category, fallback = categoryIdsFor(txType)[0]) =>
  categoryIdsFor(txType).includes(category) ? category : fallback;

// StyleSheet.absoluteFillObject ya no existe en React Native 0.87.
export const absoluteFill = { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 };

/** Encoge cifras largas de forma predecible (adjustsFontSizeToFit es poco fiable en Android). */
export const fitFontSize = (text, base, min, comfortableChars = 10) =>
  Math.max(min, Math.min(base, (base * comfortableChars) / Math.max(String(text).length, 1)));
