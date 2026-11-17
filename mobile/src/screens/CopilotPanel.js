import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { answerCopilot, COPILOT_QUESTIONS } from '../lib/copilot';
import { haptic } from '../services/device';
import { useFinance } from '../state/FinanceContext';
import { colors, radii, type } from '../theme';

const TONES = {
  warning: { color: colors.amber, icon: 'alert' },
  positive: { color: colors.neonGreen, icon: 'check' },
  info: { color: colors.cyan, icon: 'info' },
};

export function InsightCards({ insights, onPress }) {
  if (insights.length === 0) {
    return null;
  }
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.insights}>
      {insights.map(insight => {
        const tone = TONES[insight.tone];
        return (
          <GlassCard key={insight.id} style={styles.insight} radius={radii.md} onPress={() => onPress?.(insight)} contentStyle={styles.insightBody}>
            <View style={[styles.toneBar, { backgroundColor: tone.color, shadowColor: tone.color }]} />
            <View style={styles.insightHeader}>
              <Icon name={tone.icon} size={16} color={tone.color} strokeWidth={2.2} />
              <Text style={[type.heading, styles.flex]} numberOfLines={1}>
                {insight.title}
              </Text>
            </View>
            <Text style={type.caption} numberOfLines={4}>
              {insight.body}
            </Text>
          </GlassCard>
        );
      })}
    </ScrollView>
  );
}

/**
 * Copiloto con preguntas fijas: el usuario elige una pregunta y la respuesta se
 * calcula en el teléfono con los totales del mes. No usa IA ni internet.
 */
export function CopilotChat() {
  const { model, settings } = useFinance();
  const [selected, setSelected] = useState(null);

  const ask = id => {
    haptic();
    setSelected(id);
  };

  const question = COPILOT_QUESTIONS.find(q => q.id === selected);
  // Se recalcula con cada cambio de datos: la respuesta nunca queda desactualizada.
  const answer = question ? answerCopilot(question.id, model, { currency: settings.currency }) : null;

  return (
    <GlassCard contentStyle={styles.chat}>
      <View style={styles.chatHeader}>
        <View style={styles.avatar}>
          <Icon name="sparkles" size={18} strokeWidth={2} />
        </View>
        <View style={styles.flex}>
          <Text style={type.heading}>Copiloto financiero</Text>
          <Text style={type.caption}>Elige una pregunta sobre tu mes</Text>
        </View>
      </View>

      {question && (
        <>
          <View style={[styles.bubble, styles.userBubble]}>
            <Text style={type.body}>{question.label}</Text>
          </View>
          <View style={[styles.bubble, styles.botBubble]}>
            <Text style={type.body}>{answer}</Text>
            <Text style={styles.offline}>Calculado en tu teléfono</Text>
          </View>
        </>
      )}

      <View style={styles.suggestions}>
        {COPILOT_QUESTIONS.map(q => (
          <Pressable
            key={q.id}
            onPress={() => ask(q.id)}
            accessibilityRole="button"
            style={[styles.suggestion, q.id === selected && styles.suggestionActive]}>
            <Text style={type.caption}>{q.label}</Text>
          </Pressable>
        ))}
      </View>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  insights: { gap: 12, paddingRight: 16 },
  insight: { width: 250 },
  insightBody: { padding: 14, paddingLeft: 18, gap: 6, minHeight: 118 },
  toneBar: { position: 'absolute', left: 0, top: 14, bottom: 14, width: 3, borderRadius: 2, shadowOpacity: 1, shadowRadius: 6, shadowOffset: { width: 0, height: 0 } },
  insightHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  chat: { padding: 16, gap: 12 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(124,58,237,0.7)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)' },
  bubble: { maxWidth: '88%', padding: 12, borderRadius: 18, gap: 4 },
  userBubble: { alignSelf: 'flex-end', backgroundColor: 'rgba(37,99,235,0.55)', borderBottomRightRadius: 6 },
  botBubble: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.1)', borderWidth: 1, borderColor: colors.glassBorder, borderBottomLeftRadius: 6 },
  offline: { fontSize: 10.5, color: colors.textFaint },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { borderRadius: radii.pill, borderWidth: 1, borderColor: colors.glassBorder, paddingHorizontal: 12, paddingVertical: 6 },
  suggestionActive: { borderColor: colors.cyan, backgroundColor: 'rgba(34,211,238,0.12)' },
});
