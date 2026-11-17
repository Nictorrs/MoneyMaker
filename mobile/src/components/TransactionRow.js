import React, { memo, useMemo, useRef } from 'react';
import { Animated, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

import { formatMoney } from '../lib/format';
import { haptic } from '../services/device';
import { absoluteFill, categoryMeta, colors, radii, type } from '../theme';
import { GlassCard } from './Glass';
import { Icon } from './Icon';

const ACTIONS_WIDTH = 148;

export const SOURCE_LABELS = {
  manual: 'Manual',
  ai: 'Texto',
  voice: 'Voz',
  receipt: 'Recibo',
  sms: 'SMS',
  notification: 'Notificación',
};

export const CategoryBubble = memo(function CategoryBubble({ category, size = 44 }) {
  const meta = categoryMeta(category);
  return (
    <View
      style={[
        styles.bubble,
        { width: size, height: size, borderRadius: size / 2.6, backgroundColor: `${meta.color}2E`, borderColor: `${meta.color}88`, shadowColor: meta.color },
      ]}>
      <Icon name={meta.icon} size={size * 0.48} color={meta.color} strokeWidth={2} />
    </View>
  );
});

/** Deslizar a la izquierda revela Editar y Eliminar. */
function SwipeActions({ children, onEdit, onDelete }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const offset = useRef(0);

  const snapTo = toValue => {
    offset.current = toValue;
    Animated.spring(translateX, { toValue, useNativeDriver: true, speed: 20, bounciness: 4 }).start();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 10 && Math.abs(g.dx) > Math.abs(g.dy) * 1.6,
        onPanResponderTerminationRequest: () => false,
        onPanResponderMove: (_, g) => {
          translateX.setValue(Math.min(0, Math.max(-ACTIONS_WIDTH * 1.25, offset.current + g.dx)));
        },
        onPanResponderRelease: (_, g) => {
          const position = offset.current + g.dx;
          const open = position < -ACTIONS_WIDTH / 2 || g.vx < -0.4;
          if (open && offset.current === 0) {
            haptic();
          }
          snapTo(open && g.vx < 0.4 ? -ACTIONS_WIDTH : 0);
        },
        onPanResponderTerminate: () => snapTo(offset.current),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const actionsOpacity = translateX.interpolate({ inputRange: [-ACTIONS_WIDTH, -24, 0], outputRange: [1, 0.3, 0] });
  const run = action => () => {
    snapTo(0);
    action();
  };

  return (
    <View>
      <Animated.View style={[styles.actions, { opacity: actionsOpacity }]}>
        <Pressable accessibilityLabel="Editar" onPress={run(onEdit)} style={[styles.action, styles.editAction]}>
          <Icon name="edit" size={20} />
          <Text style={styles.actionLabel}>Editar</Text>
        </Pressable>
        <Pressable accessibilityLabel="Eliminar" onPress={run(onDelete)} style={[styles.action, styles.deleteAction]}>
          <Icon name="trash" size={20} />
          <Text style={styles.actionLabel}>Eliminar</Text>
        </Pressable>
      </Animated.View>
      <Animated.View style={{ transform: [{ translateX }] }} {...responder.panHandlers}>
        {children}
      </Animated.View>
    </View>
  );
}

/** Memorizada: en listas largas solo se vuelve a dibujar la fila cuyo movimiento cambió. */
export const TransactionRow = memo(function TransactionRow({ tx, onEdit, onDelete, onConfirm }) {
  const income = tx.type === 'income';
  const pending = tx.status === 'pending';
  const meta = categoryMeta(tx.category);
  const subtitle = [tx.merchant && tx.merchant !== tx.description ? tx.merchant : meta.label, SOURCE_LABELS[tx.source]]
    .filter(Boolean)
    .join(' · ');

  return (
    <SwipeActions onEdit={() => onEdit(tx)} onDelete={() => onDelete(tx)}>
      <GlassCard blur={false} elevated={false} radius={radii.md} onPress={() => onEdit(tx)} contentStyle={styles.row}>
        <CategoryBubble category={tx.category} />
        <View style={styles.texts}>
          <Text style={type.heading} numberOfLines={1}>
            {tx.description}
          </Text>
          <Text style={type.caption} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
        <View style={styles.right}>
          <Text style={[styles.amount, { color: income ? colors.neonGreen : colors.softRed }]}>
            {formatMoney(income ? tx.amount : -tx.amount, tx.currency, { sign: true })}
          </Text>
          {pending && (
            <Pressable accessibilityLabel="Confirmar movimiento detectado" onPress={() => onConfirm(tx)} style={styles.confirm}>
              <Icon name="check" size={14} color={colors.night} strokeWidth={2.6} />
              <Text style={styles.confirmLabel}>Confirmar</Text>
            </Pressable>
          )}
        </View>
      </GlassCard>
    </SwipeActions>
  );
});

const styles = StyleSheet.create({
  bubble: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, shadowOpacity: 0.6, shadowRadius: 10, shadowOffset: { width: 0, height: 0 } },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  texts: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  amount: { fontSize: 16, fontWeight: '700', letterSpacing: -0.3 },
  confirm: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.neonGreen, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 4 },
  confirmLabel: { fontSize: 12, fontWeight: '700', color: colors.night },
  actions: { ...absoluteFill, flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  action: { width: (ACTIONS_WIDTH - 8) / 2, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', gap: 4, borderWidth: 1, borderColor: colors.glassBorder },
  actionLabel: { fontSize: 11, fontWeight: '600', color: colors.text },
  editAction: { backgroundColor: 'rgba(37,99,235,0.55)' },
  deleteAction: { backgroundColor: 'rgba(255,90,90,0.55)' },
});
