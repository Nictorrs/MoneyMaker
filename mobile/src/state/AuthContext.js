import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { authErrorMessage } from '../lib/auth';
import { store } from '../services/storage';

/**
 * Acceso local: usuario y contraseña guardados solo en este teléfono. No hay
 * cuentas ni servidor; la verificación ocurre en el módulo nativo, que deriva la
 * contraseña con PBKDF2 y nunca guarda el texto.
 *
 * La app se bloquea al abrirse y al volver del segundo plano después del tiempo
 * elegido en Ajustes.
 */
const AuthContext = createContext(null);

const LOCK_DELAY_KEY = 'lockDelay';
export const LOCK_DELAYS = [
  { id: '0', label: 'Al instante', millis: 0 },
  { id: '60', label: '1 min', millis: 60_000 },
  { id: '300', label: '5 min', millis: 300_000 },
];
const DEFAULT_LOCK_DELAY = 60_000;

const EMPTY_STATE = { configured: false, username: null, failedAttempts: 0, lockedUntil: 0, updatedAt: 0 };

export function AuthProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [state, setState] = useState(EMPTY_STATE);
  const [locked, setLocked] = useState(true);
  const [lockDelay, setLockDelayState] = useState(DEFAULT_LOCK_DELAY);

  const latest = useRef({ configured: false, lockDelay: DEFAULT_LOCK_DELAY });
  latest.current = { configured: state.configured, lockDelay };

  const refresh = useCallback(async () => {
    const [auth, savedDelay] = await Promise.all([store.getAuthState(), store.getSetting(LOCK_DELAY_KEY)]);
    setState(auth);
    setLockDelayState(savedDelay == null ? DEFAULT_LOCK_DELAY : Number(savedDelay));
    setLocked(auth.configured);
    setReady(true);
    return auth;
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Bloqueo al volver: se mide cuánto estuvo la app fuera de pantalla.
  useEffect(() => {
    let leftAt = 0;
    const sub = AppState.addEventListener('change', next => {
      if (next === 'active') {
        const away = leftAt ? Date.now() - leftAt : 0;
        leftAt = 0;
        if (latest.current.configured && away >= latest.current.lockDelay) {
          setLocked(true);
        }
      } else if (next === 'background' || next === 'inactive') {
        leftAt = leftAt || Date.now();
      }
    });
    return () => sub.remove();
  }, []);

  const unlock = useCallback(async ({ username, password }) => {
    const result = await store.verifyPassword({ username, password });
    setState(current => ({
      ...current,
      failedAttempts: result.ok ? 0 : (result.failedAttempts ?? current.failedAttempts),
      lockedUntil: result.ok ? 0 : (result.lockedUntil ?? 0),
    }));
    if (result.ok) {
      setLocked(false);
    }
    return result;
  }, []);

  /** Crea el acceso (onboarding o Ajustes) o cambia la contraseña con la actual. */
  const saveCredentials = useCallback(async ({ username, password, currentPassword = null }) => {
    try {
      const auth = await store.setCredentials({ username, password, currentPassword });
      setState(auth);
      setLocked(false);
      return auth;
    } catch (error) {
      throw new Error(authErrorMessage(error));
    }
  }, []);

  /** Quita el bloqueo sin tocar los datos. */
  const removeCredentials = useCallback(async ({ password }) => {
    try {
      const auth = await store.clearCredentials({ password });
      setState(auth);
      setLocked(false);
      return auth;
    } catch (error) {
      throw new Error(authErrorMessage(error));
    }
  }, []);

  const setLockDelay = useCallback(async millis => {
    setLockDelayState(millis);
    await store.setSetting(LOCK_DELAY_KEY, String(millis));
  }, []);

  const lockNow = useCallback(() => setLocked(true), []);

  const value = useMemo(
    () => ({
      ready,
      configured: state.configured,
      username: state.username,
      failedAttempts: state.failedAttempts,
      lockedUntil: state.lockedUntil,
      locked: state.configured && locked,
      lockDelay,
      refresh,
      unlock,
      saveCredentials,
      removeCredentials,
      setLockDelay,
      lockNow,
    }),
    [lockDelay, locked, lockNow, ready, refresh, removeCredentials, saveCredentials, setLockDelay, state, unlock],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth debe usarse dentro de AuthProvider');
  }
  return value;
}
