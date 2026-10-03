import { useEffect, useState } from 'react';

export function currentPath() {
  const hash = window.location.hash.replace(/^#/, '');
  if (/^\/(app|admin|login|signup)(\/|$)/.test(hash)) return hash;
  return (window.location.pathname.replace(/\/$/, '') || '/') + window.location.search;
}

export function navigate(path: string, replace = false) {
  if (replace) window.history.replaceState({}, '', path);
  else window.history.pushState({}, '', path);
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function usePath() {
  const [path, setPath] = useState(currentPath);
  useEffect(() => {
    const update = () => setPath(currentPath());
    window.addEventListener('popstate', update);
    window.addEventListener('hashchange', update);
    return () => {
      window.removeEventListener('popstate', update);
      window.removeEventListener('hashchange', update);
    };
  }, []);
  return path;
}