import React from 'react';
import Svg, { Circle, Path, Rect } from 'react-native-svg';

// Íconos de trazo en una grilla de 24px. Cadena = path; { c } = círculo; { r } = rectángulo.
const ICONS = {
  home: ['M3 11l9-7 9 7', 'M5 10v10h14V10', 'M10 20v-5h4v5'],
  list: ['M9 6h12', 'M9 12h12', 'M9 18h12', { c: [4.5, 6, 1] }, { c: [4.5, 12, 1] }, { c: [4.5, 18, 1] }],
  chart: ['M21 12a9 9 0 1 1-9-9v9z', 'M15 3.5A9 9 0 0 1 20.5 9H15z'],
  trophy: ['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3.5 4', 'M16 6h3a3 3 0 0 1-3.5 4', 'M12 13v4', 'M8 20h8'],
  sparkles: ['M11 3l1.9 5.1L18 10l-5.1 1.9L11 17l-1.9-5.1L4 10l5.1-1.9z', 'M19 3v4', 'M17 5h4', 'M18 16v3', 'M16.5 17.5h3'],
  mic: [{ r: [9, 3, 6, 11, 3] }, 'M5 11a7 7 0 0 0 14 0', 'M12 18v3'],
  keyboard: [{ r: [3, 6, 18, 12, 2] }, 'M7 10h.01', 'M11 10h.01', 'M15 10h.01', 'M7 14h10'],
  camera: ['M4 8h3l2-3h6l2 3h3v11H4z', { c: [12, 13, 3.5] }],
  scan: ['M4 8V5a1 1 0 0 1 1-1h3', 'M16 4h3a1 1 0 0 1 1 1v3', 'M20 16v3a1 1 0 0 1-1 1h-3', 'M8 20H5a1 1 0 0 1-1-1v-3', 'M4 12h16'],
  send: ['M4 12l16-8-6 16-3-7z', 'M11 13l9-9'],
  plus: ['M12 5v14', 'M5 12h14'],
  trash: ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13'],
  edit: ['M4 20h4L19 9l-4-4L4 16z', 'M13 7l4 4'],
  check: ['M5 12l5 5 9-10'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  chevron: ['M9 6l6 6-6 6'],
  sliders: ['M4 7h9', 'M17 7h3', { c: [15, 7, 2] }, 'M4 17h3', 'M11 17h9', { c: [9, 17, 2] }],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  lock: [{ r: [5, 11, 14, 10, 2] }, 'M8 11V8a4 4 0 0 1 8 0v3'],
  cloud: ['M7 18h10a4 4 0 0 0 .5-8A6 6 0 0 0 6 9.5 4.3 4.3 0 0 0 7 18z'],
  bell: ['M6 16v-5a6 6 0 0 1 12 0v5l2 2H4z', 'M10 21h4'],
  message: ['M4 5h16v11H9l-5 4z', 'M8 10h8'],
  flame: ['M12 3c1 4 5 6 5 11a5 5 0 0 1-10 0c0-3 2-4 2-7 1.5 1 2 2 3 4 .5-3 0-5 0-8z'],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M6 13l6 6 6-6'],
  alert: ['M12 4l9 16H3z', 'M12 10v4', 'M12 17h.01'],
  info: [{ c: [12, 12, 9] }, 'M12 11v5', 'M12 8h.01'],
  food: ['M7 3v18', 'M4 3v5a3 3 0 0 0 6 0V3', 'M17 21V3c-2 0-3.5 3-3.5 7s1.5 4 3.5 4'],
  cart: ['M3 4h2l2.5 11h11L21 7H6.2', { c: [9, 20, 1.3] }, { c: [18, 20, 1.3] }],
  car: ['M5 16v-5l2-5h10l2 5v5z', 'M3 11h18', { c: [8, 16, 1.6] }, { c: [16, 16, 1.6] }],
  bolt: ['M13 2L4 14h7l-1 8 9-12h-7z'],
  heart: ['M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z'],
  ticket: ['M4 6h16v4a2 2 0 0 0 0 4v4H4v-4a2 2 0 0 0 0-4z', 'M14 6v12'],
  repeat: ['M17 2l3 3-3 3', 'M4 11V9a4 4 0 0 1 4-4h12', 'M7 22l-3-3 3-3', 'M20 13v2a4 4 0 0 1-4 4H4'],
  bag: ['M5 8h14l-1 13H6z', 'M9 8V6a3 3 0 0 1 6 0v2'],
  book: ['M4 19V5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z'],
  plane: ['M10.5 13.5L3 11l18-7-7 18z'],
  swap: ['M7 4L3 8l4 4', 'M3 8h14', 'M17 20l4-4-4-4', 'M21 16H7'],
  briefcase: [{ r: [3, 7, 18, 13, 2] }, 'M9 7V5h6v2', 'M3 13h18'],
  spark: ['M12 3v6', 'M12 15v6', 'M3 12h6', 'M15 12h6', 'M6 6l2.5 2.5', 'M15.5 15.5L18 18', 'M18 6l-2.5 2.5', 'M8.5 15.5L6 18'],
  dots: [{ c: [5, 12, 1.2] }, { c: [12, 12, 1.2] }, { c: [19, 12, 1.2] }],
  eye: ['M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6z', { c: [12, 12, 3] }],
  eyeOff: ['M4 4l16 16', 'M6.6 6.8C3.8 8.6 2 12 2 12s3.6 6 10 6c1.6 0 3.1-.4 4.4-1', 'M9.9 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a18 18 0 0 1-3.3 3.8', 'M9.9 9.9A3 3 0 0 0 14 14.1'],
  clock: [{ c: [12, 12, 9] }, 'M12 7v5l3 2'],
};

export function Icon({ name, size = 22, color = '#fff', strokeWidth = 1.8 }) {
  const parts = ICONS[name] || ICONS.dots;
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' };
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {parts.map((part, i) => {
        if (typeof part === 'string') {
          return <Path key={i} d={part} {...stroke} />;
        }
        if (part.c) {
          return <Circle key={i} cx={part.c[0]} cy={part.c[1]} r={part.c[2]} {...stroke} />;
        }
        const [x, y, width, height, rx] = part.r;
        return <Rect key={i} x={x} y={y} width={width} height={height} rx={rx} {...stroke} />;
      })}
    </Svg>
  );
}
