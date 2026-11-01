/**
 * Validación y canonicalización de URLs externas (contenido no confiable).
 */

const TRACKING = /^(utm_[a-z]+|ref|ref_src|fbclid|gclid|mc_cid|mc_eid|igshid|si|source)$/i;
const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1\]?|\[?fc|\[?fd)/i;
const BAD_TLD = /\.(local|internal|lan|test|example|invalid|onion)$/i;
const SHORTENERS = /^(bit\.ly|t\.co|tinyurl\.com|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at)$/i;

/** Devuelve la URL normalizada o null si no es segura/válida. Solo https y hosts públicos. */
export function safeUrl(input: unknown, { allowHttp = false } = {}): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw || raw.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (u.protocol === 'http:' && allowHttp) u.protocol = 'https:';
  if (u.protocol !== 'https:') return null;
  if (u.username || u.password) return null;
  const host = u.hostname.toLowerCase();
  if (!host.includes('.') || PRIVATE_HOST.test(host) || BAD_TLD.test(host)) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return null; // IP literal
  if (SHORTENERS.test(host)) return null;
  if (u.port && u.port !== '443') return null;
  return u.toString();
}

/** Forma canónica para deduplicar: host sin www, sin parámetros de seguimiento, sin barra final ni fragmento. */
export function canonicalUrl(input: string): string | null {
  const s = safeUrl(input, { allowHttp: true });
  if (!s) return null;
  const u = new URL(s);
  u.hash = '';
  u.hostname = u.hostname.toLowerCase().replace(/^www\./, '');
  for (const k of [...u.searchParams.keys()]) if (TRACKING.test(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  let path = u.pathname.replace(/\/+$/, '').replace(/\/index\.html?$/i, '');
  if (u.hostname === 'github.com') path = path.toLowerCase().replace(/\.git$/, '');
  const q = u.searchParams.toString();
  return `https://${u.hostname}${path}${q ? `?${q}` : ''}`;
}

/** Extrae owner/repo de una URL de GitHub de repositorio (no gists, no páginas de usuario). */
export function githubRepoFromUrl(input: string): string | null {
  const s = safeUrl(input, { allowHttp: true });
  if (!s) return null;
  const u = new URL(s);
  if (!/^(www\.)?github\.com$/i.test(u.hostname)) return null;
  const parts = u.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const [owner, repo] = parts;
  const reserved = ['topics', 'orgs', 'sponsors', 'marketplace', 'features', 'collections', 'settings', 'apps', 'about', 'search', 'trending', 'login', 'site'];
  if (reserved.includes(owner.toLowerCase())) return null;
  if (!/^[A-Za-z0-9-]{1,39}$/.test(owner) || !/^[A-Za-z0-9._-]{1,100}$/.test(repo)) return null;
  return `${owner}/${repo.replace(/\.git$/, '')}`;
}

/** Extrae owner/space de una URL de Hugging Face Spaces. */
export function hfSpaceFromUrl(input: string): string | null {
  const s = safeUrl(input, { allowHttp: true });
  if (!s) return null;
  const u = new URL(s);
  if (u.hostname === 'huggingface.co') {
    const p = u.pathname.split('/').filter(Boolean);
    if (p[0] === 'spaces' && p.length >= 3) return `${p[1]}/${p[2]}`;
  }
  const m = u.hostname.match(/^([a-z0-9-]+)\.hf\.space$/i);
  return m ? null : null;
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}
