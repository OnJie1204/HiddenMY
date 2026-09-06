export function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

export function setToken(token, remember) {
  if (remember) {
    localStorage.setItem('token', token);
  } else {
    sessionStorage.setItem('token', token);
  }
}

export function clearToken() {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
}