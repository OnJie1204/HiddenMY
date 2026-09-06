export function getPasswordStrength(password) {
  if (!password) return { label: '', level: 0 };

  let score = 0;
  if (password.length >= 8) score++;
  if (password.length >= 12) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/[^A-Za-z0-9]/.test(password)) score++;

  if (score <= 1) return { label: 'Weak', level: 1 };
  if (score <= 3) return { label: 'Medium', level: 2 };
  return { label: 'Strong', level: 3 };
}
