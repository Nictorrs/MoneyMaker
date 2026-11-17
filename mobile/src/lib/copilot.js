import { CATEGORIES } from '../theme';
import { formatMoney } from './format';

/**
 * Copiloto con preguntas fijas. Cada respuesta se calcula en el teléfono con el
 * resumen del mes (modelo del Centro de mando): no hay IA ni servidor de por medio.
 */
export const COPILOT_QUESTIONS = [
  { id: 'budget', label: '¿Me alcanza el presupuesto?' },
  { id: 'month', label: '¿Cómo voy este mes?' },
  { id: 'top', label: '¿En qué gasto más?' },
  { id: 'save', label: '¿Cómo puedo ahorrar más?' },
];

const categoryLabel = id => (CATEGORIES[id]?.label || 'Otros').toLowerCase();

function budgetAnswer(model, money) {
  const { budget, spent, remaining, projection } = model;
  if (!(budget > 0)) {
    return 'Aún no tienes un presupuesto mensual. Defínelo en Ajustes y te digo si vas camino a pasarte.';
  }
  if (!(spent > 0)) {
    return `Aún no registras gastos este mes: tienes disponible todo tu presupuesto de ${money(budget)}.`;
  }
  if (remaining < 0) {
    return (
      `Ya superaste tu presupuesto por ${money(-remaining)}: llevas ${money(spent)} de ${money(budget)}. ` +
      `A este ritmo cerrarías el mes en ${money(projection.projected)}.`
    );
  }
  if (projection.overdraftDay) {
    return (
      `Llevas ${money(spent)} de ${money(budget)}. A tu ritmo actual (${money(projection.dailyRate)} por día) ` +
      `cerrarías el mes en ${money(projection.projected)} y agotarías el presupuesto hacia el día ${projection.overdraftDay}. ` +
      `Para evitarlo, tu límite diario desde hoy sería ${money(projection.dailyLimit)}.`
    );
  }
  return `Vas bien: te quedan ${money(remaining)} y la proyección de cierre es ${money(projection.projected)}, dentro de tu presupuesto.`;
}

function monthAnswer(model, money) {
  const net = model.income - model.spent;
  if (model.income === 0 && model.spent === 0) {
    return 'Este mes todavía no tienes movimientos confirmados.';
  }
  return (
    `Este mes llevas ${money(model.income)} en ingresos y ${money(model.spent)} en gastos, ` +
    `un flujo neto de ${money(net)}. ${net >= 0 ? 'Vas en verde.' : 'Estás gastando más de lo que entra.'}`
  );
}

function topAnswer(model, money) {
  const top = model.byCategory.filter(c => c.total > 0).slice(0, 3);
  if (top.length === 0) {
    return 'Este mes todavía no tienes gastos confirmados.';
  }
  const list = top.map(c => `${categoryLabel(c.category)} con ${money(c.total)} (${Math.round(c.share * 100)}%)`);
  const joined = list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list[list.length - 1]}` : list[0];
  return `Este mes tu gasto más alto ${top.length > 1 ? 'está en' : 'es'} ${joined}.`;
}

function saveAnswer(model, money) {
  const top = model.byCategory.find(c => c.total > 0);
  if (!top) {
    return 'Registra tus gastos del mes y te diré dónde puedes recortar.';
  }
  const cut = top.total * 0.15;
  let answer =
    `Tu categoría más alta es ${categoryLabel(top.category)} con ${money(top.total)}. ` +
    `Si la recortas un 15% ahorrarías cerca de ${money(cut)} al mes.`;
  if (model.budget > 0 && model.projection.daysLeft > 0) {
    answer += ` Para cerrar dentro del presupuesto, intenta no pasar de ${money(model.projection.dailyLimit)} por día.`;
  }
  return answer;
}

const ANSWERS = { budget: budgetAnswer, month: monthAnswer, top: topAnswer, save: saveAnswer };

/** Respuesta en español para una pregunta fija; `model` es el de buildOverviewModel. */
export function answerCopilot(questionId, model, { currency }) {
  const answer = ANSWERS[questionId];
  if (!answer) {
    throw new Error(`Pregunta desconocida: ${questionId}`);
  }
  return answer(model, value => formatMoney(value, currency));
}
