import React, { useEffect, useRef, useState } from 'react';
import { Animated, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Field, GlassInput, Segmented } from '../components/Fields';
import { GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { passwordStrength, validatePassword, validateUsername } from '../lib/auth';
import { parseAmountInput } from '../lib/format';
import { automationSupported } from '../services/device';
import { useAuth } from '../state/AuthContext';
import { useFinance } from '../state/FinanceContext';
import { colors, radii, type } from '../theme';
import { AutomationCard } from './TransactionsScreen';

const PILLARS = [
  { icon: 'lock', color: colors.neonGreen, title: 'Local-first, sin registro', body: 'Tus movimientos y tu contraseña viven en el almacenamiento privado de la app en tu teléfono. No hay cuentas ni servidores de terceros.' },
  { icon: 'shield', color: colors.cyan, title: 'Todo se calcula en tu teléfono', body: 'El copiloto, las alertas y la lectura de alertas bancarias funcionan sin internet. Las fotos de recibos quedan como evidencia en el teléfono.' },
  { icon: 'cloud', color: colors.violet, title: 'Tu nube, tus reglas', body: 'Respaldos cifrados con tu contraseña que guardas en tu propia nube: Drive, OneDrive o Dropbox. Nadie más puede leerlos.' },
];

const STANDARDS = [
  'La contraseña de acceso se guarda derivada con PBKDF2, nunca en texto',
  'HTTPS obligatorio: el tráfico sin cifrar está bloqueado',
  'Base de datos excluida de los respaldos automáticos del sistema',
  'Bloqueo de capturas de pantalla opcional, desde Ajustes',
  'Las alertas bancarias se analizan dentro del dispositivo',
  'Respaldos cifrados con AES-256-GCM y una clave derivada de tu contraseña',
  'El copiloto responde con cálculos locales: tus datos no salen del teléfono',
];

const CURRENCIES = ['COP', 'USD', 'EUR', 'MXN'].map(id => ({ id, label: id }));

const LOGO = require('../../assets/brand/logo-mark.png');

function FadeIn({ children, delay = 0 }) {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(value, { toValue: 1, duration: 520, delay, useNativeDriver: true }).start();
  }, [delay, value]);
  const translateY = value.interpolate({ inputRange: [0, 1], outputRange: [18, 0] });
  return <Animated.View style={{ opacity: value, transform: [{ translateY }] }}>{children}</Animated.View>;
}

