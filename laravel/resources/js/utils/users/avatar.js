// Preset colors pulled from the app's own palette (teal / coral / amber / blue / purple family)
const AVATAR_COLORS = [
  { bg: '#e6f6f3', fg: '#0f766e' }, // primary teal
  { bg: '#ffe4e8', fg: '#f43f5e' }, // accent rose
  { bg: '#fef3c7', fg: '#b45309' }, // warm amber
  { bg: '#e0f2fe', fg: '#0369a1' }, // sky blue
  { bg: '#ede9fe', fg: '#6d28d9' }, // violet
  { bg: '#dcfce7', fg: '#15803d' }, // green
];

export function getInitials(name) {
  return name?.trim()?.[0]?.toUpperCase() ?? '?';
}

export function getAvatarColor(name) {
  const key = name?.trim() || '?';
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % AVATAR_COLORS.length;
  return AVATAR_COLORS[index];
}
