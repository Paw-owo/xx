// Chat-only kawaii SVG symbols. Keep this module local so other apps using core/ui.js stay unchanged.
const NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  back: '<path d="M10.5 5.5 4 12l6.5 6.5"/><path d="M5 12h14"/><path class="fill" d="m7 4-3 3.5 4 .5Z"/>',
  'chevron-left': '<path d="m14.5 6-6 6 6 6"/>',
  'chevron-right': '<path d="m9.5 6 6 6-6 6"/>',
  chevron: '<path d="m7 9 5 5 5-5"/>',
  more: '<path class="fill" d="M5 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm7 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z"/><path d="M3 8.5c1-2 3.2-3.5 5.5-3.5h7c3 0 5.5 2.4 5.5 5.5v3c0 3-2.5 5.5-5.5 5.5h-7C5.5 19 3 16.6 3 13.5Z"/>',
  close: '<path d="m7 7 10 10M17 7 7 17"/><path class="fill" d="M7 4 4.5 7.5 8 8Z"/><path class="fill" d="m17 4 2.5 3.5-3.5.5Z"/>',
  x: '<path d="m7 7 10 10M17 7 7 17"/>',
  add: '<path d="M12 6v12M6 12h12"/><path class="fill" d="M8 5 5.5 8.5 9 9ZM16 5l2.5 3.5L15 9Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6"/><path d="m15 15 5 5"/><path class="fill" d="m7 4-2 3 3 .5ZM14 4l2 3-3 .5Z"/>',
  settings: '<path d="M5 7h14M5 12h14M5 17h14"/><circle class="paper" cx="9" cy="7" r="2"/><circle class="paper" cx="15" cy="12" r="2"/><circle class="paper" cx="10" cy="17" r="2"/>',
  memory: '<path class="paper" d="M5 5.5A2.5 2.5 0 0 1 7.5 3H19v16H7.5A2.5 2.5 0 0 1 5 16.5Z"/><path d="M5 6h14M9 9.5h6M9 13h6"/><path class="fill" d="m8 3-2-2-1 3Z"/>',
  smile: '<path class="paper" d="M5 8c0-3 2.5-5 7-5s7 2 7 5v6c0 4-3 7-7 7s-7-3-7-7Z"/><path class="fill" d="M8 3 6 1 5 5ZM16 3l2-2 1 4Z"/><circle class="dot" cx="9" cy="11" r="1"/><circle class="dot" cx="15" cy="11" r="1"/><path d="M10 15c1.2 1 2.8 1 4 0"/>',
  mic: '<rect class="paper" x="8" y="3" width="8" height="12" rx="4"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3M9 21h6"/><path class="fill" d="M9 4 7 1.5 7 6ZM15 4l2-2.5V6Z"/>',
  send: '<path class="paper" d="m3 11 17-7-5.5 16-3-6Z"/><path d="m11.5 14 4-5"/><path class="fill" d="M4 9 2 5l4 2ZM17 5l3-2-.5 4Z"/>',
  stop: '<rect class="paper" x="6" y="6" width="12" height="12" rx="3"/><path class="fill" d="M8 6 6 3.5 5 7ZM16 6l2-2.5 1 3.5Z"/>',
  image: '<path class="paper" d="M4 5h16v14H4Z"/><path d="m5 16 4-4 3 3 2-2 5 5"/><circle class="fill" cx="15.5" cy="9" r="1.5"/><path class="fill" d="M7 5 5 2.5 4 6ZM17 5l2-2.5L20 6Z"/>',
  phone: '<path class="paper" d="M7 4c1 5 5 9 10 10l2-2 2 2c0 4-3 7-6 6C9 18 4 13 3 7c-.5-3 2-5 5-4Z"/><path class="fill" d="m7 4 1-3 2 4ZM17 14l3-2 1 3Z"/>',
  copy: '<rect class="paper" x="8" y="7" width="11" height="13" rx="3"/><path d="M16 7V6a3 3 0 0 0-3-3H7a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3h1"/>',
  quote: '<path class="paper" d="M4 5h16v11H9l-4 4v-4H4Z"/><path d="M8 9h3v3H8ZM14 9h3v3h-3Z"/>',
  edit: '<path class="paper" d="m5 16-1 4 4-1L19 8l-3-3Z"/><path d="m14 7 3 3"/><path class="fill" d="m6 4 2-3 2 3Z"/>',
  trash: '<path class="paper" d="M6 7h12l-1 13H7Z"/><path d="M4 7h16M9 7V4h6v3M10 11v5M14 11v5"/><path class="fill" d="M8 4 6 1.5 5 5ZM16 4l2-2.5L19 5Z"/>',
  delete: '<path class="paper" d="M6 7h12l-1 13H7Z"/><path d="M4 7h16M9 7V4h6v3M10 11v5M14 11v5"/>',
  refresh: '<path d="M19 8a8 8 0 1 0 1 7M19 8V3m0 5h-5"/><path class="fill" d="m7 4-2-2-1 3Z"/>',
  volume: '<path class="paper" d="M4 10h4l5-4v12l-5-4H4Z"/><path d="M16 9c2 1.5 2 4.5 0 6M18.5 6.5c4 3 4 8 0 11"/>',
  warning: '<path class="paper" d="m12 3 9 17H3Z"/><path d="M12 9v5M12 17h.01"/>',
  eye: '<path class="paper" d="M3 12s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6Z"/><circle class="dot" cx="12" cy="12" r="2"/>',
  'eye-off': '<path d="m4 4 16 16M3 12s3.5-6 9-6c4 0 7 3 9 6M6 16c1.5 1.2 3.5 2 6 2 2 0 4-.8 6-2"/>',
  ban: '<circle class="paper" cx="12" cy="12" r="9"/><path d="m6 6 12 12"/>',
  lock: '<rect class="paper" x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/><path class="fill" d="M8 7 6 4l3 .5ZM16 7l2-3 1 3.5Z"/>',
  web: '<circle class="paper" cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18"/>',
  code: '<path class="paper" d="M4 5h16v14H4Z"/><path d="m10 9-3 3 3 3M14 9l3 3-3 3"/>',
  check: '<path d="m5 12 4 4L19 6"/><path class="fill" d="M7 6 5 3 4 7ZM17 6l2-3 1 4Z"/>',
  download: '<path class="paper" d="M5 15v5h14v-5"/><path d="M12 4v11m-4-4 4 4 4-4"/>',
  continue: '<path d="M5 12h13m-4-4 4 4-4 4"/><path class="fill" d="M7 6 5 3 4 7Z"/>',
  thought: '<path class="paper" d="M7 13a7 7 0 1 1 10 0c-1 .8-1.5 1.8-1.5 3h-7c0-1.2-.5-2.2-1.5-3Z"/><path d="M9 19h6M10 22h4"/><path class="fill" d="M8 5 6 2 5 6ZM16 5l2-3 1 4Z"/>',
  card: '<rect class="paper" x="4" y="6" width="16" height="12" rx="3"/><path d="M7 10h10M7 14h6"/>',
  tool: '<path class="paper" d="m5 16-1 4 4-1L19 8l-3-3Z"/><path d="m14 7 3 3"/>',
  'rps-rock': '<path class="paper" d="M7 11c0-2 1-3.5 3-3.5h4c2 0 3 1.5 3 3.5v3c0 3-2 5-5 5s-5-2-5-5Z"/><path d="M9 8V6m3 1.5V5.5M15 8V6.5"/>',
  'rps-paper': '<path class="paper" d="M6 12V7.5a1.5 1.5 0 0 1 3 0V12m0 0V5.5a1.5 1.5 0 0 1 3 0V12m0 0V6.5a1.5 1.5 0 0 1 3 0V12m0 0V8.5a1.5 1.5 0 0 1 3 0v5c0 3-2.3 5.5-6 5.5-3.2 0-6-2.2-6-5.5Z"/>',
  'rps-scissors': '<path d="m8 8 11 11M19 6 8 17"/><circle class="paper" cx="6" cy="6" r="2.5"/><circle class="paper" cx="6" cy="18" r="2.5"/>',
  rps: '<path class="paper" d="M6 9c0-2 1.5-3.5 3.5-3.5h5C16.5 5.5 18 7 18 9v5c0 3-2.5 5-6 5s-6-2-6-5Z"/><path d="M9 9V6m3 3V5m3 4V6"/>',
  message: '<path class="paper" d="M4 6h16v11H9l-4 4v-4H4Z"/><path class="fill" d="M7 6 5 3l-1 4ZM17 6l2-3 1 4Z"/><circle class="dot" cx="9" cy="11" r="1"/><circle class="dot" cx="15" cy="11" r="1"/>',
  sparkle: '<path class="fill" d="m12 3 1.5 5.5L19 10l-5.5 1.5L12 17l-1.5-5.5L5 10l5.5-1.5Z"/><path d="m5 3 .7 2.3L8 6l-2.3.7L5 9l-.7-2.3L2 6l2.3-.7Z"/>'
};

export function createChatIcon(name, size = 18) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'var(--chat-icon-line)');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.classList.add('chat-kawaii-icon');
  svg.innerHTML = ICONS[name] || ICONS.sparkle;
  return svg;
}
