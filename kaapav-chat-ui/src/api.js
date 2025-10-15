// src/api.js — central fetch wrapper with Bearer auth + safe JSON

export const TOKEN_KEY = 'KAAPAV_ADMIN_TOKEN';

export function getAuthToken() {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function setAuthToken(t) {
  if (!t) return localStorage.removeItem(TOKEN_KEY);
  localStorage.setItem(TOKEN_KEY, t);
}

export async function api(path, opts = {}) {
  const token = getAuthToken();
  const headers = new Headers(opts.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (!headers.has('Content-Type') && !(opts.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(`/api${path}`, { ...opts, headers, cache: 'no-store' });

  // If unauthorized, bubble a consistent error for UI to handle
  if (res.status === 401) {
    const text = await res.text().catch(() => '');
    const err = new Error('UNAUTHORIZED');
    err.response = res;
    err.body = text;
    throw err;
  }

  // Safe JSON parse
  const ct = res.headers.get('content-type') || '';
  const text = await res.text();
  const json = ct.includes('application/json')
    ? (text ? JSON.parse(text) : null)
    : { raw: text };

  if (!res.ok) {
    const err = new Error(`HTTP_${res.status}`);
    err.response = res;
    err.body = json ?? text;
    throw err;
  }

  return json;
}