export function WelcomeScreen() {
  const insets = useSafeAreaInsets();
  const { settings, updateSettings, loadDemoData } = useFinance();
  const { saveCredentials } = useAuth();
  const [step, setStep] = useState(0);
  const [currency, setCurrency] = useState(settings.currency);
  const [budget, setBudget] = useState('');
  const [access, setAccess] = useState({ username: '', password: '', confirm: '' });
  const [accessError, setAccessError] = useState(null);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const finish = async demo => {
    setBusy(true);
    setError(null);
    try {
      await updateSettings({ currency, budget: parseAmountInput(budget) || 0 });
      if (demo) {
        await loadDemoData();
      }
      await updateSettings({ onboarded: true });
    } catch (e) {
      setError(`No se pudo completar la configuración: ${e.message}`);
      setBusy(false);
    }
  };

  const updateAccess = (key, value) => {
    setAccess(current => ({ ...current, [key]: value }));
    setAccessError(null);
  };

  const createAccess = async () => {
    const problem = validateUsername(access.username)
      || validatePassword(access.password, { username: access.username })
      || (access.password === access.confirm ? null : 'Las contraseñas no coinciden.');
    if (problem) {
      setAccessError(problem);
      return;
    }
    setBusy(true);
    setAccessError(null);
    try {
      await saveCredentials({ username: access.username.trim(), password: access.password });
      setAccess({ username: access.username, password: '', confirm: '' });
      setStep(2);
    } catch (e) {
      setAccessError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const strength = access.password ? passwordStrength(access.password) : null;

  const steps = [
    <View key="privacy" style={styles.gap}>
      <FadeIn>
        <View style={styles.logo}>
          <Image source={LOGO} style={styles.logoMark} resizeMode="contain" accessibilityIgnoresInvertColors />
        </View>
        <Text style={[type.display, styles.center]}>MoneyMaker</Text>
        <Text style={[type.body, styles.center, styles.muted]}>Tus finanzas en piloto automático, sin fricción y sin ceder tus datos.</Text>
      </FadeIn>
      {PILLARS.map((pillar, i) => (
        <FadeIn key={pillar.title} delay={120 * (i + 1)}>
          <GlassCard contentStyle={styles.pillar}>
            <View style={[styles.pillarIcon, { backgroundColor: `${pillar.color}26`, borderColor: `${pillar.color}88` }]}>
              <Icon name={pillar.icon} color={pillar.color} />
            </View>
            <View style={styles.flex}>
              <Text style={type.heading}>{pillar.title}</Text>
              <Text style={type.caption}>{pillar.body}</Text>
            </View>
          </GlassCard>
        </FadeIn>
      ))}
      <FadeIn delay={520}>
        <GlassCard blur={false} elevated={false} radius={radii.md} contentStyle={styles.standards}>
          <Text style={type.overline}>Estándares de protección</Text>
          {STANDARDS.map(item => (
            <View key={item} style={styles.standard}>
              <Icon name="check" size={16} color={colors.neonGreen} strokeWidth={2.4} />
              <Text style={[type.caption, styles.flex]}>{item}</Text>
            </View>
          ))}
        </GlassCard>
      </FadeIn>
      <GlassButton variant="primary" label="Continuar" icon="chevron" onPress={() => setStep(1)} />
    </View>,

    <View key="access" style={styles.gap}>
      <FadeIn>
        <Text style={type.title}>Crea tu acceso</Text>
        <Text style={[type.caption, styles.spaced]}>
          Un usuario y una contraseña para que nadie más abra la app. Se quedan en este teléfono, cifrados en un solo
          sentido: ni MoneyMaker puede leerlos. Si olvidas la contraseña no hay forma de recuperarla, solo empezar de
          nuevo.
        </Text>
      </FadeIn>
      <GlassCard contentStyle={styles.form}>
        <Field label="Usuario">
          <GlassInput
            value={access.username}
            onChangeText={value => updateAccess('username', value)}
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="username"
            placeholder="nicolas"
          />
        </Field>
        <Field label="Contraseña">
          <GlassInput
            value={access.password}
            onChangeText={value => updateAccess('password', value)}
            secureTextEntry={!reveal}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="mínimo 8 caracteres"
            right={
              <Pressable onPress={() => setReveal(v => !v)} hitSlop={12} accessibilityRole="button">
                <Icon name={reveal ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
              </Pressable>
            }
          />
        </Field>
        <Field label="Repite la contraseña">
          <GlassInput
            value={access.confirm}
            onChangeText={value => updateAccess('confirm', value)}
            secureTextEntry={!reveal}
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="otra vez"
          />
        </Field>
        {strength && <Text style={type.caption}>Fuerza de la contraseña: {strength.label.toLowerCase()}.</Text>}
        {accessError && <Text style={styles.error}>{accessError}</Text>}
      </GlassCard>
      <GlassButton variant="primary" label="Crear acceso" icon="lock" loading={busy} onPress={createAccess} />
    </View>,

    <View key="setup" style={styles.gap}>
      <FadeIn>
        <Text style={type.title}>Tu punto de partida</Text>
        <Text style={[type.caption, styles.spaced]}>Con un presupuesto mensual, el copiloto puede anticipar sobregiros.</Text>
      </FadeIn>
      <GlassCard contentStyle={styles.form}>
        <Field label="Moneda principal">
          <Segmented options={CURRENCIES} value={currency} onChange={setCurrency} />
        </Field>
        <Field label="Presupuesto de gastos del mes">
          <GlassInput value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="2.500.000" inputStyle={styles.budget} />
        </Field>
      </GlassCard>
      <GlassButton variant="primary" label="Continuar" icon="chevron" onPress={() => (automationSupported ? setStep(3) : finish(false))} />
      <GlassButton label="Explorar con datos de ejemplo" icon="sparkles" loading={busy} onPress={() => finish(true)} />
    </View>,

    <View key="automation" style={styles.gap}>
      <FadeIn>
        <Text style={type.title}>Registro automático</Text>
        <Text style={[type.caption, styles.spaced]}>
          Convierte las alertas de tu banco en movimientos pendientes de confirmar. Puedes activarlo después desde Movimientos.
        </Text>
      </FadeIn>
      <AutomationCard />
      <GlassButton variant="primary" label="Empezar" icon="check" loading={busy} onPress={() => finish(false)} />
      <GlassButton label="Empezar con datos de ejemplo" icon="sparkles" onPress={() => finish(true)} />
    </View>,
  ];

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingTop: insets.top + 32, paddingBottom: insets.bottom + 32 }]} keyboardShouldPersistTaps="handled">
      <View style={styles.dots}>
        {steps.map((_, i) => (
          <View key={i} style={[styles.dot, i === step && styles.dotActive]} />
        ))}
      </View>
      {steps[step]}
      {error && <Text style={styles.error}>{error}</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, gap: 20 },
  gap: { gap: 14 },
  flex: { flex: 1, gap: 4 },
  center: { textAlign: 'center' },
  muted: { color: colors.textMuted, marginTop: 6, marginBottom: 10 },
  spaced: { marginTop: 6 },
  logo: { alignSelf: 'center', width: 88, height: 88, borderRadius: 26, alignItems: 'center', justifyContent: 'center', backgroundColor: '#F4F2FC', borderWidth: 1, borderColor: 'rgba(255,255,255,0.8)', marginBottom: 14 },
  logoMark: { width: 62, height: 51 },
  pillar: { flexDirection: 'row', gap: 14, padding: 16, alignItems: 'center' },
  pillarIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
  standards: { padding: 16, gap: 10 },
  standard: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  form: { padding: 18, gap: 18 },
  budget: { fontSize: 24, fontWeight: '700' },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)' },
  dotActive: { width: 22, backgroundColor: colors.cyan },
  error: { color: colors.softRed, fontWeight: '600', textAlign: 'center' },
});
