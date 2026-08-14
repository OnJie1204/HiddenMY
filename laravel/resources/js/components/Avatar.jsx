import { getInitials, getAvatarColor } from '../utils/avatar';

function Avatar({ name, avatarUrl, size = 'md' }) {
  const sizeClass = `avatar-${size}`;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name || 'Avatar'}
        className={`avatar ${sizeClass}`}
      />
    );
  }

  const color = getAvatarColor(name);

  return (
    <span
      className={`avatar avatar-initials ${sizeClass}`}
      style={{ background: color.bg, color: color.fg }}
      aria-hidden="true"
    >
      {getInitials(name)}
    </span>
  );
}

export default Avatar;
