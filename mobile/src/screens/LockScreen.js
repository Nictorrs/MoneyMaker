import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, GlassInput } from '../components/Fields';
import { GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { attemptsLeft, lockMessage } from '../lib/auth';
import { haptic } from '../services/device';
import { useAuth } from '../state/AuthContext';
import { useFinance } from '../state/FinanceContext';
import { colors, type } from '../theme';

const LOGO = require('../../assets/brand/logo-mark.png');

/** Ojo para mostrar u ocultar la contraseña. */
function RevealButton({ visible, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
      <Icon name={visible ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export function LockScreen() {
  const insets = useSafeAreaInsets();
  const { username: savedUsername, lockedUntil, failedAttempts, unlock, refresh } = useAuth();
  const { wipeAllData } = useFinance();
  const [username, setUsername] = useState(savedUsername || '');
  const [password, setPassword] = useState('');
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const passwordRef = useRef(null);

  const waiting = lockMessage(lockedUntil, now);

  // Mientras dura la espera, el contador se refresca cada segundo.
  useEffect(() => {
    if (!lockedUntil || lockedUntil <= now) {
      return undefined;
    }
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [lockedUntil, now]);

  const hint = useMemo(() => {
    if (waiting || !failedAttempts) {
      return null;
    }
    const left = attemptsLeft(failedAttempts);
    return left > 0 ? `Te quedan ${left} ${left === 1 ? 'intento' : 'intentos'} antes de una pausa.` : null;
  }, [failedAttempts, waiting]);

  const submit = async () => {
    if (busy || waiting) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await unlock({ username, password });
      if (result.ok) {
        setPassword('');
        return;
      }
      haptic();
      setNow(Date.now());
      setError(
        result.reason === 'locked'
          ? 'Demasiados intentos fallidos.'
          : 'Usuario o contraseña incorrectos.',
      );
      setPassword('');
      passwordRef.current?.focus();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const forgotten = () =>
    Alert.alert(
      '¿Olvidaste tu contraseña?',
      'Tus datos viven solo en este teléfono y nadie más tiene una copia, así que no hay forma de recuperar la contraseña. '
        + 'Puedes borrar todo y empezar de nuevo; si guardaste un respaldo cifrado, podrás restaurarlo después.',
      [
        { text: 'Volver', style: 'cancel' },
        {
          text: 'Borrar y empezar de nuevo',
          style: 'destructive',
          onPress: async () => {
            await wipeAllData();
            await refresh();
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[styles.container, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled">
        <View style={styles.logo}>
          <Image source={LOGO} style={styles.logoMark} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        <Text style={[type.display, styles.center]}>MoneyMaker</Text>
        <Text style={[type.body, styles.center, styles.muted]}>
          {savedUsername ? `Hola de nuevo, ${savedUsername}.` : 'Ingresa para ver tus finanzas.'}
        </Text>

        <GlassCard contentStyle={styles.form}>
          <Field label="Usuario">
            <GlassInput
              value={username}
              onChangeText={setUsername}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="username"
              textContentType="username"
              placeholder="tu usuario"
              returnKeyType="next"
              editable={!busy}
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
          </Field>
          <Field label="Contraseña">
            <GlassInput
              ref={passwordRef}
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!reveal}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              placeholder="tu contraseña"
              returnKeyType="go"
              editable={!busy}
              onSubmitEditing={submit}
              right={<RevealButton visible={reveal} onPress={() => setReveal(v => !v)} />}
            />
          </Field>

          {(error || waiting || hint) && (
            <View style={styles.notice}>
              {(error || waiting) && (
                <Icon name={waiting ? 'clock' : 'alert'} size={16} color={colors.softRed} />
              )}
              <Text style={[type.caption, (error || waiting) && styles.noticeText]}>{waiting || error || hint}</Text>
            </View>
          )}

          <GlassButton
            variant="primary"
            icon="lock"
            label={waiting ? 'Espera un momento' : 'Entrar'}
            loading={busy}
            disabled={Boolean(waiting) || !username.trim() || !password}
            onPress={submit}
          />
        </GlassCard>

        <Pressable onPress={forgotten} hitSlop={10} accessibilityRole="button">
          <Text style={[type.caption, styles.link]}>Olvidé mi contraseña</Text>
        </Pressable>
        <Text style={[type.caption, styles.center, styles.footnote]}>
          Tu contraseña se comprueba dentro del teléfono. MoneyMaker no la guarda ni la envía a ningún servidor.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { paddingHorizontal: 20, gap: 14, flexGrow: 1, justifyContent: 'center' },
  logo: {
    alignSelf: 'center',
    width: 88,
    height: 88,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F2FC',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.8)',
    marginBottom: 6,
  },
  logoMark: { width: 62, height: 51 },
  center: { textAlign: 'center' },
  muted: { color: colors.textMuted, marginBottom: 8 },
  form: { padding: 18, gap: 16 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  noticeText: { color: colors.softRed, flexShrink: 1 },
  link: { color: colors.cyan, fontWeight: '700', textAlign: 'center', paddingVertical: 8 },
  footnote: { color: colors.textFaint, marginTop: 4 },
});
