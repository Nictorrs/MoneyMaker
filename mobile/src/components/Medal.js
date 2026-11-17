import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Stop } from 'react-native-svg';

import { formatDayLabel, toISODate } from '../lib/format';
import { arcPath, polar } from '../lib/geometry';
import { colors } from '../theme';
import { Icon } from './Icon';

const TIERS = {
  bronze: { light: '#F6C39A', base: '#C8773A', dark: '#7A3E14', ribbon: '#FB7185' },
  silver: { light: '#FFFFFF', base: '#C3CAD9', dark: '#6B7385', ribbon: '#60A5FA' },
  gold: { light: '#FFF3B0', base: '#F5C542', dark: '#A16207', ribbon: '#A78BFA' },
};

function starPath(cx, cy, outer, inner) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const p = polar(cx, cy, i % 2 ? inner : outer, i * 36);
    points.push(`${p.x},${p.y}`);
  }
  return `M${points.join(' L')} Z`;
}

/** Medalla renderizada; bloqueada se ve apagada con un arco de progreso. */
export function Medal({ badge, size = 76 }) {
  const tier = TIERS[badge.tier];
  const id = `${badge.id}-${badge.tier}`;
  const pop = useRef(new Animated.Value(badge.unlocked ? 0.6 : 1)).current;

  useEffect(() => {
    if (badge.unlocked) {
      Animated.spring(pop, { toValue: 1, useNativeDriver: true, speed: 8, bounciness: 14 }).start();
    }
  }, [badge.unlocked, pop]);

  const c = size / 2;
  const discR = size * 0.34;
  const discCy = size * 0.56;

  return (
    <View style={styles.wrap} accessibilityLabel={`${badge.title}: ${badge.unlocked ? 'desbloqueada' : `${Math.round(badge.progress * 100)}%`}`}>
      <Animated.View style={[{ width: size, height: size, transform: [{ scale: pop }] }, !badge.unlocked && styles.locked]}>
        <Svg width={size} height={size}>
          <Defs>
            <RadialGradient id={`disc-${id}`} cx="35%" cy="30%" r="75%">
              <Stop offset="0" stopColor={tier.light} />
              <Stop offset="0.55" stopColor={tier.base} />
              <Stop offset="1" stopColor={tier.dark} />
            </RadialGradient>
            <LinearGradient id={`ribbon-${id}`} x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={tier.ribbon} stopOpacity="0.95" />
              <Stop offset="1" stopColor={tier.ribbon} stopOpacity="0.55" />
            </LinearGradient>
          </Defs>
          <Path d={`M${c - size * 0.2},0 L${c - size * 0.02},${discCy - discR * 0.6} L${c - size * 0.16},${discCy - discR * 0.5} L${c - size * 0.34},0 Z`} fill={`url(#ribbon-${id})`} />
          <Path d={`M${c + size * 0.2},0 L${c + size * 0.02},${discCy - discR * 0.6} L${c + size * 0.16},${discCy - discR * 0.5} L${c + size * 0.34},0 Z`} fill={`url(#ribbon-${id})`} />
          <Circle cx={c} cy={discCy} r={discR} fill={`url(#disc-${id})`} stroke={tier.light} strokeOpacity={0.8} strokeWidth={1.5} />
          <Circle cx={c} cy={discCy} r={discR * 0.74} fill="none" stroke={tier.dark} strokeOpacity={0.45} strokeWidth={1.5} />
          <Path d={starPath(c, discCy, discR * 0.46, discR * 0.2)} fill={tier.light} fillOpacity={0.92} stroke={tier.dark} strokeOpacity={0.35} />
          {!badge.unlocked && badge.progress > 0 && (
            <Path d={arcPath(c, discCy, discR + 5, 0, 360 * badge.progress)} stroke={colors.cyan} strokeWidth={3} strokeLinecap="round" fill="none" />
          )}
        </Svg>
        {!badge.unlocked && (
          <View style={[styles.lock, { top: discCy - 11, left: c - 11 }]}>
            <Icon name="lock" size={14} color={colors.text} />
          </View>
        )}
      </Animated.View>
      <Text style={styles.title} numberOfLines={1}>
        {badge.title}
      </Text>
      <Text style={styles.description} numberOfLines={2}>
        {badge.unlocked ? badge.description : `${Math.round(badge.progress * 100)}% · ${badge.description}`}
      </Text>
      {badge.unlockedAt != null && (
        <Text style={styles.earned}>{`Ganada: ${formatDayLabel(toISODate(new Date(badge.unlockedAt)), toISODate())}`}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', width: 100, gap: 2 },
  locked: { opacity: 0.5 },
  lock: { position: 'absolute', width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(10,6,32,0.75)' },
  title: { fontSize: 12, fontWeight: '700', color: colors.text, marginTop: 4 },
  description: { fontSize: 10.5, color: colors.textFaint, textAlign: 'center', lineHeight: 14 },
  earned: { fontSize: 10, fontWeight: '600', color: colors.amber, textAlign: 'center' },
});
