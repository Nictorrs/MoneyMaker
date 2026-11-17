import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { MONTHS_LONG, monthLabel } from '../lib/analytics';
import { haptic } from '../services/device';
import { colors, radii, type } from '../theme';
import { Chip, GlassButton } from './Glass';
import { Sheet } from './Sheet';

const ITEM_HEIGHT = 44;
const VISIBLE_ROWS = 5;

/** Rueda de selección estilo iOS: los elementos se desvanecen y giran al alejarse del centro. */
function Wheel({ items, selectedIndex, onChange, isDisabled }) {
  const scrollRef = useRef(null);
  const scrollY = useRef(new Animated.Value(selectedIndex * ITEM_HEIGHT)).current;
  const lastIndex = useRef(selectedIndex);

  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollTo({ y: selectedIndex * ITEM_HEIGHT, animated: false }), 0);
    return () => clearTimeout(timer);
    // Solo al montar: después la rueda es la que manda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const settle = event => {
    const index = Math.max(0, Math.min(items.length - 1, Math.round(event.nativeEvent.contentOffset.y / ITEM_HEIGHT)));
    if (index !== lastIndex.current) {
      lastIndex.current = index;
      haptic();
      onChange(index);
    }
  };

  return (
    <View style={styles.wheel}>
      <Animated.ScrollView
        ref={scrollRef}
        nestedScrollEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        contentContainerStyle={styles.wheelContent}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
        onMomentumScrollEnd={settle}
        onScrollEndDrag={event => {
          if (Math.abs(event.nativeEvent.velocity?.y || 0) < 0.05) {
            settle(event);
          }
        }}>
        {items.map((item, i) => {
          const inputRange = [(i - 2) * ITEM_HEIGHT, i * ITEM_HEIGHT, (i + 2) * ITEM_HEIGHT];
          return (
            <Animated.View
              key={item.key}
              style={[
                styles.item,
                {
                  opacity: scrollY.interpolate({ inputRange, outputRange: [0.25, 1, 0.25], extrapolate: 'clamp' }),
                  transform: [
                    { perspective: 400 },
                    { rotateX: scrollY.interpolate({ inputRange, outputRange: ['50deg', '0deg', '-50deg'], extrapolate: 'clamp' }) },
                    { scale: scrollY.interpolate({ inputRange, outputRange: [0.86, 1, 0.86], extrapolate: 'clamp' }) },
                  ],
                },
              ]}>
              <Text style={[styles.itemText, isDisabled?.(i) && styles.itemDisabled]}>{item.label}</Text>
            </Animated.View>
          );
        })}
      </Animated.ScrollView>
    </View>
  );
}

const clampMonth = (key, min, max) => (min && key < min ? min : max && key > max ? max : key);

/** Hoja flotante para elegir un mes, acotada a los meses con datos. */
export function MonthPickerSheet({ visible, title, value, minMonth, maxMonth, shortcuts = [], onClose, onSelect }) {
  const [year, setYear] = useState(Number(value.slice(0, 4)));
  const [month, setMonth] = useState(Number(value.slice(5, 7)));

  useEffect(() => {
    if (visible) {
      setYear(Number(value.slice(0, 4)));
      setMonth(Number(value.slice(5, 7)));
    }
  }, [value, visible]);

  const firstYear = Number((minMonth || value).slice(0, 4));
  const lastYear = Number((maxMonth || value).slice(0, 4));
  const years = [];
  for (let y = firstYear; y <= lastYear; y++) {
    years.push({ key: String(y), label: String(y) });
  }
  const months = MONTHS_LONG.map((name, i) => ({ key: name, label: name[0].toUpperCase() + name.slice(1), index: i }));
  const keyFor = (y, m) => `${y}-${String(m).padStart(2, '0')}`;
  const selectedKey = clampMonth(keyFor(year, month), minMonth, maxMonth);
  const monthDisabled = useCallback(i => {
    const key = keyFor(year, i + 1);
    return (minMonth && key < minMonth) || (maxMonth && key > maxMonth);
  }, [year, minMonth, maxMonth]);

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={`Seleccionado: ${monthLabel(selectedKey)}`}
      footer={
        <GlassButton
          variant="primary"
          icon="check"
          label="Listo"
          onPress={() => {
            onSelect(selectedKey);
            onClose();
          }}
        />
      }>
      {shortcuts.length > 0 && (
        <View style={styles.shortcuts}>
          {shortcuts.map(shortcut => (
            <Chip
              key={shortcut.key}
              label={shortcut.label}
              color={colors.cyan}
              active={shortcut.key === selectedKey}
              onPress={() => {
                onSelect(shortcut.key);
                onClose();
              }}
            />
          ))}
        </View>
      )}
      {visible && (
        <View style={styles.wheels}>
          <View pointerEvents="none" style={styles.band} />
          <Wheel
            key={`m-${value}`}
            items={months}
            selectedIndex={month - 1}
            onChange={i => setMonth(i + 1)}
            isDisabled={monthDisabled}
          />
          <Wheel
            key={`y-${value}`}
            items={years}
            selectedIndex={Math.max(0, years.findIndex(y => Number(y.key) === year))}
            onChange={i => setYear(Number(years[i].key))}
          />
        </View>
      )}
      <Text style={[type.caption, styles.hint]}>Solo puedes elegir meses con movimientos registrados.</Text>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  shortcuts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  wheels: { flexDirection: 'row', height: ITEM_HEIGHT * VISIBLE_ROWS, gap: 8 },
  band: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: ITEM_HEIGHT * 2,
    height: ITEM_HEIGHT,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: colors.glassBorderPressed,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  wheel: { flex: 1, height: ITEM_HEIGHT * VISIBLE_ROWS },
  wheelContent: { paddingVertical: ITEM_HEIGHT * 2 },
  item: { height: ITEM_HEIGHT, alignItems: 'center', justifyContent: 'center' },
  itemText: { fontSize: 20, fontWeight: '600', color: colors.text },
  itemDisabled: { color: colors.textFaint },
  hint: { textAlign: 'center', color: colors.textFaint },
});
