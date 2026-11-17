import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { passwordStrength, validatePassword, validateUsername } from '../lib/auth';
import { LOCK_DELAYS, useAuth } from '../state/AuthContext';
import { colors, type } from '../theme';
import { Field, GlassInput, Segmented } from './Fields';
import { GlassButton } from './Glass';
import { Icon } from './Icon';

const EMPTY_FORM = { username: '', current: '', password: '', confirm: '' };

/** Contenido de la sección "Acceso" de Ajustes: crear, cambiar o quitar la contraseña. */
export function AccessSettings() {
  const { configured, username, lockDelay, setLockDelay, saveCredentials, removeCredentials } = useAuth();
  const [mode, setMode] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setNotice(null);
  };

  const open = next => {
    setMode(current => (current === next ? null : next));
    setForm(EMPTY_FORM);
    setNotice(null);
    setReveal(false);
  };

  const strength = form.password ? passwordStrength(form.password) : null;

  const save = async () => {
    const creating = mode === 'create';
    const problem = (creating ? validateUsername(form.username) : null)
      || validatePassword(form.password, { username: creating ? form.username : username })
      || (form.password === form.confirm ? null : 'Las contraseñas no coinciden.');
    if (problem) {
      setNotice({ tone: 'error', text: problem });
      return;
    }
    setBusy(true);
    try {
      await saveCredentials({
        username: creating ? form.username.trim() : undefined,
        password: form.password,
        currentPassword: creating ? null : form.current,
      });
      setMode(null);
      setForm(EMPTY_FORM);
      setNotice({ tone: 'ok', text: creating ? 'Bloqueo activado.' : 'Contraseña actualizada.' });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(false);
    }
  };

  const remove = () =>
    Alert.alert(
      'Quitar el bloqueo',
      'La app volverá a abrirse sin pedir contraseña. Tus movimientos no se borran.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Quitar',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            try {
              await removeCredentials({ password: form.current });
              setMode(null);
              setForm(EMPTY_FORM);
              setNotice({ tone: 'ok', text: 'La app ya no pide contraseña.' });
            } catch (error) {
              setNotice({ tone: 'error', text: error.message });
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );

  const passwordField = (key, label, placeholder) => (
    <Field label={label}>
      <GlassInput
        value={form[key]}
        onChangeText={value => set(key, value)}
        secureTextEntry={!reveal}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={placeholder}
        right={
          <Pressable onPress={() => setReveal(v => !v)} hitSlop={12} accessibilityRole="button">
            <Icon name={reveal ? 'eyeOff' : 'eye'} size={20} color={colors.textMuted} />
          </Pressable>
        }
      />
    </Field>
  );

  return (
    <View style={styles.gap}>
      {configured ? (
        <>
          <View style={styles.row}>
            <Text style={type.body}>Usuario</Text>
            <Text style={[type.body, styles.value]}>{username}</Text>
          </View>
          <Text style={type.caption}>
            La app pide la contraseña al abrirse y al volver desde otras apps.
          </Text>
          <Field label="Volver a pedirla después de">
            <Segmented
              options={LOCK_DELAYS.map(({ id, label }) => ({ id, label }))}
              value={String(lockDelay / 1000)}
              onChange={id => setLockDelay(Number(id) * 1000)}
            />
          </Field>
        </>
      ) : (
        <Text style={type.caption}>
          Sin bloqueo, cualquiera que tome tu teléfono desbloqueado puede ver tus finanzas. La contraseña se guarda
          cifrada en un solo sentido dentro del teléfono: ni MoneyMaker ni nadie más puede leerla, y si la olvidas no
          hay forma de recuperarla.
        </Text>
      )}

      {mode === 'create' && (
        <>
          <Field label="Usuario">
            <GlassInput
              value={form.username}
              onChangeText={value => set('username', value)}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="nicolas"
            />
          </Field>
          {passwordField('password', 'Contraseña', 'mínimo 8 caracteres')}
          {passwordField('confirm', 'Repite la contraseña', 'otra vez')}
        </>
      )}

      {mode === 'change' && (
        <>
          {passwordField('current', 'Contraseña actual', 'la de ahora')}
          {passwordField('password', 'Contraseña nueva', 'mínimo 8 caracteres')}
          {passwordField('confirm', 'Repite la nueva', 'otra vez')}
        </>
      )}

      {mode === 'remove' && passwordField('current', 'Contraseña actual', 'para confirmar que eres tú')}

      {strength && mode !== 'remove' && (
        <Text style={type.caption}>Fuerza de la contraseña: {strength.label.toLowerCase()}.</Text>
      )}

      {notice && (
        <View style={styles.row}>
          <Icon
            name={notice.tone === 'ok' ? 'check' : 'alert'}
            size={16}
            color={notice.tone === 'ok' ? colors.neonGreen : colors.softRed}
          />
          <Text style={[type.caption, styles.notice, notice.tone === 'error' && styles.error]}>{notice.text}</Text>
        </View>
      )}

      {mode === 'create' || mode === 'change' ? (
        <View style={styles.actions}>
          <GlassButton compact label="Cancelar" icon="close" onPress={() => open(null)} />
          <GlassButton compact variant="primary" icon="check" label="Guardar" loading={busy} onPress={save} />
        </View>
      ) : mode === 'remove' ? (
        <View style={styles.actions}>
          <GlassButton compact label="Cancelar" icon="close" onPress={() => open(null)} />
          <GlassButton compact icon="trash" label="Quitar bloqueo" loading={busy} disabled={!form.current} onPress={remove} />
        </View>
      ) : configured ? (
        <View style={styles.actions}>
          <GlassButton compact icon="lock" label="Cambiar contraseña" onPress={() => open('change')} />
          <GlassButton compact icon="close" label="Quitar bloqueo" onPress={() => open('remove')} />
        </View>
      ) : (
        <GlassButton compact variant="primary" icon="lock" label="Activar el bloqueo" onPress={() => open('create')} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  gap: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { color: colors.textMuted, flexShrink: 1 },
  notice: { flexShrink: 1 },
  error: { color: colors.softRed },
  actions: { flexDirection: 'row', gap: 10 },
});
