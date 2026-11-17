import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, Platform, SectionList, StyleSheet, Text, View } from 'react-native';

import { Chip, GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { TransactionRow } from '../components/TransactionRow';
import { formatDayLabel, formatMoney } from '../lib/format';
import {
  disableAutomation,
  enableNotificationReading,
  enableSmsReading,
  getAutomationStatus,
} from '../services/device';
import { useFinance, useTransactionPages } from '../state/FinanceContext';
import { colors, radii, type } from '../theme';
import { ScreenHeader, useScreenPadding } from './Screen';

const PAGE_SIZE = 30;

const FILTERS = [
  { id: 'all', label: 'Todos', color: colors.text },
  { id: 'expense', label: 'Gastos', color: colors.softRed },
  { id: 'income', label: 'Ingresos', color: colors.neonGreen },
  { id: 'pending', label: 'Por confirmar', color: colors.amber },
];

function AutomationRow({ icon, title, description, active, needsAccess, onEnable, onDisable }) {
  return (
    <View style={styles.autoRow}>
      <View style={[styles.autoIcon, active && styles.autoIconActive]}>
        <Icon name={icon} size={20} color={active ? colors.neonGreen : colors.textMuted} />
      </View>
      <View style={styles.flex}>
        <Text style={type.heading}>{title}</Text>
        <Text style={type.caption}>{needsAccess ? 'Falta conceder el acceso en Ajustes.' : description}</Text>
      </View>
      <GlassButton compact label={active ? 'Desactivar' : needsAccess ? 'Ajustes' : 'Activar'} onPress={active ? onDisable : onEnable} />
    </View>
  );
}

/** Onboarding y estado de la lectura en segundo plano de alertas bancarias. */
export function AutomationCard() {
  const [status, setStatus] = useState(null);
  const refresh = useCallback(async () => setStatus(await getAutomationStatus()), []);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', state => state === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  if (!status) {
    return null;
  }
  if (!status.supported) {
    return (
      <GlassCard blur={false} elevated={false} radius={radii.md} contentStyle={styles.autoCard}>
        <Text style={type.caption}>La lectura automática de alertas bancarias está disponible en Android.</Text>
      </GlassCard>
    );
  }
  const run = action => async () => {
    await action();
    refresh();
  };

  return (
    <GlassCard blur={false} radius={radii.md} contentStyle={styles.autoCard}>
      <View style={styles.autoHeader}>
        <Icon name="bolt" size={18} color={colors.amber} />
        <Text style={type.heading}>Registro automático</Text>
      </View>
      <AutomationRow
        icon="message"
        title="SMS bancarios"
        description="Compras y abonos que tu banco te envía por SMS."
        active={status.smsEnabled && status.smsPermission}
        onEnable={run(enableSmsReading)}
        onDisable={run(() => disableAutomation('sms'))}
      />
      <AutomationRow
        icon="bell"
        title="Notificaciones"
        description="Alertas de apps bancarias y de correo."
        active={status.notificationsEnabled && status.notificationAccess}
        needsAccess={status.notificationsEnabled && !status.notificationAccess}
        onEnable={run(enableNotificationReading)}
        onDisable={run(() => disableAutomation('notifications'))}
      />
      <View style={styles.privacy}>
        <Icon name="shield" size={14} color={colors.cyan} />
        <Text style={[styles.privacyText, styles.flex]}>
          El texto se analiza dentro del teléfono y solo se guardan monto, comercio y fecha, como pendientes de confirmar.
        </Text>
      </View>
    </GlassCard>
  );
}

const ListHeader = memo(function ListHeader({ filter, pendingCount, onFilter, onNew }) {
  return (
    <View style={styles.header}>
      <ScreenHeader overline="Gestor de transacciones" title="Movimientos" right={<GlassButton compact icon="plus" label="Nuevo" onPress={onNew} />} />
      <AutomationCard />
      <View style={styles.filters}>
        {FILTERS.map(f => (
          <Chip
            key={f.id}
            label={f.id === 'pending' && pendingCount ? `${f.label} (${pendingCount})` : f.label}
            color={f.color}
            active={filter === f.id}
            onPress={() => onFilter(f.id)}
          />
        ))}
      </View>
      <Text style={styles.hint}>Desliza un movimiento a la izquierda para editarlo o eliminarlo.</Text>
    </View>
  );
});

