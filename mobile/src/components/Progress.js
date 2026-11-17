import React, { useEffect, useId, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors } from '../theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

function useAnimatedProgress(value, useNativeDriver) {
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progress, {
      toValue: Math.max(0, Math.min(1, value || 0)),
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver,
    }).start();
  }, [progress, value, useNativeDriver]);
  return progress;
}

/** Anillo circular con gradiente; pasa a tonos cálidos cuando supera el 90%. */
export function ProgressRing({ progress, size = 150, stroke = 14, children }) {
  const id = `ring${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const animated = useAnimatedProgress(progress, false);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const danger = progress >= 0.9;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} style={styles.rotate}>
        <Defs>
          <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={danger ? colors.amber : colors.cyan} />
            <Stop offset="1" stopColor={danger ? colors.softRed : colors.neonGreen} />
          </LinearGradient>
        </Defs>
        <Circle cx={size / 2} cy={size / 2} r={radius} stroke="rgba(255,255,255,0.12)" strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={`url(#${id})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={animated.interpolate({ inputRange: [0, 1], outputRange: [circumference, 0] })}
        />
      </Svg>
      <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>
    </View>
  );
}

/** Barra horizontal animada para metas. */
export function ProgressBar({ progress, color = colors.neonGreen, height = 10 }) {
  const animated = useAnimatedProgress(progress, false);
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={[
          styles.bar,
          {
            borderRadius: height / 2,
            backgroundColor: color,
            shadowColor: color,
            width: animated.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  rotate: { transform: [{ rotate: '-90deg' }] },
  center: { alignItems: 'center', justifyContent: 'center' },
  track: { backgroundColor: 'rgba(255,255,255,0.12)', overflow: 'hidden' },
  bar: { height: '100%', shadowOpacity: 0.8, shadowRadius: 8, shadowOffset: { width: 0, height: 0 } },
});
