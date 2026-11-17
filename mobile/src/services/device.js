import { NativeEventEmitter, NativeModules, PermissionsAndroid, Platform, Vibration } from 'react-native';

import { SPEECH_LOCALE } from '../config';
import { store } from './storage';

const Native = NativeModules.MoneyMaker;
const emitter = Native ? new NativeEventEmitter(Native) : null;

export const automationSupported = Platform.OS === 'android' && Boolean(Native);
export const voiceSupported = Platform.OS === 'android' && Boolean(Native?.startSpeechRecognition);

/** Pulso háptico breve para confirmar interacciones. */
export function haptic(kind = 'light') {
  try {
    Vibration.vibrate(kind === 'success' ? [0, 12, 60, 18] : 10);
  } catch {
    // La vibración es un adorno: nunca debe interrumpir la interacción.
  }
}

export function setSecureScreen(enabled) {
  Native?.setSecureScreen?.(enabled);
}

// --- Lectura en segundo plano ------------------------------------------------

export async function getAutomationStatus() {
  if (!automationSupported) {
    return { supported: false, smsPermission: false, notificationAccess: false, smsEnabled: false, notificationsEnabled: false };
  }
  return { supported: true, ...(await Native.getAutomationStatus()) };
}

export async function enableSmsReading() {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECEIVE_SMS, {
    title: 'Registrar alertas bancarias',
    message:
      'MoneyMaker leerá en tu teléfono los SMS de tu banco para crear movimientos pendientes. ' +
      'El texto nunca sale del dispositivo.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Ahora no',
  });
  const granted = result === PermissionsAndroid.RESULTS.GRANTED;
  await store.setSetting('automation.sms', granted ? 'true' : 'false');
  return granted;
}

export async function enableNotificationReading() {
  await store.setSetting('automation.notifications', 'true');
  await Native.openNotificationAccessSettings();
}

export async function disableAutomation(kind) {
  await store.setSetting(kind === 'sms' ? 'automation.sms' : 'automation.notifications', 'false');
}

export function onTransactionDetected(callback) {
  const subscription = emitter?.addListener('MoneyMaker:transactionDetected', callback);
  return () => subscription?.remove();
}

// --- Dictado -----------------------------------------------------------------

const SPEECH_ERRORS = {
  E_SPEECH_6: 'No escuché nada. Toca el micrófono e intenta de nuevo.',
  E_SPEECH_7: 'No te entendí bien. Intenta de nuevo.',
  E_SPEECH_9: 'Necesito permiso de micrófono para dictar.',
};

export async function listen({ onPartial } = {}) {
  const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Dictar gastos',
    message: 'MoneyMaker usa el micrófono solo mientras dictas un movimiento.',
    buttonPositive: 'Permitir',
    buttonNegative: 'Ahora no',
  });
  if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error(SPEECH_ERRORS.E_SPEECH_9);
  }
  const subscription = onPartial ? emitter.addListener('MoneyMaker:speechPartial', onPartial) : null;
  try {
    return await Native.startSpeechRecognition(SPEECH_LOCALE);
  } catch (error) {
    throw new Error(SPEECH_ERRORS[error.code] || 'El dictado no está disponible ahora.');
  } finally {
    subscription?.remove();
  }
}

export function stopListening() {
  Native?.stopSpeechRecognition?.();
}
