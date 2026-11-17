import { NativeModules, Platform } from 'react-native';

const Native = NativeModules.MoneyMaker;

export const backupSupported = Platform.OS === 'android' && Boolean(Native?.exportBackup);
export const MIN_PASSPHRASE_LENGTH = 8;

const MESSAGES = {
  E_BACKUP_WEAK: `La contraseña debe tener al menos ${MIN_PASSPHRASE_LENGTH} caracteres.`,
  E_BACKUP_PASSPHRASE: 'Contraseña incorrecta o archivo dañado.',
  E_BACKUP_FORMAT: 'Ese archivo no es un respaldo de MoneyMaker.',
  E_BACKUP_BUSY: 'Ya hay un respaldo en curso.',
  E_NO_ACTIVITY: 'Abre la app e intenta de nuevo.',
  E_BACKUP_IO: 'No se pudo leer o escribir el archivo.',
};

async function run(method, passphrase) {
  if (passphrase.length < MIN_PASSPHRASE_LENGTH) {
    throw new Error(MESSAGES.E_BACKUP_WEAK);
  }
  try {
    return await method(passphrase);
  } catch (error) {
    throw new Error(MESSAGES[error.code] || 'No se pudo completar el respaldo.');
  }
}

/**
 * Abre el selector del sistema para guardar el respaldo cifrado (Drive,
 * OneDrive, Dropbox...). Resuelve { transactions, goals } o null si se cancela.
 */
export const exportBackup = passphrase => run(Native.exportBackup, passphrase);

/** Reemplaza todos los datos locales por los del respaldo elegido. */
export const importBackup = passphrase => run(Native.importBackup, passphrase);
