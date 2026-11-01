/** Íconos SVG (trazos propios, 24x24). Compartidos entre componentes Astro y scripts de cliente. */
export const ICONS: Record<string, string> = {
  chat: '<path d="M4 5h16v11H8l-4 4z"/>',
  check: '<path d="M9 11l3 3 8-8"/><path d="M20 12v6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h9"/>',
  code: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M14 5l-4 14"/>',
  palette: '<path d="M12 3a9 9 0 1 0 0 18c1 0 1.5-.8 1.5-1.5 0-1.2-1-1.5-1-2.5s.8-1.5 2-1.5H17a4 4 0 0 0 4-4c0-4.7-4-8.5-9-8.5z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="15" cy="7.5" r="1"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 17-5-5-9 8"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  video: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3z"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4"/>',
  music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/>',
  pen: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15 8a5 5 0 0 1 0 8M18 5a9 9 0 0 1 0 14"/>',
  trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h14v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5"/>',
  bolt: '<path d="M13 3 5 14h6l-1 7 8-11h-6z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  shield: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  heart: '<path d="M12 21s-7.5-4.6-9.5-9.3C1.2 8.3 3.4 5 6.8 5c2 0 3.4 1.1 4.2 2.4h2C13.8 6.1 15.2 5 17.2 5c3.4 0 5.6 3.3 4.3 6.7C19.5 16.4 12 21 12 21z"/>',
  compare: '<path d="M8 3v18M16 3v18M3 8h5M16 16h5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  github: '<path d="M9 19c-4 1.5-4-2-6-2.5M15 21v-3.5a3 3 0 0 0-.9-2.4c3-.3 6-1.5 6-6.6A5.2 5.2 0 0 0 18.7 5 4.8 4.8 0 0 0 18.6 1.5S17.4 1.2 15 2.8a13.4 13.4 0 0 0-6 0C6.6 1.2 5.4 1.5 5.4 1.5A4.8 4.8 0 0 0 5.3 5 5.2 5.2 0 0 0 4 8.5c0 5.1 3 6.3 6 6.6a3 3 0 0 0-.9 2.4V21"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
  alert: '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6l-8-3z"/><path d="M12 8v5M12 16h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  // Plataformas
  web: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
  windows: '<path d="M3 5.5 10.5 4.5v7H3zM12.5 4.2 21 3v8.5h-8.5zM3 12.5h7.5v7L3 18.5zM12.5 12.5H21V21l-8.5-1.2z"/>',
  macos: '<path d="M15.5 3c0 1.8-1.4 3.4-3.2 3.4-.1-1.8 1.4-3.3 3.2-3.4zM18.5 16.6c-.7 1.6-1.6 3.4-3 3.4-1.2 0-1.6-.8-3-.8s-1.9.8-3 .8C7.6 20 5 16.3 5 12.9c0-3 2-4.7 3.9-4.7 1.2 0 2.2.8 3 .8.7 0 1.9-.9 3.3-.9 1 0 2.6.4 3.5 1.9-2.5 1.4-2.1 5.4-.2 6.6z"/>',
  linux: '<path d="M12 3c-2 0-3 1.8-3 4 0 1.6.7 2.6 0 4.4C8.2 13.5 5.5 15.5 5.5 18.5c0 1 .5 2.5 2.5 2.5h8c2 0 2.5-1.5 2.5-2.5 0-3-2.7-5-3.5-7.1-.7-1.8 0-2.8 0-4.4 0-2.2-1-4-3-4z"/><path d="M10.5 7.5h.01M13.5 7.5h.01"/>',
  android: '<rect x="5" y="9" width="14" height="10" rx="2"/><path d="M8 9a4 4 0 0 1 8 0M7 5l1.5 2.5M17 5l-1.5 2.5M9.5 13h.01M14.5 13h.01"/>',
  ios: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  'browser-extension': '<path d="M10 4h4v3a2 2 0 1 0 0 4v3h-3a2 2 0 1 1-4 0H4v-4a2 2 0 1 0 0-4V4z"/>',
  cli: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="m7 9 3 3-3 3M12 15h5"/>',
};

export function svg(name: string, cls = ''): string {
  const p = ICONS[name] ?? ICONS.grid;
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
}

/** Colores determinísticos para monogramas (logo de respaldo). */
const MONO = [
  ['#1f2a55', '#7eeefc'], ['#3a1f4f', '#f79ae6'], ['#22324a', '#9fe2ff'], ['#2c2353', '#c9b9ff'], ['#401a3c', '#ff9be8'], ['#13324a', '#7eeefc'],
];
export function monogram(name: string): { bg: string; fg: string; letter: string } {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const [bg, fg] = MONO[h % MONO.length];
  const letter = (name.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase();
  return { bg, fg, letter };
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}
