import { categoryIdsFor, fitCategory } from '../theme';

/**
 * Feedback loop de categorías.
 *
 * Cada vez que el usuario cambia la categoría sugerida, la corrección queda
 * etiquetada en la base local (category_feedback). Con esas correcciones:
 *  la app ajusta de inmediato sus sugerencias (preferencias aprendidas). Nada
 *  sale del teléfono.
 */

const fold = text =>
  String(text || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();

export const feedbackKey = (merchant, description) => fold(merchant) || fold(description);

/** Correcciones -> preferencias por comercio o concepto; gana la más reciente. */
export function buildPreferences(feedbackRows) {
  const preferences = new Map();
  const newestFirst = [...feedbackRows].sort((a, b) => (b.created_at || 0) - (a.created_at || 0));
  for (const row of newestFirst) {
    const key = feedbackKey(row.merchant, row.description);
    if (key.length < 2) {
      continue;
    }
    const current = preferences.get(key);
    if (!current) {
      preferences.set(key, {
        key,
        text: row.merchant || row.description,
        category: row.final_category,
        count: 1,
        lastAt: row.created_at || 0,
      });
    } else if (current.category === row.final_category) {
      current.count += 1;
    }
  }
  return preferences;
}

/**
 * Prepara un borrador para confirmar: guarda la categoría sugerida y su origen, y
 * aplica lo aprendido si el comercio o el concepto coinciden con una corrección previa.
 * Si la IA propone una categoría que no sirve para el tipo (un ingreso en Comida), se
 * sugiere Otros: la base rechazaría la combinación.
 */
export function toDraft(tx, preferences, model) {
  const category = fitCategory(tx.type, tx.category, 'other');
  const draft = { ...tx, category, aiCategory: tx.category, suggestedCategory: category, suggestionSource: model };
  if (!preferences || preferences.size === 0) {
    return draft;
  }
  const merchant = fold(tx.merchant);
  const haystack = ` ${fold(tx.description)} ${merchant} `;
  let match = merchant ? preferences.get(merchant) : null;
  if (!match) {
    for (const pref of preferences.values()) {
      if (pref.key.length >= 3 && haystack.includes(` ${pref.key} `)) {
        match = pref;
        break;
      }
    }
  }
  if (!match || match.category === category || !categoryIdsFor(tx.type).includes(match.category)) {
    return draft;
  }
  return { ...draft, category: match.category, suggestedCategory: match.category, suggestionSource: 'learned' };
}

/** Registro etiquetado si el usuario cambió la categoría sugerida; null si la aceptó. */
export function feedbackRecord(draft, saved, { capture, todayIso }) {
  if (!draft.suggestedCategory || draft.suggestedCategory === saved.category) {
    return null;
  }
  return {
    day: todayIso,
    transaction_id: saved.id || null,
    capture,
    model: draft.suggestionSource || 'rules',
    merchant: saved.merchant ? String(saved.merchant).slice(0, 60) : null,
    description: String(saved.description || '—').slice(0, 80),
    suggested_category: draft.suggestedCategory,
    final_category: saved.category,
    confidence: typeof draft.confidence === 'number' ? draft.confidence : null,
  };
}
