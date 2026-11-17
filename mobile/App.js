import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StatusBar, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { BottomNav } from './src/components/BottomNav';
import { GlassCard } from './src/components/Glass';
import { MeshBackground } from './src/components/MeshBackground';
import { toDraft } from './src/lib/personalization';
import { AnalyticsScreen } from './src/screens/AnalyticsScreen';
import { DashboardScreen } from './src/screens/DashboardScreen';
import { GoalsScreen } from './src/screens/GoalsScreen';
import { LockScreen } from './src/screens/LockScreen';
import { TransactionsScreen } from './src/screens/TransactionsScreen';
import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { voiceSupported } from './src/services/device';
import { SettingsSheet } from './src/sheets/SettingsSheet';
import { TransactionConfirmSheet } from './src/sheets/TransactionConfirmSheet';
import { TransactionSheet } from './src/sheets/TransactionSheet';
import { AuthProvider, useAuth } from './src/state/AuthContext';
import { FinanceProvider, useFinance } from './src/state/FinanceContext';
import { colors, radii, type } from './src/theme';

const TOAST_MS = 4500;

function TabTransition({ children }) {
  const enter = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(enter, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 4 }).start();
  }, [enter]);
  const translateY = enter.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });
  return <Animated.View style={[styles.flex, { opacity: enter, transform: [{ translateY }] }]}>{children}</Animated.View>;
}

/** Degradado bajo la barra de estado para que el contenido no choque con el reloj al desplazarse. */
const TopScrim = React.memo(function TopScrim() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const height = insets.top + 16;
  return (
    <View pointerEvents="none" style={[styles.topScrim, { height }]} renderToHardwareTextureAndroid shouldRasterizeIOS>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id="topScrim" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.night} stopOpacity="0.92" />
            <Stop offset="0.65" stopColor={colors.night} stopOpacity="0.55" />
            <Stop offset="1" stopColor={colors.night} stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#topScrim)" />
      </Svg>
    </View>
  );
});

function Toast({ toast, onAction }) {
  const insets = useSafeAreaInsets();
  if (!toast) {
    return null;
  }
  return (
    <View style={[styles.toast, { top: insets.top + 8 }]} pointerEvents="box-none">
      <GlassCard radius={radii.pill} contentStyle={styles.toastBody}>
        <Text style={[type.body, styles.toastText]}>{toast.message}</Text>
        {toast.undo && (
          <Pressable onPress={onAction} hitSlop={10}>
            <Text style={styles.undo}>Deshacer</Text>
          </Pressable>
        )}
      </GlassCard>
    </View>
  );
}

function Shell() {
  const { ready, settings, preferences, deleteTransaction, saveTransaction } = useFinance();
  const { ready: authReady, locked } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [editor, setEditor] = useState({ visible: false, tx: null, autoStart: null });
  const [confirm, setConfirm] = useState({ visible: false, payload: null });
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = useCallback(next => {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const openEditor = useCallback(tx => setEditor({ visible: true, tx, autoStart: null }), []);
  const closeEditor = useCallback(() => setEditor(e => ({ ...e, visible: false })), []);
  // Registro nuevo: 'text' abre el formulario; 'voice' empieza a dictar la descripción; 'receipt' abre la cámara.
  const openQuickEntry = useCallback(
    mode => setEditor({ visible: true, tx: null, autoStart: mode === 'voice' || mode === 'receipt' ? mode : null }),
    [],
  );
  const closeConfirm = useCallback(() => setConfirm(c => ({ ...c, visible: false })), []);

  // Las alertas bancarias pendientes también pasan por la confirmación con categoría editable.
  const onConfirmPending = useCallback(
    tx =>
      setConfirm({
        visible: true,
        payload: {
          drafts: [toDraft(tx, preferences, 'bank-parser')],
          capture: tx.source === 'notification' ? 'notification' : 'sms',
          discardLabel: 'Ahora no',
        },
      }),
    [preferences],
  );

  const onConfirmSaved = useCallback(
    ({ saved, corrections }) =>
      showToast({
        message: corrections
          ? `Guardado · ${corrections === 1 ? 'tu corrección ajustará' : `${corrections} correcciones ajustarán`} las próximas sugerencias`
          : saved.length > 1
            ? `${saved.length} movimientos guardados`
            : 'Movimiento guardado',
      }),
    [showToast],
  );

  const removeTransaction = useCallback(
    async tx => {
      await deleteTransaction(tx.id);
      showToast({ message: 'Movimiento eliminado', undo: () => saveTransaction(tx) });
    },
    [deleteTransaction, saveTransaction, showToast],
  );

  const runToastAction = useCallback(async () => {
    clearTimeout(toastTimer.current);
    const undo = toast?.undo;
    setToast(null);
    await undo?.();
  }, [toast]);

  const openSettings = useCallback(() => setSettingsOpen(true), []);

  if (!ready || !authReady) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.text} size="large" />
      </View>
    );
  }
  if (locked) {
    return <LockScreen />;
  }
  if (!settings.onboarded) {
    return <WelcomeScreen />;
  }

  const shared = { onEditTransaction: openEditor, onDeleteTransaction: removeTransaction, onConfirmPending };
  const screens = {
    dashboard: <DashboardScreen {...shared} onQuickEntry={openQuickEntry} onNavigate={setTab} onOpenSettings={openSettings} />,
    transactions: <TransactionsScreen {...shared} />,
    analytics: <AnalyticsScreen />,
    goals: <GoalsScreen />,
  };

  return (
    <View style={styles.flex}>
      <TabTransition key={tab}>{screens[tab]}</TabTransition>
      <TopScrim />
      <BottomNav
        current={tab}
        onChange={setTab}
        onAIPress={() => openQuickEntry('text')}
        onAILongPress={() => openQuickEntry(voiceSupported ? 'voice' : 'text')}
      />
      <TransactionConfirmSheet visible={confirm.visible} payload={confirm.payload} onClose={closeConfirm} onSaved={onConfirmSaved} />
      <TransactionSheet visible={editor.visible} initial={editor.tx} autoStart={editor.autoStart} onClose={closeEditor} />
      <SettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toast toast={toast} onAction={runToastAction} />
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <AuthProvider>
        <FinanceProvider>
          <View style={styles.root}>
            <MeshBackground />
            <Shell />
          </View>
        </FinanceProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.night },
  flex: { flex: 1 },
  topScrim: { position: 'absolute', top: 0, left: 0, right: 0 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  toast: { position: 'absolute', left: 16, right: 16, alignItems: 'center' },
  toastBody: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingVertical: 10, paddingHorizontal: 18 },
  toastText: { flexShrink: 1 },
  undo: { color: colors.cyan, fontWeight: '700' },
});
