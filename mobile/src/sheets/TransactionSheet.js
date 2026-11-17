import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { launchCamera, launchImageLibrary } from 'react-native-image-picker';

import { CategoryPicker, Field, GlassInput, Segmented } from '../components/Fields';
import { Chip, GlassButton } from '../components/Glass';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { addDays, formatAmountInput, fromISODate, parseAmountInput, textFieldError, toISODate } from '../lib/format';
import { haptic, listen, stopListening, voiceSupported } from '../services/device';
import { store } from '../services/storage';
import { useFinance } from '../state/FinanceContext';
import { colors, fitCategory, radii, type } from '../theme';

const TYPE_OPTIONS = [
  { id: 'expense', label: 'Gasto', color: colors.softRed },
  { id: 'income', label: 'Ingreso', color: colors.neonGreen },
];

const DESCRIPTION_MAX = 120;
const PICKER_OPTIONS = { mediaType: 'photo', maxWidth: 1600, maxHeight: 1600, quality: 0.8, saveToPhotos: false, includeBase64: false };

const isValidDate = iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) && toISODate(fromISODate(iso)) === iso;

/** Vista a pantalla completa de la foto del recibo. */
function ReceiptViewer({ uri, onClose }) {
  return (
    <Modal visible={Boolean(uri)} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.viewer} onPress={onClose} accessibilityLabel="Cerrar foto">
        {uri ? <Image source={{ uri }} style={styles.viewerImage} resizeMode="contain" /> : null}
        <Text style={[type.caption, styles.viewerHint]}>Toca para cerrar</Text>
      </Pressable>
    </Modal>
  );
}

/**
 * Crear, editar o confirmar un movimiento.
 *
 * - El micrófono transcribe literalmente lo que dices en la descripción; no
 *   interpreta montos ni categorías.
 * - La foto del recibo se guarda como evidencia del gasto; no se lee.
 *
 * `autoStart` ('voice' | 'receipt') abre el dictado o la cámara al mostrarse.
 */
