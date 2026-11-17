import React, { memo, useEffect, useRef, useState } from 'react';
import { Animated, AppState, Easing, StyleSheet, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, LinearGradient, RadialGradient, Rect, Stop } from 'react-native-svg';

import { useReducedEffects } from '../state/FinanceContext';
import { colors } from '../theme';

// Cada mancha de color es una capa rasterizada una vez en la GPU
// (renderToHardwareTextureAndroid / shouldRasterizeIOS); en cada cuadro solo se
// anima su transformación con el driver nativo, sin volver a dibujar el gradiente.
const BLOBS = [
  { id: 'purple', color: '#7C3AED', x: -0.35, y: -0.15, size: 1.5, drift: [40, 60], duration: 14000 },
  { id: 'electric', color: '#2563EB', x: 0.35, y: 0.18, size: 1.35, drift: [-50, 40], duration: 17000 },
  { id: 'emerald', color: '#10B981', x: -0.25, y: 0.62, size: 1.2, drift: [60, -40], duration: 19000 },
  { id: 'magenta', color: '#C026D3', x: 0.45, y: 0.82, size: 1.1, drift: [-40, -60], duration: 15000 },
];

const Blob = memo(function Blob({ blob, width, height, animate }) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) {
      return undefined;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1, duration: blob.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(progress, { toValue: 0, duration: blob.duration, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, blob.duration, progress]);

  const size = width * blob.size;
  const transform = [
    { translateX: progress.interpolate({ inputRange: [0, 1], outputRange: [0, blob.drift[0]] }) },
    { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [0, blob.drift[1]] }) },
    { scale: progress.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] }) },
  ];

  return (
    <Animated.View
      pointerEvents="none"
      renderToHardwareTextureAndroid
      shouldRasterizeIOS
      style={[styles.blob, { left: width * blob.x, top: height * blob.y - size / 2, width: size, height: size, transform }]}>
      <Svg width={size} height={size}>
        <Defs>
          <RadialGradient id={`blob-${blob.id}`} cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={blob.color} stopOpacity="0.85" />
            <Stop offset="0.55" stopColor={blob.color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={blob.color} stopOpacity="0" />
          </RadialGradient>
        </Defs>
        <Rect width={size} height={size} fill={`url(#blob-${blob.id})`} />
      </Svg>
    </Animated.View>
  );
});

/** Fondo mesh animado; se detiene en segundo plano y con efectos reducidos (ahorro de batería). */
export const MeshBackground = memo(function MeshBackground() {
  const { width, height } = useWindowDimensions();
  const reduced = useReducedEffects();
  const [active, setActive] = useState(AppState.currentState === 'active');

  useEffect(() => {
    const sub = AppState.addEventListener('change', state => setActive(state === 'active'));
    return () => sub.remove();
  }, []);

  const animate = active && !reduced;
  return (
    <View style={[StyleSheet.absoluteFill, styles.base]} pointerEvents="none">
      {BLOBS.map(blob => (
        <Blob key={blob.id} blob={blob} width={width} height={height} animate={animate} />
      ))}
      <Svg style={StyleSheet.absoluteFill} width={width} height={height}>
        <Defs>
          <LinearGradient id="mesh-veil" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.night} stopOpacity="0.05" />
            <Stop offset="1" stopColor={colors.night} stopOpacity="0.55" />
          </LinearGradient>
        </Defs>
        <Rect width={width} height={height} fill="url(#mesh-veil)" />
      </Svg>
    </View>
  );
});

const styles = StyleSheet.create({
  base: { backgroundColor: colors.night, overflow: 'hidden' },
  blob: { position: 'absolute' },
});
