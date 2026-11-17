import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Switch, Text, View } from 'react-native';

import { AccessSettings } from '../components/AccessSettings';
import { Field, GlassInput, Segmented } from '../components/Fields';
import { GlassButton, GlassCard } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { formatAmountInput, parseAmountInput } from '../lib/format';
import { backupSupported, exportBackup, importBackup, MIN_PASSPHRASE_LENGTH } from '../services/backup';
import { useAuth } from '../state/AuthContext';
import { useFinance } from '../state/FinanceContext';
import { colors, radii, type } from '../theme';

const CURRENCIES = ['COP', 'USD', 'EUR', 'MXN'].map(id => ({ id, label: id }));

function Section({ icon, color, title, children }) {
  return (
    <GlassCard blur={false} elevated={false} radius={radii.md} contentStyle={styles.section}>
      <View style={styles.sectionHeader}>
        <Icon name={icon} size={18} color={color} />
        <Text style={type.heading}>{title}</Text>
      </View>
      {children}
    </GlassCard>
  );
}

export function SettingsSheet({ visible, onClose }) {
  const { settings, preferences, updateSettings, reload, wipeAllData } = useFinance();
  const { refresh: refreshAuth } = useAuth();
  const [currency, setCurrency] = useState(settings.currency);
  const [budget, setBudget] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(null);
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    if (visible) {
      setCurrency(settings.currency);
      setBudget(settings.budget ? formatAmountInput(settings.budget) : '');
      setPassphrase('');
      setConfirmation('');
      setNotice(null);
    }
  }, [settings.budget, settings.currency, visible]);

  const runBackup = async (kind, action) => {
    setBusy(kind);
    setNotice(null);
    try {
      const counts = await action(passphrase);
      if (!counts) {
        return;
      }
      setPassphrase('');
      setConfirmation('');
      if (kind === 'import') {
        await reload();
      }
      setNotice({
        tone: 'ok',
        text: `${kind === 'export' ? 'Respaldo guardado' : 'Respaldo restaurado'}: ${counts.transactions} movimientos y ${counts.goals} metas.`,
      });
    } catch (error) {
      setNotice({ tone: 'error', text: error.message });
    } finally {
      setBusy(null);
    }
  };

  const createBackup = () => {
    if (passphrase !== confirmation) {
      setNotice({ tone: 'error', text: 'Las contraseñas no coinciden.' });
      return;
    }
    runBackup('export', exportBackup);
  };

  const restoreBackup = () =>
    Alert.alert(
      'Restaurar respaldo',
      'Se reemplazarán todos tus movimientos, metas y ajustes actuales por los del archivo.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Restaurar', style: 'destructive', onPress: () => runBackup('import', importBackup) },
      ],
    );

  const confirmWipe = () =>
    Alert.alert(
      'Borrar todos los datos',
      'Se eliminarán de este teléfono todos tus movimientos, metas y ajustes. No se puede deshacer.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Borrar todo',
          style: 'destructive',
          onPress: async () => {
            onClose();
            await wipeAllData();
            // El borrado total también quita el usuario y la contraseña.
            await refreshAuth();
          },
        },
      ],
    );

  return (
    <Sheet visible={visible} onClose={onClose} title="Ajustes y privacidad">
      <Section icon="chart" color={colors.cyan} title="Presupuesto y moneda">
        <Segmented options={CURRENCIES} value={currency} onChange={setCurrency} />
        <Field label="Presupuesto de gastos del mes">
          <GlassInput value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholder="2.500.000" />
        </Field>
        <GlassButton compact icon="check" label="Guardar" onPress={() => updateSettings({ currency, budget: parseAmountInput(budget) || 0 })} />
      </Section>

      <Section icon="lock" color={colors.cyan} title="Acceso">
        <AccessSettings />
      </Section>

      <Section icon="shield" color={colors.neonGreen} title="Privacidad">
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={type.body}>Bloquear capturas de pantalla</Text>
            <Text style={type.caption}>También oculta tus saldos en la vista de apps recientes.</Text>
          </View>
          <Switch
            value={settings.secureScreen}
            onValueChange={value => updateSettings({ secureScreen: value })}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.emerald }}
            thumbColor={colors.text}
          />
        </View>
      </Section>

      <Section icon="sparkles" color={colors.violet} title="Categorías aprendidas">
        <Text style={type.caption}>
          Cuando corriges la categoría sugerida de una alerta bancaria, la app lo recuerda y ajusta sus próximas sugerencias. Todo queda en este teléfono.
        </Text>
        <Text style={styles.meta}>
          {preferences.size === 1 ? '1 preferencia aprendida' : `${preferences.size} preferencias aprendidas`}
        </Text>
      </Section>

      <Section icon="bolt" color={colors.amber} title="Rendimiento">
        <View style={styles.switchRow}>
          <View style={styles.flex}>
            <Text style={type.body}>Modo ahorro de batería</Text>
            <Text style={type.caption}>
              Quita el desenfoque y detiene la animación del fondo. Se activa solo si tu sistema pide reducir el movimiento.
            </Text>
          </View>
          <Switch
            value={settings.reduceEffects}
            onValueChange={value => updateSettings({ reduceEffects: value })}
            trackColor={{ false: 'rgba(255,255,255,0.2)', true: colors.emerald }}
            thumbColor={colors.text}
          />
        </View>
      </Section>

      <Section icon="cloud" color={colors.violet} title="Respaldo cifrado en tu nube">
        {backupSupported ? (
          <>
            <Text style={type.caption}>
              Se cifra con tu contraseña (AES-256-GCM) y lo guardas donde elijas: Google Drive, OneDrive, Dropbox o el
              teléfono. Ni MoneyMaker ni tu proveedor de nube pueden leerlo.
            </Text>
            <GlassInput value={passphrase} onChangeText={setPassphrase} placeholder={`Contraseña (mín. ${MIN_PASSPHRASE_LENGTH} caracteres)`} secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <GlassInput value={confirmation} onChangeText={setConfirmation} placeholder="Repite la contraseña" secureTextEntry autoCapitalize="none" autoCorrect={false} />
            <View style={styles.row}>
              <GlassButton style={styles.flex} compact icon="arrowUp" label="Crear" loading={busy === 'export'} disabled={Boolean(busy)} onPress={createBackup} />
              <GlassButton style={styles.flex} compact icon="arrowDown" label="Restaurar" loading={busy === 'import'} disabled={Boolean(busy)} onPress={restoreBackup} />
            </View>
            <Text style={styles.warning}>Si olvidas la contraseña, el respaldo no se puede recuperar.</Text>
          </>
        ) : (
          <Text style={type.caption}>Los respaldos cifrados están disponibles en Android.</Text>
        )}
        {notice && <Text style={[styles.notice, { color: notice.tone === 'ok' ? colors.neonGreen : colors.softRed }]}>{notice.text}</Text>}
      </Section>

      <Section icon="trash" color={colors.softRed} title="Zona de peligro">
        <Text style={type.caption}>Elimina todos los datos guardados en este teléfono y vuelve al inicio.</Text>
        <GlassButton compact icon="trash" label="Borrar todos los datos" onPress={confirmWipe} />
      </Section>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  row: { flexDirection: 'row', gap: 10 },
  section: { padding: 16, gap: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  warning: { fontSize: 11.5, color: colors.amber },
  notice: { fontWeight: '600' },
  meta: { fontSize: 11.5, color: colors.textFaint },
});