/** Agrupa por día una lista ya ordenada del más reciente al más antiguo. */
function groupByDay(items) {
  const sections = [];
  let current = null;
  for (const tx of items) {
    if (!current || current.date !== tx.date) {
      current = { date: tx.date, data: [], net: 0, currency: tx.currency };
      sections.push(current);
    }
    current.data.push(tx);
    current.net += tx.type === 'income' ? tx.amount : -tx.amount;
  }
  return sections;
}

/**
 * Gestor de transacciones virtualizado: solo se montan las filas visibles y las
 * páginas siguientes se piden a la base al acercarse al final de la lista.
 */
export function TransactionsScreen({ onEditTransaction, onDeleteTransaction, onConfirmPending }) {
  const padding = useScreenPadding();
  const { todayIso, model } = useFinance();
  const [filter, setFilter] = useState(model.pendingCount ? 'pending' : 'all');
  const { items, loading, hasMore, loadMore } = useTransactionPages(filter, PAGE_SIZE);
  const sections = useMemo(() => groupByDay(items), [items]);

  const renderItem = useCallback(
    ({ item }) => (
      <View style={styles.item}>
        <TransactionRow tx={item} onEdit={onEditTransaction} onDelete={onDeleteTransaction} onConfirm={onConfirmPending} />
      </View>
    ),
    [onConfirmPending, onDeleteTransaction, onEditTransaction],
  );

  const renderSectionHeader = useCallback(
    ({ section }) => (
      <View style={styles.sectionHeader}>
        <Text style={type.overline}>{formatDayLabel(section.date, todayIso)}</Text>
        <Text style={[type.caption, { color: section.net >= 0 ? colors.neonGreen : colors.textMuted }]}>
          {formatMoney(section.net, section.currency, { sign: true })}
        </Text>
      </View>
    ),
    [todayIso],
  );

  const onNew = useCallback(() => onEditTransaction(null), [onEditTransaction]);

  return (
    <SectionList
      sections={sections}
      keyExtractor={keyExtractor}
      renderItem={renderItem}
      renderSectionHeader={renderSectionHeader}
      contentContainerStyle={padding}
      stickySectionHeadersEnabled={false}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={<ListHeader filter={filter} pendingCount={model.pendingCount} onFilter={setFilter} onNew={onNew} />}
      ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator style={styles.footer} color={colors.textMuted} /> : null}
      ListEmptyComponent={
        loading ? (
          <ActivityIndicator style={styles.footer} color={colors.textMuted} />
        ) : (
          <Text style={[type.caption, styles.empty]}>
            {filter === 'pending' ? 'No hay movimientos por confirmar.' : 'Aún no hay movimientos aquí.'}
          </Text>
        )
      }
      onEndReached={hasMore ? loadMore : undefined}
      onEndReachedThreshold={0.6}
      initialNumToRender={12}
      maxToRenderPerBatch={10}
      updateCellsBatchingPeriod={40}
      windowSize={7}
      removeClippedSubviews={Platform.OS === 'android'}
    />
  );
}

const keyExtractor = tx => tx.id;

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: { gap: 14, marginBottom: 6 },
  filters: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hint: { ...type.caption, color: colors.textFaint, fontSize: 12 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14, marginBottom: 8, paddingHorizontal: 4 },
  item: { marginBottom: 10 },
  empty: { textAlign: 'center', marginTop: 32 },
  footer: { marginVertical: 20 },
  autoCard: { padding: 16, gap: 14 },
  autoHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  autoRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  autoIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.08)' },
  autoIconActive: { backgroundColor: 'rgba(61,255,162,0.15)' },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  privacyText: { fontSize: 11.5, color: colors.textFaint, lineHeight: 16 },
});
