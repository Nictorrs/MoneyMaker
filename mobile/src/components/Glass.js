import { BlurView } from '@react-native-community/blur';
import React, { memo, useId, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { haptic } from '../services/device';
import { useReducedEffects } from '../state/FinanceContext';
import { absoluteFill, colors, radii, shadow as shadowStyle, type } from '../theme';
import { Icon } from './Icon';

/** Brillo diagonal sutil (blanco a casi transparente) sobre el cristal. */
const Sheen = memo(function Sheen({ radius }) {
  const id = `sheen${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  // Tamaño medido: un Svg con medidas en % no se redibuja en Android cuando la tarjeta crece.
  const [size, setSize] = useState(null);
  const onLayout = e => {
    const { width, height } = e.nativeEvent.layout;
    setSize(prev => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" onLayout={onLayout} renderToHardwareTextureAndroid shouldRasterizeIOS>
      {size && (
        <Svg width={size.width} height={size.height}>
          <Defs>
            <LinearGradient id={id} x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.20" />
              <Stop offset="0.45" stopColor="#FFFFFF" stopOpacity="0.06" />
              <Stop offset="1" stopColor="#B4B4DC" stopOpacity="0.02" />
            </LinearGradient>
          </Defs>
          <Rect width={size.width} height={size.height} rx={radius} fill={`url(#${id})`} />
        </Svg>
      )}
    </View>
  );
});

/**
 * Capas estáticas del cristal (desenfoque, relleno, brillo y borde), memorizadas:
 * cuando cambia el contenido de la tarjeta no se vuelven a procesar.
 */
const GlassBackdrop = memo(function GlassBackdrop({ radius, blur, reduced }) {
  return (
    <>
      {blur && !reduced && (
        <BlurView
          style={StyleSheet.absoluteFill}
          blurType="dark"
          blurAmount={22}
          blurRadius={18}
          downsampleFactor={6}
          reducedTransparencyFallbackColor="rgba(28,18,64,0.92)"
        />
      )}
      <View style={[StyleSheet.absoluteFill, blur && reduced ? styles.fillReduced : styles.fill]} />
      <Sheen radius={radius} />
      <View style={[styles.border, { borderRadius: radius }]} pointerEvents="none" />
    </>
  );
});

/**
 * Contenedor de cristal: desenfoque del fondo, relleno translúcido con
 * gradiente, borde blanco de 1px y sombra suave. Si recibe onPress, al
 * presionarlo sube la opacidad, brilla el borde y se hunde levemente.
 */
const LAYOUT_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf', 'width', 'minWidth', 'maxWidth',
  'margin', 'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginHorizontal', 'marginVertical',
  'position', 'top', 'left', 'right', 'bottom',
]);

/**
 * Cuando la tarjeta es presionable, el Pressable es quien participa en el layout del
 * padre: los estilos de disposición van en él y los visuales en el cristal. Si el
 * `flex: 1` quedara dentro del Pressable, la tarjeta colapsaría a altura cero en filas.
 */
function splitLayoutStyle(style) {
  const outer = {};
  const inner = {};
  for (const [key, value] of Object.entries(StyleSheet.flatten(style) || {})) {
    (LAYOUT_KEYS.has(key) ? outer : inner)[key] = value;
  }
  return [outer, inner];
}

export function GlassCard({
  children,
  style,
  contentStyle,
  radius = radii.lg,
  blur = true,
  elevated = true,
  onPress,
  onLongPress,
  disabled,
  accessibilityLabel,
}) {
  const reduced = useReducedEffects();
  const pressed = useRef(new Animated.Value(0)).current;
  const animateTo = toValue =>
    Animated.spring(pressed, { toValue, useNativeDriver: true, speed: 50, bounciness: toValue ? 0 : 6 }).start();

  const pressable = Boolean(onPress || onLongPress);
  const [outerStyle, innerStyle] = pressable ? splitLayoutStyle(style) : [null, style];
  const scale = pressed.interpolate({ inputRange: [0, 1], outputRange: [1, 0.975] });
  const body = (
    <Animated.View style={[elevated && shadowStyle, { borderRadius: radius }, innerStyle, { transform: [{ scale }] }]}>
      <View style={[styles.clip, { borderRadius: radius }]}>
        <GlassBackdrop radius={radius} blur={blur} reduced={reduced} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pressGlow, { borderRadius: radius, opacity: pressed }]} />
        <View style={contentStyle}>{children}</View>
      </View>
    </Animated.View>
  );

  if (!pressable) {
    return body;
  }
  return (
    <Pressable
      style={outerStyle}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPressIn={() => {
        haptic();
        animateTo(1);
      }}
      onPressOut={() => animateTo(0)}
      onPress={onPress}
      onLongPress={onLongPress}>
      {body}
    </Pressable>
  );
}

export function GlassButton({ label, icon, onPress, variant = 'glass', loading, disabled, style, compact }) {
  const solid = variant === 'primary';
  return (
    <GlassCard
      onPress={loading || disabled ? undefined : onPress}
      accessibilityLabel={label}
      radius={radii.pill}
      elevated={solid}
      blur={!solid}
      style={[disabled && styles.disabled, style]}
      contentStyle={[styles.button, compact && styles.buttonCompact, solid && styles.primary]}>
      {loading ? (
        <ActivityIndicator color={colors.text} />
      ) : (
        <>
          {icon && <Icon name={icon} size={compact ? 16 : 18} />}
          {label ? <Text style={[type.heading, compact && styles.compactLabel]}>{label}</Text> : null}
        </>
      )}
    </GlassCard>
  );
}

export function Chip({ label, color = colors.text, active, onPress }) {
  return (
    <GlassCard
      onPress={onPress}
      radius={radii.pill}
      elevated={false}
      blur={false}
      style={active && styles.chipActive}
      contentStyle={styles.chip}>
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[type.caption, active && { color: colors.text }]}>{label}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  // flexShrink permite que una tarjeta dentro de un contenedor con altura máxima (hojas) se ajuste.
  clip: { overflow: 'hidden', flexShrink: 1 },
  fill: { backgroundColor: colors.glassFill },
  fillReduced: { backgroundColor: 'rgba(30,20,66,0.78)' },
  border: { ...absoluteFill, borderWidth: 1, borderColor: colors.glassBorder },
  pressGlow: { backgroundColor: colors.glassFillPressed, borderWidth: 1, borderColor: colors.glassBorderPressed },
  button: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 20 },
  buttonCompact: { paddingVertical: 8, paddingHorizontal: 14 },
  compactLabel: { fontSize: 14 },
  primary: { backgroundColor: 'rgba(124,58,237,0.75)' },
  disabled: { opacity: 0.45 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  chipActive: { backgroundColor: 'rgba(255,255,255,0.22)', borderRadius: radii.pill },
});