export function TransactionSheet({ visible, initial, autoStart, onClose }) {
  const { todayIso, settings, saveTransaction, deleteTransaction } = useFinance();
  const [form, setForm] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceUsed, setVoiceUsed] = useState(false);
  // { uri, dirty }: dirty indica que hay que guardar (uri) o borrar (uri null) la foto.
  const [receipt, setReceipt] = useState(null);
  const [viewing, setViewing] = useState(null);
  const session = useRef(0);

  const update = useCallback(patch => setForm(prev => ({ ...prev, ...patch })), []);

  const startVoice = useCallback(async () => {
    const id = session.current;
    setError(null);
    setListening(true);
    try {
      const clip = text => String(text || '').slice(0, DESCRIPTION_MAX);
      const transcript = await listen({ onPartial: partial => id === session.current && update({ description: clip(partial) }) });
      if (id === session.current) {
        if (transcript && transcript.trim()) {
          update({ description: clip(transcript) });
          setVoiceUsed(true);
          haptic('success');
        } else {
          setError('No escuché nada. Toca el micrófono e intenta de nuevo.');
        }
      }
    } catch (e) {
      if (id === session.current) {
        setError(e.message);
      }
    } finally {
      if (id === session.current) {
        setListening(false);
      }
    }
  }, [update]);

  const pickReceipt = useCallback(async fromLibrary => {
    const id = session.current;
    setError(null);
    const picked = await (fromLibrary ? launchImageLibrary(PICKER_OPTIONS) : launchCamera(PICKER_OPTIONS));
    if (id !== session.current || picked.didCancel) {
      return;
    }
    if (picked.errorCode) {
      setError(picked.errorMessage || 'No se pudo abrir la cámara.');
      return;
    }
    const asset = picked.assets?.[0];
    if (asset?.uri) {
      setReceipt({ uri: asset.uri, dirty: true });
    }
  }, []);

  useEffect(() => {
    if (!visible) {
      session.current += 1;
      stopListening();
      setListening(false);
      return undefined;
    }
    const id = ++session.current;
    const base = initial || {};
    setForm({
      type: base.type || 'expense',
      amount: base.amount ? formatAmountInput(base.amount) : '',
      description: base.description || '',
      merchant: base.merchant || '',
      category: fitCategory(base.type || 'expense', base.category || 'other', 'other'),
      date: base.date || todayIso,
    });
    setError(null);
    setVoiceUsed(false);
    setReceipt(null);
    if (base.id) {
      store
        .getReceipt(base.id)
        .then(uri => id === session.current && uri && setReceipt({ uri, dirty: false }))
        .catch(() => {});
    }
    if (autoStart === 'voice' && voiceSupported) {
      startVoice();
    } else if (autoStart === 'receipt') {
      pickReceipt(false);
    }
    return undefined;
    // Solo al abrir: `initial` y `autoStart` cambian junto con `visible`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, initial, autoStart]);

  if (!form) {
    return null;
  }
  const existing = Boolean(initial?.id);
  const pending = initial?.status === 'pending';

  const save = async () => {
    const amount = parseAmountInput(form.amount);
    if (!(amount > 0)) {
      return setError('Escribe un monto mayor que cero.');
    }
    if (!form.description.trim()) {
      return setError('Agrega una descripción corta.');
    }
    const textError =
      textFieldError(form.description) ||
      (form.merchant.trim() ? textFieldError(form.merchant, { label: 'El comercio', minLetters: 1 }) : null);
    if (textError) {
      return setError(textError);
    }
    if (!isValidDate(form.date)) {
      return setError('La fecha debe tener el formato AAAA-MM-DD.');
    }
    stopListening();
    setSaving(true);
    let saved;
    try {
      saved = await saveTransaction({
        ...(initial || {}),
        type: form.type,
        amount,
        description: form.description.trim(),
        merchant: form.merchant.trim() || null,
        category: form.category,
        date: form.date,
        currency: initial?.currency || settings.currency,
        source: initial?.source || (receipt?.uri ? 'receipt' : voiceUsed ? 'voice' : 'manual'),
        status: 'confirmed',
      });
    } catch (e) {
      setSaving(false);
      return setError(e.message);
    }
    try {
      if (receipt?.dirty) {
        await (receipt.uri ? store.saveReceipt(saved.id, receipt.uri) : store.deleteReceipt(saved.id));
      }
    } catch {
      // El movimiento ya quedó guardado: se avisa y se cierra para no duplicarlo.
      Alert.alert('Foto no guardada', 'El movimiento se guardó, pero no se pudo guardar la foto del recibo. Ábrelo y vuelve a adjuntarla.');
    }
    setSaving(false);
    onClose();
  };

  const remove = async () => {
    await deleteTransaction(initial.id);
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={pending ? 'Confirmar movimiento' : existing ? 'Editar movimiento' : 'Nuevo movimiento'}
      subtitle={pending ? 'Detectado automáticamente desde una alerta bancaria.' : undefined}
      footer={
        <View style={styles.actions}>
          {existing && <GlassButton style={styles.flex} icon="trash" label={pending ? 'Descartar' : 'Eliminar'} onPress={remove} />}
          <GlassButton style={styles.flex} variant="primary" icon="check" label={pending ? 'Confirmar' : 'Guardar'} loading={saving} onPress={save} />
        </View>
      }>
      <Segmented
        options={TYPE_OPTIONS}
        value={form.type}
        onChange={value => update({ type: value, category: fitCategory(value, form.category) })}
      />
      <Field label="Monto">
        <GlassInput value={form.amount} onChangeText={amount => update({ amount })} placeholder="0" keyboardType="decimal-pad" inputStyle={styles.amount} />
      </Field>
      <Field label="Descripción">
        <GlassInput
          value={form.description}
          onChangeText={description => update({ description })}
          placeholder={voiceSupported ? 'Almuerzo (o toca el micrófono y dicta)' : 'Almuerzo'}
          maxLength={DESCRIPTION_MAX}
          multiline
          editable={!listening}
          right={
            voiceSupported ? (
              <Pressable
                onPress={listening ? stopListening : startVoice}
                hitSlop={10}
                accessibilityLabel={listening ? 'Detener dictado' : 'Dictar descripción'}
                style={[styles.mic, listening && styles.micActive]}>
                <Icon name="mic" size={20} color={listening ? colors.night : colors.text} />
              </Pressable>
            ) : null
          }
        />
        {listening && <Text style={styles.listening}>Te escucho… se escribirá tal cual lo digas.</Text>}
      </Field>
      <Field label="Comercio (opcional)">
        <GlassInput value={form.merchant} onChangeText={merchant => update({ merchant })} placeholder="Crepes & Waffles" maxLength={60} />
      </Field>
      <Field label="Categoría">
        <CategoryPicker txType={form.type} value={form.category} onChange={category => update({ category })} />
      </Field>
      <Field label="Fecha">
        <View style={styles.dateRow}>
          <Chip label="Hoy" active={form.date === todayIso} onPress={() => update({ date: todayIso })} />
          <Chip label="Ayer" active={form.date === addDays(todayIso, -1)} onPress={() => update({ date: addDays(todayIso, -1) })} />
          <GlassInput style={styles.flex} value={form.date} onChangeText={date => update({ date })} placeholder="AAAA-MM-DD" maxLength={10} />
        </View>
      </Field>
      <Field label="Foto del recibo (opcional)">
        {receipt?.uri ? (
          <View style={styles.receiptRow}>
            <Pressable onPress={() => setViewing(receipt.uri)} accessibilityLabel="Ver foto del recibo" style={styles.thumb}>
              <Image source={{ uri: receipt.uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />
            </Pressable>
            <View style={[styles.flex, styles.receiptActions]}>
              <GlassButton compact icon="camera" label="Cambiar" onPress={() => pickReceipt(false)} />
              <GlassButton compact icon="trash" label="Quitar" onPress={() => setReceipt({ uri: null, dirty: true })} />
            </View>
          </View>
        ) : (
          <View style={styles.dateRow}>
            <GlassButton style={styles.flex} compact icon="camera" label="Cámara" onPress={() => pickReceipt(false)} />
            <GlassButton style={styles.flex} compact icon="scan" label="Galería" onPress={() => pickReceipt(true)} />
          </View>
        )}
        <Text style={type.caption}>Se guarda como evidencia en este teléfono. No se incluye en el respaldo cifrado.</Text>
      </Field>
      {error && <Text style={styles.error}>{error}</Text>}
      <ReceiptViewer uri={viewing} onClose={() => setViewing(null)} />
    </Sheet>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  amount: { fontSize: 28, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  error: { color: colors.softRed, fontWeight: '600' },
  mic: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.12)' },
  micActive: { backgroundColor: colors.neonGreen },
  listening: { fontSize: 12, color: colors.neonGreen, fontWeight: '600', marginTop: 6 },
  receiptRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  receiptActions: { gap: 8 },
  thumb: { width: 96, height: 96, borderRadius: radii.md, overflow: 'hidden', borderWidth: 1, borderColor: colors.glassBorder },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center', padding: 16 },
  viewerImage: { width: '100%', height: '85%' },
  viewerHint: { marginTop: 12 },
});
