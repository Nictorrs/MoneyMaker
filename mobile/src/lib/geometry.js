/**
 * Curva suave que pasa por todos los puntos (Catmull-Rom convertida a Bézier
 * cúbica). Los puntos de control se limitan al rango vertical de sus vecinos
 * para que la curva no invente picos por encima o debajo de los datos.
 */
export function smoothPath(points, tension = 0.5) {
  if (points.length === 0) {
    return '';
  }
  if (points.length === 1) {
    return `M${points[0].x},${points[0].y}`;
  }
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const clampY = y => Math.min(Math.max(y, Math.min(p1.y, p2.y)), Math.max(p1.y, p2.y));
    const c1x = p1.x + ((p2.x - p0.x) / 6) * tension * 2;
    const c1y = clampY(p1.y + ((p2.y - p0.y) / 6) * tension * 2);
    const c2x = p2.x - ((p3.x - p1.x) / 6) * tension * 2;
    const c2y = clampY(p2.y - ((p3.y - p1.y) / 6) * tension * 2);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

export function areaPath(points, baselineY, tension) {
  if (points.length < 2) {
    return '';
  }
  const last = points[points.length - 1];
  return `${smoothPath(points, tension)} L${last.x},${baselineY} L${points[0].x},${baselineY} Z`;
}

export function polar(cx, cy, r, angle) {
  const rad = ((angle - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

/** Arco para dibujar con stroke; ángulos en grados, 0 = arriba, sentido horario. */
export function arcPath(cx, cy, r, startAngle, endAngle) {
  const sweep = Math.min(endAngle - startAngle, 359.999);
  const start = polar(cx, cy, r, startAngle);
  const end = polar(cx, cy, r, startAngle + sweep);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M${start.x},${start.y} A${r},${r} 0 ${largeArc} 1 ${end.x},${end.y}`;
}

/** Reparte segmentos de dona dejando un pequeño espacio entre ellos. */
export function donutSegments(values, gapDegrees = 3) {
  const total = values.reduce((sum, v) => sum + v, 0);
  if (total <= 0) {
    return [];
  }
  const gap = values.length > 1 ? gapDegrees : 0;
  const available = 360 - gap * values.length;
  let angle = 0;
  return values.map(value => {
    const sweep = (value / total) * available;
    const segment = { start: angle + gap / 2, end: angle + gap / 2 + sweep, share: value / total };
    angle += sweep + gap;
    return segment;
  });
}
