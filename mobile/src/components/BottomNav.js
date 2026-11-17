import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { haptic } from '../services/device';
import { useReducedEffects } from '../state/FinanceContext';
import { colors, radii } from '../theme';
import { GlassCard } from './Glass';
import { Icon } from './Icon';

export const TABS = [
  { id: 'dashboard', label: 'Inicio', icon: 'home' },
  { id: 'transactions', label: 'Movimientos', icon: 'list' },
  { id: 'analytics', label: 'Analítica', icon: 'chart' },
  { id: 'goals', label: 'Metas', icon: 'trophy' },
];

export const NAV_HEIGHT = 68;

function TabButton({ tab, focused, onPress }) {
  const active = useRef(new Animated.Value(focused ? 1 : 0)).current;
  useEffect(() => {
    Animated.spring(active, { toValue: focused ? 1 : 0, useNativeDriver: true, speed: 18, bounciness: 10 }).start();
  }, [active, focused]);

  const iconStyle = {
    transform: [
      { translateY: active.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) },
      { scale: active.interpolate({ inputRange: [0, 1], outputRange: [1, 1.18] }) },
    ],
  };
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={tab.label}
      style={styles.tab}
      onPress={() => {
        haptic();
        onPress(tab.id);
      }}>
      <Animated.View style={iconStyle}>
        <Icon name={tab.icon} size={22} color={focused ? colors.text : colors.textFaint} />
      </Animated.View>
      <Animated.View style={[styles.indicator, { opacity: active, transform: [{ scaleX: active }] }]} />
      <Text style={[styles.label, focused && styles.labelActive]} numberOfLines={1}>
        {tab.label}
      </Text>
    </Pressable>
  );
}

function AIFab({ onPress, onLongPress }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const press = useRef(new Animated.Value(0)).current;
  const reduced = useReducedEffects();

  useEffect(() => {
    if (reduced) {
      pulse.setValue(1);
      return undefined;
    }
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: 2200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, reduced]);

  const springTo = toValue => Animated.spring(press, { toValue, useNativeDriver: true, speed: 40 }).start();

  return (
    <View style={styles.fabSlot} pointerEvents="box-none">
      <Animated.View
        pointerEvents="none"
        style={[
          styles.fabPulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.7] }) }],
          },
        ]}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Registrar movimiento. Mantén presionado para dictar."
        onPressIn={() => {
          haptic();
          springTo(1);
        }}
        onPressOut={() => springTo(0)}
        onPress={onPress}
        onLongPress={onLongPress}>
        <Animated.View style={[styles.fab, { transform: [{ scale: press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.92] }) }] }]}>
          <Svg style={StyleSheet.absoluteFill}>
            <Defs>
              <LinearGradient id="fab" x1="0" y1="0" x2="1" y2="1">
                <Stop offset="0" stopColor="#A855F7" />
                <Stop offset="0.55" stopColor="#6D28D9" />
                <Stop offset="1" stopColor="#2563EB" />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" rx={32} fill="url(#fab)" />
          </Svg>
          <Animated.View style={[StyleSheet.absoluteFill, styles.fabGlow, { opacity: press }]} />
          <Icon name="plus" size={28} strokeWidth={2.4} />
        </Animated.View>
      </Pressable>
    </View>
  );
}

export function BottomNav({ current, onChange, onAIPress, onAILongPress }) {
  const insets = useSafeAreaInsets();
  const [left, right] = [TABS.slice(0, 2), TABS.slice(2)];
  return (
    <View style={[styles.wrapper, { bottom: Math.max(insets.bottom, 10) + 6 }]} pointerEvents="box-none">
      <GlassCard radius={radii.lg} contentStyle={styles.bar}>
        {left.map(tab => (
          <TabButton key={tab.id} tab={tab} focused={current === tab.id} onPress={onChange} />
        ))}
        <View style={styles.fabSpacer} />
        {right.map(tab => (
          <TabButton key={tab.id} tab={tab} focused={current === tab.id} onPress={onChange} />
        ))}
      </GlassCard>
      <AIFab onPress={onAIPress} onLongPress={onAILongPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 16, right: 16 },
  bar: { height: NAV_HEIGHT, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' },
  label: { fontSize: 10.5, fontWeight: '600', color: colors.textFaint, marginTop: 4 },
  labelActive: { color: colors.text },
  indicator: { position: 'absolute', bottom: 7, width: 18, height: 3, borderRadius: 2, backgroundColor: colors.cyan },
  fabSpacer: { width: 72 },
  fabSlot: { position: 'absolute', top: -26, alignSelf: 'center', alignItems: 'center', justifyContent: 'center' },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    shadowColor: colors.purple,
    shadowOpacity: 0.7,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 14,
  },
  fabGlow: { backgroundColor: 'rgba(255,255,255,0.22)' },
  fabPulse: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: colors.violet },
});
