import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CategoryDropdown } from '../components/CategoryDropdown';
import { Field, GlassInput, Segmented } from '../components/Fields';
import { Chip, GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { addDays, formatAmountInput, formatMoney, fromISODate, parseAmountInput, textFieldError, toISODate } from '../lib/format';
import { useFinance } from '../state/FinanceContext';
import { colors, fitCategory, radii, type } from '../theme';

const TYPE_OPTIONS = [
  { id: 'expense', label: 'Gasto', color: colors.softRed },
  { id: 'income', label: 'Ingreso', color: colors.neonGreen },
];

const CAPTURE_LABELS = {
  sms: 'SMS bancario',
  notification: 'Notificación bancaria',
};

const isValidDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISODate(fromISODate(iso)) === iso;

const toForm = draft => ({
  type: draft.type || 'expense',
  amount: draft.amount ? formatAmountInput(draft.amount) : '',
  date: draft.date,
  description: draft.description || '',
  merchant: draft.merchant || '',
  category: fitCategory(draft.type || 'expense', draft.category || 'other', 'other'),
});

function DraftEditor({ index, total, draft, form, todayIso, currency, onChange }) {
  const update = patch => onChange(index, patch);
  return (
    <GlassCard blur={false} elevated={false} radius={radii.md} contentStyle={styles.card}>
      {total > 1 && <Text style={type.overline}>{`Movimiento ${index + 1} de ${total}`}</Text>}
      <Segmented
        options={TYPE_OPTIONS}
        value={form.type}
        onChange={value => update({ type: value, category: fitCategory(value, form.category) })}
      />
      <Field label={`Monto (${draft.currency || currency})`}>
        <GlassInput value={form.amount} onChangeText={amount => update({ amount })} keyboardType="decimal-pad" inputStyle={styles.amount} />
      </Field>
      <Field label="Concepto">
        <GlassInput value={form.description} onChangeText={description => update({ description })} placeholder="Almuerzo" maxLength={60} />
      </Field>
      <Field label="Fecha">
        <View style={styles.row}>
          <Chip label="Hoy" active={form.date === todayIso} onPress={() => update({ date: todayIso })} />
          <Chip label="Ayer" active={form.date === addDays(todayIso, -1)} onPress={() => update({ date: addDays(todayIso, -1) })} />
          <GlassInput style={styles.flex} value={form.date} onChangeText={date => update({ date })} placeholder="AAAA-MM-DD" maxLength={10} />
        </View>
      </Field>
      <Field label="Comercio (opcional)">
        <GlassInput value={form.merchant} onChangeText={merchant => update({ merchant })} placeholder="Crepes & Waffles" maxLength={60} />
      </Field>
      <Field label="Categoría">
        <CategoryDropdown
          txType={form.type}
          value={form.category}
          suggested={draft.suggestedCategory}
          suggestionSource={draft.suggestionSource}
          onChange={category => update({ category })}
        />
      </Field>
      {typeof draft.confidence === 'number' && draft.confidence < 0.7 && (
        <View style={styles.notice}>
          <Icon name="alert" size={14} color={colors.amber} />
          <Text style={styles.noticeText}>Confianza baja: revisa los datos antes de guardar.</Text>
        </View>
      )}
    </GlassCard>
  );
}

/**
 * Modal "Confirmación de transacción": nada detectado en alertas bancarias
 * (SMS o notificaciones) se guarda sin que el usuario lo revise y lo confirme.
 */
export function TransactionConfirmSheet({ visible, payload, onClose, onSaved }) {
  const { todayIso, settings, confirmDrafts } = useFinance();
  const [forms, setForms] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && payload) {
      setForms(payload.drafts.map(toForm));
      setError(null);
    }
  }, [payload, visible]);

  if (!payload) {
    return null;
  }
  const { drafts, capture } = payload;
  const change = (index, patch) => setForms(prev => prev.map((form, i) => (i === index ? { ...form, ...patch } : form)));

  const confirm = async () => {
    const entries = [];
    for (let i = 0; i < forms.length; i++) {
      const form = forms[i];
      const draft = drafts[i];
      const where = forms.length > 1 ? ` (movimiento ${i + 1})` : '';
      const amount = parseAmountInput(form.amount);
      if (!(amount > 0)) {
        return setError(`Escribe un monto mayor que cero${where}.`);
      }
      if (!form.description.trim()) {
        return setError(`Agrega un concepto${where}.`);
      }
      const textError =
        textFieldError(form.description, { label: 'El concepto' }) ||
        (form.merchant.trim() ? textFieldError(form.merchant, { label: 'El comercio', minLetters: 1 }) : null);
      if (textError) {
        return setError(`${textError.slice(0, -1)}${where}.`);
      }
      if (!isValidDate(form.date)) {
        return setError(`La fecha debe tener el formato AAAA-MM-DD${where}.`);
      }
      entries.push({
        draft,
        finalTx: {
          ...(draft.id ? { id: draft.id } : {}),
          type: form.type,
          amount,
          currency: draft.currency || settings.currency,
          date: form.date,
          description: form.description.trim(),
          merchant: form.merchant.trim() || null,
          category: form.category,
          source: draft.source || capture,
        },
      });
    }
    setSaving(true);
    try {
      const result = await confirmDrafts(entries, capture);
      onSaved?.(result);
      onClose();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const total = forms.reduce((sum, form, i) => {
    const amount = parseAmountInput(form.amount) || 0;
    return sum + (form.type === 'income' ? amount : -amount) * (drafts[i] ? 1 : 0);
  }, 0);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Confirmación de transacción"
      subtitle={`${CAPTURE_LABELS[capture] || 'Captura'} · revisa y corrige antes de guardar`}
      footer={
        <View style={styles.actions}>
          <GlassButton style={styles.flex} icon="close" label={payload.discardLabel || 'Descartar'} onPress={onClose} />
          <GlassButton style={styles.primary} variant="primary" icon="check" label="Confirmar y guardar" loading={saving} onPress={confirm} />
        </View>
      }>
      {forms.map((form, i) => (
        <DraftEditor
          key={i}
          index={i}
          total={forms.length}
          draft={drafts[i]}
          form={form}
          todayIso={todayIso}
          currency={settings.currency}
          onChange={change}
        />
      ))}
      {forms.length > 1 && (
        <Text style={[type.heading, styles.total]}>{`Total: ${formatMoney(total, settings.currency, { sign: true })}`}</Text>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  primary: { flex: 1.6 },
  actions: { flexDirection: 'row', gap: 10 },
  card: { padding: 14, gap: 14 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  amount: { fontSize: 26, fontWeight: '700' },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  noticeText: { fontSize: 12, color: colors.amber, fontWeight: '600' },
  total: { textAlign: 'right' },
  error: { color: colors.softRed, fontWeight: '600' },
});
