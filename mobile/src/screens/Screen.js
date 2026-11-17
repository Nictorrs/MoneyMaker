import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NAV_HEIGHT } from '../components/BottomNav';
import { colors, type } from '../theme';

export function useScreenPadding() {
  const insets = useSafeAreaInsets();
  return {
    paddingTop: insets.top + 12,
    paddingBottom: Math.max(insets.bottom, 10) + NAV_HEIGHT + 56,
    paddingHorizontal: 16,
  };
}

export function ScreenHeader({ overline, title, right }) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        {overline ? <Text style={type.overline}>{overline}</Text> : null}
        <Text style={type.title}>{title}</Text>
      </View>
      {right}
    </View>
  );
}

export function Screen({ overline, title, right, children }) {
  const padding = useScreenPadding();
  return (
    <ScrollView contentContainerStyle={[padding, styles.content]} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
      <ScreenHeader overline={overline} title={title} right={right} />
      {children}
    </ScrollView>
  );
}

export function SectionTitle({ title, actionLabel, onAction }) {
  return (
    <View style={styles.section}>
      <Text style={type.heading}>{title}</Text>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={10}>
          <Text style={styles.action}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: 16 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  headerText: { flex: 1, gap: 2 },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8 },
  action: { fontSize: 13, fontWeight: '600', color: colors.cyan },
});
