import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlassInput } from '../components/Fields';
import { GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { ProgressRing } from '../components/Progress';
import { Sheet } from '../components/Sheet';
import { TransactionRow } from '../components/TransactionRow';
import { formatAmountInput, formatMoney, fromISODate, parseAmountInput } from '../lib/format';
import { loggingStreak } from '../lib/gamification';
import { useFinance } from '../state/FinanceContext';
import { colors, fitFontSize, radii, type } from '../theme';
import { CopilotChat, InsightCards } from './CopilotPanel';
import { Screen, SectionTitle } from './Screen';

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function BudgetSheet({ visible, onClose }) {
  const { settings, updateSettings } = useFinance();
  const [value, setValue] = useState('');
  useEffect(() => {
    if (visible) {
      setValue(settings.budget ? formatAmountInput(settings.budget) : '');
    }
  }, [settings.budget, visible]);
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Presupuesto mensual"
      subtitle="Límite de gastos para el mes. El copiloto lo usa para proyectar sobregiros."
      footer={
        <GlassButton
          variant="primary"
          icon="check"
          label="Guardar"
          onPress={async () => {
            await updateSettings({ budget: parseAmountInput(value) || 0 });
            onClose();
          }}
        />
      }>
      <GlassInput value={value} onChangeText={setValue} keyboardType="decimal-pad" placeholder="2.500.000" inputStyle={styles.budgetInput} autoFocus />
    </Sheet>
  );
}

/** Centro de mando: se alimenta del snapshot, sin recorrer el historial completo. */
export function DashboardScreen({ onQuickEntry, onEditTransaction, onDeleteTransaction, onConfirmPending, onNavigate, onOpenSettings }) {
  const { model, insights, overview, settings, todayIso } = useFinance();
  const [budgetOpen, setBudgetOpen] = useState(false);
  const money = value => formatMoney(value, settings.currency);
  const today = fromISODate(todayIso);
  const hasBudget = settings.budget > 0;
  const streak = useMemo(() => loggingStreak(overview.recordDates || [], todayIso), [overview.recordDates, todayIso]);

  return (
    <Screen
      overline={`${WEEKDAYS[today.getDay()]} ${today.getDate()} de ${MONTHS[today.getMonth()]}`}
      title="Centro de mando"
      right={
        <View style={styles.headerActions}>
          {streak > 0 && (
            <View style={styles.streak}>
              <Icon name="flame" size={16} color={colors.orange} strokeWidth={2.2} />
              <Text style={styles.streakText}>{streak}</Text>
            </View>
          )}
          <Pressable onPress={onOpenSettings} hitSlop={8} accessibilityRole="button" accessibilityLabel="Ajustes y privacidad" style={styles.settingsButton}>
            <Icon name="sliders" size={20} />
          </Pressable>
        </View>
      }>
      <GlassCard contentStyle={styles.hero}>
        <View style={styles.heroText}>
          <Text style={type.overline}>Balance total</Text>
          <Text
            style={[type.display, { fontSize: fitFontSize(money(model.balance), 34, 20) }, model.balance < 0 && { color: colors.softRed }]}
            numberOfLines={1}>
            {money(model.balance)}
          </Text>
          <View style={styles.flowRow}>
            <Icon name="arrowUp" size={14} color={colors.neonGreen} strokeWidth={2.4} />
            <Text style={[type.caption, { color: colors.neonGreen }]}>{money(model.income)}</Text>
          </View>
          <View style={styles.flowRow}>
            <Icon name="arrowDown" size={14} color={colors.softRed} strokeWidth={2.4} />
            <Text style={[type.caption, { color: colors.softRed }]}>{money(model.spent)}</Text>
          </View>
          <Text style={[type.caption, styles.monthNote]}>Movimientos de este mes</Text>
        </View>
        <GlassCard blur={false} elevated={false} radius={90} onPress={() => setBudgetOpen(true)} accessibilityLabel="Editar presupuesto">
          <ProgressRing progress={hasBudget ? model.progress : 0} size={138} stroke={12}>
            {hasBudget ? (
              <>
                <Text style={type.overline}>Restante</Text>
                <Text
                  style={[styles.remaining, { fontSize: fitFontSize(money(model.remaining), 17, 12, 9) }, model.remaining < 0 && { color: colors.softRed }]}
                  numberOfLines={1}>
                  {money(model.remaining)}
                </Text>
                <Text style={type.caption}>{Math.round(model.progress * 100)}% usado</Text>
              </>
            ) : (
              <>
                <Icon name="plus" size={20} color={colors.cyan} />
                <Text style={[type.caption, styles.centerText]}>Definir{'\n'}presupuesto</Text>
              </>
            )}
          </ProgressRing>
        </GlassCard>
      </GlassCard>

      <View style={styles.actions}>
        <GlassButton style={styles.flex} icon="mic" label="Dictar" compact onPress={() => onQuickEntry('voice')} />
        <GlassButton style={styles.flex} icon="keyboard" label="Escribir" compact onPress={() => onQuickEntry('text')} />
        <GlassButton style={styles.flex} icon="camera" label="Recibo" compact onPress={() => onQuickEntry('receipt')} />
      </View>

      {insights.length > 0 && <SectionTitle title="Alertas del copiloto" />}
      <InsightCards insights={insights} onPress={insight => insight.id === 'pending' && onNavigate('transactions')} />

      <CopilotChat />

      <SectionTitle title="Recientes" actionLabel={model.recent.length ? 'Ver todos' : undefined} onAction={() => onNavigate('transactions')} />
      {model.recent.length === 0 ? (
        <GlassCard blur={false} elevated={false} radius={radii.md} contentStyle={styles.empty}>
          <Text style={type.caption}>Toca + para registrar tu primer gasto. Puedes dictar la descripción o adjuntar la foto del recibo.</Text>
        </GlassCard>
      ) : (
        <View style={styles.list}>
          {model.recent.map(tx => (
            <TransactionRow key={tx.id} tx={tx} onEdit={onEditTransaction} onDelete={onDeleteTransaction} onConfirm={onConfirmPending} />
          ))}
        </View>
      )}
      <BudgetSheet visible={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  hero: { flexDirection: 'row', alignItems: 'center', padding: 18, gap: 12 },
  heroText: { flex: 1, gap: 4 },
  flowRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  monthNote: { color: colors.textFaint, fontSize: 11 },
  remaining: { fontWeight: '700', color: colors.text, maxWidth: 100 },
  centerText: { textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 8 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255,160,98,0.18)', borderWidth: 1, borderColor: 'rgba(255,160,98,0.5)' },
  streakText: { color: colors.text, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  settingsButton: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.glassFill, borderWidth: 1, borderColor: colors.glassBorder },
  list: { gap: 10 },
  empty: { padding: 16 },
  budgetInput: { fontSize: 26, fontWeight: '700' },
});
