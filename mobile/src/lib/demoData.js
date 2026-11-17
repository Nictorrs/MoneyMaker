import { addDays, fromISODate, toISODate } from './format';

/** Generador pseudoaleatorio con semilla: los datos de ejemplo son estables. */
function seeded(seed) {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

const FOOD = [
  ['Almuerzo', 'Crepes & Waffles', 42000], ['Café', 'Juan Valdez', 9800], ['Domicilio', 'Rappi', 38500],
  ['Almuerzo', null, 18000], ['Cena', 'Andrés Carne de Res', 96000], ['Empanadas', null, 7500],
];
const GROCERIES = [['Mercado', 'Éxito', 186000], ['Mercado', 'D1', 72000], ['Fruver', null, 34000]];
const TRANSPORT = [['Taxi', 'DiDi', 16500], ['Gasolina', 'Terpel', 120000], ['Uber', 'Uber', 22400], ['TransMilenio', null, 3200]];
const FUN = [['Cine', 'Cine Colombia', 48000], ['Concierto', null, 180000], ['Bolos', null, 55000]];
const SHOPPING = [['Tenis', 'Adidas', 329000], ['Regalo', 'Falabella', 95000], ['Audífonos', 'Amazon', 210000]];

export function buildDemoData(todayIso, currency = 'COP') {
  const random = seeded(20260913);
  const pick = list => list[Math.floor(random() * list.length)];
  const vary = amount => Math.round((amount * (0.85 + random() * 0.3)) / 100) * 100;
  const transactions = [];
  const add = (date, type, category, [description, merchant, amount], extra = {}) =>
    transactions.push({
      type, category, description, merchant, amount: vary(amount), currency, date,
      source: pick(['manual', 'manual', 'voice', 'voice', 'receipt']), status: 'confirmed', ...extra,
    });

  const today = fromISODate(todayIso);
  for (let back = 5; back >= 0; back--) {
    const first = new Date(today.getFullYear(), today.getMonth() - back, 1);
    const last = back === 0 ? today.getDate() : new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const day = n => toISODate(new Date(first.getFullYear(), first.getMonth(), n));

    add(day(1), 'income', 'salary', ['Quincena', 'Empresa', 1750000], { source: 'sms' });
    if (last >= 15) {
      add(day(15), 'income', 'salary', ['Quincena', 'Empresa', 1750000], { source: 'sms' });
    }
    if (back % 2 === 1) {
      add(day(Math.min(20, last)), 'income', 'freelance', ['Proyecto diseño', 'Cliente', 650000]);
    }
    if (last >= 5) {
      add(day(5), 'expense', 'housing', ['Arriendo', null, 1200000], { source: 'manual' });
    }
    if (last >= 8) {
      add(day(8), 'expense', 'utilities', ['Servicios públicos', 'EPM', 185000], { source: 'receipt' });
      add(day(8), 'expense', 'subscriptions', ['Netflix', 'Netflix', 38900], { source: 'notification' });
      add(day(8), 'expense', 'subscriptions', ['Spotify', 'Spotify', 16900], { source: 'notification' });
    }

    // El mes actual gasta un poco más rápido para mostrar la alerta predictiva.
    const intensity = back === 0 ? 1.35 : 1;
    for (let n = 1; n <= last; n++) {
      if (random() < 0.62 * intensity) add(day(n), 'expense', 'food', pick(FOOD));
      if (random() < 0.35 * intensity) add(day(n), 'expense', 'transport', pick(TRANSPORT));
      if (n % 7 === 3) add(day(n), 'expense', 'groceries', pick(GROCERIES));
      if (random() < 0.06 * intensity) add(day(n), 'expense', 'entertainment', pick(FUN));
      if (random() < 0.03 * intensity) add(day(n), 'expense', 'shopping', pick(SHOPPING));
    }
  }

  transactions.push(
    { type: 'expense', category: 'food', description: 'Rappi', merchant: 'Rappi', amount: 45900, currency, date: todayIso, source: 'sms', status: 'pending' },
    { type: 'expense', category: 'transport', description: 'Terpel', merchant: 'Terpel', amount: 98000, currency, date: addDays(todayIso, -1), source: 'notification', status: 'pending' },
  );

  const goals = [
    { name: 'Fondo de emergencia', emoji: '🛟', target: 6000000, saved: 2350000, deadline: null },
    { name: 'Viaje a Cartagena', emoji: '🏖️', target: 2500000, saved: 1900000, deadline: null },
    { name: 'Portátil nuevo', emoji: '💻', target: 3800000, saved: 800000, deadline: null },
  ];
  return { transactions, goals, budget: 5500000 };
}
