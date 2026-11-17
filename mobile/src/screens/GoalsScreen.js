import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Medal } from '../components/Medal';
import { ProgressBar } from '../components/Progress';
import { formatMoney } from '../lib/format';
import { evaluateBadges, lastMonthTotals } from '../lib/gamification';
import { GoalSheet } from '../sheets/GoalSheet';
import { useActivityStats, useFinance } from '../state/FinanceContext';
import { colors, radii, type } from '../theme';
import { Screen, SectionTitle } from './Screen';

const BAR_COLORS = [colors.neonGreen, colors.cyan, colors.violet, colors.amber];

function StreakCard({ icon, color, value, label }) {
  return (
    <GlassCard blur={false} style={styles.flex} radius={radii.md} contentStyle={styles.streak}>
      <View style={[styles.streakIcon, { backgroundColor: `${color}26`, borderColor: `${color}80` }]}>
        <Icon name={icon} size={20} color={color} strokeWidth={2.2} />
      </View>
      <View>
        <Text style={styles.streakValue}>
          {value} <Text style={type.caption}>{value === 1 ? 'día' : 'días'}</Text>
        </Text>
        <Text style={type.caption}>{label}</Text>
      </View>
    </GlassCard>
  );
}

export function GoalsScreen() {
  const { goals, settings, todayIso, overview, badgeUnlocks } = useFinance();
  const [sheet, setSheet] = useState({ visible: false, goal: null });

  // Mismas estadísticas (y caché) con las que FinanceContext guarda las insignias ganadas.
  const stats = useActivityStats();
  const { sinceDate } = stats;
  const lastMonth = useMemo(() => lastMonthTotals(overview.monthlyTotals, todayIso), [overview.monthlyTotals, todayIso]);
  const gamification = useMemo(
    () =>
      stats.data
        ? evaluateBadges(stats.data, goals, { todayIso, budget: settings.budget, sinceDate, lastMonth, unlocks: badgeUnlocks })
        : null,
    [stats.data, goals, todayIso, settings.budget, sinceDate, lastMonth, badgeUnlocks],
  );
  const unlocked = gamification ? gamification.badges.filter(b => b.unlocked).length : 0;

  return (
    <Screen overline="Gamificación" title="Metas y logros">
      {gamification ? (
        <View style={styles.row}>
          <StreakCard icon="flame" color={colors.orange} value={gamification.loggingStreak} label="Racha de registro" />
          <StreakCard icon="shield" color={colors.neonGreen} value={gamification.underBudgetStreak} label="Bajo presupuesto" />
        </View>
      ) : (
        <ActivityIndicator color={colors.textMuted} />
      )}

      <SectionTitle title="Metas de ahorro" actionLabel="+ Nueva" onAction={() => setSheet({ visible: true, goal: null })} />
      {goals.length === 0 && (
        <GlassCard blur={false} onPress={() => setSheet({ visible: true, goal: null })} radius={radii.md} contentStyle={styles.emptyGoal}>
          <Icon name="plus" color={colors.cyan} />
          <Text style={type.caption}>Crea tu primera meta: un viaje, un fondo de emergencia, un portátil…</Text>
        </GlassCard>
      )}
      {goals.map((goal, i) => {
        const progress = goal.target > 0 ? goal.saved / goal.target : 0;
        const color = BAR_COLORS[i % BAR_COLORS.length];
        return (
          <GlassCard key={goal.id} blur={false} onPress={() => setSheet({ visible: true, goal })} contentStyle={styles.goal}>
            <View style={styles.goalHeader}>
              <Text style={styles.emoji}>{goal.emoji || '🎯'}</Text>
              <View style={styles.flex}>
                <Text style={type.heading}>{goal.name}</Text>
                <Text style={type.caption}>
                  {formatMoney(goal.saved, settings.currency)} de {formatMoney(goal.target, settings.currency)}
                </Text>
              </View>
              <Text style={[styles.percent, { color }]}>{Math.min(100, Math.round(progress * 100))}%</Text>
            </View>
            <ProgressBar progress={progress} color={color} />
            {progress >= 1 && <Text style={[type.caption, { color: colors.neonGreen }]}>¡Meta cumplida! 🎉</Text>}
          </GlassCard>
        );
      })}

      {gamification && (
        <>
          <SectionTitle title={`Insignias · ${unlocked}/${gamification.badges.length}`} />
          <GlassCard blur={false} contentStyle={styles.badges}>
            {gamification.badges.map(badge => (
              <Medal key={badge.id} badge={badge} />
            ))}
          </GlassCard>
        </>
      )}

      <GoalSheet visible={sheet.visible} goal={sheet.goal} onClose={() => setSheet(s => ({ ...s, visible: false }))} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  streak: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 14 },
  streakIcon: { width: 40, height: 40, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  streakValue: { fontSize: 22, fontWeight: '700', color: colors.text },
  emptyGoal: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  goal: { padding: 16, gap: 12 },
  goalHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  emoji: { fontSize: 30 },
  percent: { fontSize: 18, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-around', rowGap: 18, padding: 16 },
});
