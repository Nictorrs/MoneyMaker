import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radii, type } from '../theme';
import { GlassCard } from './Glass';
import { Icon } from './Icon';

/** Hoja inferior de cristal con entrada deslizante y fondo atenuado. */
export function Sheet({ visible, onClose, title, subtitle, children, footer }) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
    }
    Animated.timing(progress, {
      toValue: visible ? 1 : 0,
      duration: visible ? 320 : 220,
      easing: visible ? Easing.out(Easing.cubic) : Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => finished && !visible && setMounted(false));
  }, [progress, visible]);

  if (!mounted) {
    return null;
  }
  const translateY = progress.interpolate({ inputRange: [0, 1], outputRange: [height * 0.6, 0] });

  return (
    <Modal transparent visible statusBarTranslucent animationType="none" onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, { opacity: progress }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Cerrar" />
      </Animated.View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={[styles.anchor, { paddingTop: insets.top + 12 }]}
        pointerEvents="box-none">
        <Animated.View style={[styles.frame, { transform: [{ translateY }], maxHeight: height * 0.92 }]}>
          <GlassCard radius={radii.lg} style={styles.card} contentStyle={[styles.cardContent, { paddingBottom: insets.bottom + 16 }]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <View style={styles.headerText}>
                {title ? <Text style={type.title}>{title}</Text> : null}
                {subtitle ? <Text style={type.caption}>{subtitle}</Text> : null}
              </View>
              <Pressable onPress={onClose} hitSlop={12} accessibilityLabel="Cerrar" style={styles.close}>
                <Icon name="close" size={18} color={colors.textMuted} />
              </Pressable>
            </View>
            {/* La zona desplazable se encoge para que cabecera y botones siempre queden visibles. */}
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body} style={styles.scroll}>
              {children}
            </ScrollView>
            {footer ? <View style={styles.footer}>{footer}</View> : null}
          </GlassCard>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: colors.scrim },
  anchor: { flex: 1, justifyContent: 'flex-end' },
  frame: { flexShrink: 1 },
  card: { marginHorizontal: 8, marginBottom: 8, backgroundColor: 'rgba(22,12,52,0.55)', borderRadius: radii.lg, flexShrink: 1 },
  cardContent: { flexShrink: 1 },
  scroll: { flexShrink: 1 },
  handle: { alignSelf: 'center', width: 42, height: 5, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.35)', marginTop: 10 },
  header: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 14, gap: 12 },
  headerText: { flex: 1, gap: 4 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.1)' },
  body: { padding: 20, gap: 14 },
  footer: { paddingHorizontal: 20, gap: 10 },
});
