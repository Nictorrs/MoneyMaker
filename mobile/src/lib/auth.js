/**
 * Reglas del acceso con usuario y contraseña. La verificación real ocurre en el
 * módulo nativo (PBKDF2 sobre la contraseña); aquí solo vive lo que la interfaz
 * necesita: validaciones, fuerza de la contraseña y el texto de la espera tras
 * varios intentos fallidos.
 *
 * La política de espera es la misma que aplica Java en PasswordVault.lockMillis.
 */

export const MIN_USERNAME_LENGTH = 3;
export const MAX_USERNAME_LENGTH = 32;
export const MIN_PASSWORD_LENGTH = 8;
export const MAX_PASSWORD_LENGTH = 128;
export const ATTEMPTS_BEFORE_LOCK = 5;

const FIRST_LOCK_MS = 30_000;
const MAX_LOCK_MS = 15 * 60_000;

const COMMON_PASSWORDS = ['12345678', '123456789', 'contrasena', 'contraseña', 'password', 'qwertyui', 'moneymaker'];

export function lockMillisFor(failedAttempts) {
  if (failedAttempts < ATTEMPTS_BEFORE_LOCK) {
    return 0;
  }
  let wait = FIRST_LOCK_MS;
  for (let i = ATTEMPTS_BEFORE_LOCK; i < failedAttempts && wait < MAX_LOCK_MS; i++) {
    wait *= 2;
  }
  return Math.min(wait, MAX_LOCK_MS);
}

export function attemptsLeft(failedAttempts = 0) {
  return Math.max(0, ATTEMPTS_BEFORE_LOCK - failedAttempts);
}

export function formatWait(millis) {
  const seconds = Math.max(1, Math.ceil(millis / 1000));
  if (seconds < 60) {
    return `${seconds} s`;
  }
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} min`;
}

/** Texto del bloqueo temporal, o null si ya se puede volver a intentar. */
export function lockMessage(lockedUntil, now = Date.now()) {
  const remaining = (lockedUntil || 0) - now;
  return remaining > 0 ? `Demasiados intentos. Vuelve a intentarlo en ${formatWait(remaining)}.` : null;
}

export function validateUsername(value) {
  const username = (value || '').trim();
  if (username.length < MIN_USERNAME_LENGTH) {
    return `El usuario necesita al menos ${MIN_USERNAME_LENGTH} caracteres.`;
  }
  if (username.length > MAX_USERNAME_LENGTH) {
    return `El usuario no puede pasar de ${MAX_USERNAME_LENGTH} caracteres.`;
  }
  if (/\s/.test(username)) {
    return 'El usuario no puede llevar espacios.';
  }
  return null;
}

export function validatePassword(value, { username = '' } = {}) {
  const password = value || '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `La contraseña necesita al menos ${MIN_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.length > MAX_PASSWORD_LENGTH) {
    return `La contraseña no puede pasar de ${MAX_PASSWORD_LENGTH} caracteres.`;
  }
  if (password.trim().toLowerCase() === (username || '').trim().toLowerCase()) {
    return 'La contraseña no puede ser igual al usuario.';
  }
  if (COMMON_PASSWORDS.includes(password.toLowerCase())) {
    return 'Esa contraseña es de las más usadas del mundo. Elige otra.';
  }
  return null;
}

/** Pista visual, no un requisito: nunca bloquea el guardado. */
export function passwordStrength(value) {
  const password = value || '';
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { score: 0, label: 'Muy corta' };
  }
  let score = 1;
  if (password.length >= 12) {
    score += 1;
  }
  if (/[a-záéíóúñ]/i.test(password) && /\d/.test(password)) {
    score += 1;
  }
  if (/[^A-Za-z0-9áéíóúüñÁÉÍÓÚÜÑ]/.test(password) && password.length >= 10) {
    score += 1;
  }
  const label = score >= 4 ? 'Fuerte' : score >= 3 ? 'Buena' : score >= 2 ? 'Aceptable' : 'Débil';
  return { score: Math.min(score, 4), label };
}

/** Los errores del puente nativo llegan como "IllegalArgumentException: motivo". */
export function authErrorMessage(error) {
  const message = error?.message || 'No se pudo completar la operación.';
  return message.replace(/^[A-Za-z]+(Exception|Error):\s*/, '');
}
