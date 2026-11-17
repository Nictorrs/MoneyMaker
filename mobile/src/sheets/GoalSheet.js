import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Field, GlassInput } from '../components/Fields';
import { Chip, GlassButton } from '../components/Glass';
import { ProgressBar } from '../components/Progress';
import { Sheet } from '../components/Sheet';
import { formatAmountInput, formatDayLabel, formatMoney, parseAmountInput, toISODate } from '../lib/format';
import { haptic } from '../services/device';
import { store } from '../services/storage';
import { useFinance, useFinanceQuery } from '../state/FinanceContext';
import { colors, type } from '../theme';

const EMOJIS = ['🛟', '🏖️', '💻', '🏠', '🚗', '🎓', '💍', '🎁'];
const QUICK_CONTRIBUTIONS = [50000, 100000, 250000];
const KIND_LABELS = { initial: 'Saldo inicial', contribution: 'Aporte', adjustment: 'Ajuste' };
const HISTORY_LIMIT = 20;

export function GoalSheet({ visible, goal, onClose }) {
  const { settings, todayIso, saveGoal, deleteGoal } = useFinance();
  const [form, setForm] = useState(null);
  // Aportes rápidos de esta edición: se guardan como aportes; un cambio a mano en
  // "Ahorrado" queda como ajuste.
  const [added, setAdded] = useState([]);
  const [error, setError] = useState(null);
  const history = useFinanceQuery(`goal-history|${goal?.id ?? 'nueva'}`, () =>
    goal ? store.listGoalContributions(goal.id, { limit: HISTORY_LIMIT }) : Promise.resolve([]),
  );

  useEffect(() => {
    if (visible) {
      setForm({
        name: goal?.name || '',
        emoji: goal?.emoji || EMOJIS[0],
        target: goal?.target ? formatAmountInput(goal.target) : '',
        saved: goal?.saved ? formatAmountInput(goal.saved) : '0',
      });
      setAdded([]);
      setError(null);
    }
  }, [goal, visible]);

  if (!form) {
    return null;
  }
  const update = patch => setForm(prev => ({ ...prev, ...patch }));
  const target = parseAmountInput(form.target);
  const saved = parseAmountInput(form.saved) || 0;

  const contribute = amount => {
    haptic('success');
    update({ saved: formatAmountInput(saved + amount) });
    setAdded(prev => [...prev, amount]);
  };

  const save = async () => {
    if (!form.name.trim()) {
      return setError('Ponle nombre a tu meta.');
    }
    if (!(target > 0)) {
      return setError('El objetivo debe ser mayor que cero.');
    }
    try {
      await saveGoal(
        { ...(goal || {}), name: form.name.trim(), emoji: form.emoji, target, saved: Math.max(0, saved), deadline: goal?.deadline ?? null },
        added,
      );
      onClose();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={goal ? `${form.emoji} ${goal.name}` : 'Nueva meta'}
      footer={
        <View style={styles.actions}>
          {goal && <GlassButton style={styles.flex} icon="trash" label="Eliminar" onPress={() => deleteGoal(goal.id).then(onClose)} />}
          <GlassButton style={styles.flex} variant="primary" icon="check" label="Guardar" onPress={save} />
        </View>
      }>
      {goal && target > 0 && (
        <View style={styles.progress}>
          <Text style={type.title}>
            {formatMoney(saved, settings.currency)} <Text style={type.caption}>de {formatMoney(target, settings.currency)}</Text>
          </Text>
          <ProgressBar progress={saved / target} />
          <View style={styles.row}>
            {QUICK_CONTRIBUTIONS.map(amount => (
              <Chip key={amount} label={`+${formatMoney(amount, settings.currency)}`} color={colors.neonGreen} onPress={() => contribute(amount)} />
            ))}
          </View>
        </View>
      )}
      <Field label="Ícono">
        <View style={styles.row}>
          {EMOJIS.map(emoji => (
            <Chip key={emoji} label={emoji} color="transparent" active={form.emoji === emoji} onPress={() => update({ emoji })} />
          ))}
        </View>
      </Field>
      <Field label="Nombre">
        <GlassInput value={form.name} onChangeText={name => update({ name })} placeholder="Fondo de emergencia" maxLength={40} />
      </Field>
      <Field label="Objetivo">
        <GlassInput value={form.target} onChangeText={value => update({ target: value })} keyboardType="decimal-pad" placeholder="5.000.000" />
      </Field>
      <Field label="Ahorrado">
        <GlassInput value={form.saved} onChangeText={value => update({ saved: value })} keyboardType="decimal-pad" placeholder="0" />
      </Field>
      {goal && history.data?.length > 0 && (
        <Field label="Historial">
          <View style={styles.history}>
            {history.data.map(item => (
              <View key={item.id} style={styles.historyRow}>
                <Text style={type.caption}>
                  {`${KIND_LABELS[item.kind] || 'Movimiento'} · ${formatDayLabel(toISODate(new Date(item.created_at)), todayIso)}`}
                </Text>
                <Text style={[styles.historyAmount, { color: item.amount < 0 ? colors.softRed : colors.neonGreen }]}>
                  {formatMoney(item.amount, settings.currency, { sign: true })}
                </Text>
              </View>
            ))}
          </View>
        </Field>
      )}
      {error && <Text style={styles.error}>{error}</Text>}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  progress: { gap: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  history: { gap: 8 },
  historyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  historyAmount: { fontSize: 15, fontWeight: '700' },
  error: { color: colors.softRed, fontWeight: '600' },
});
