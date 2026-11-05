/**
 * Registers the service worker that makes the production build usable with no
 * connection. It only ever stores this app's own files, never user images.
 * Assets the page loaded before the worker took control are handed over so
 * they get cached on the first visit too.
 */
export function registerOfflineSupport(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`)
      .then(() => navigator.serviceWorker.ready)
      .then((registration) => {
        const urls = performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => new URL(url).origin === location.origin);
        registration.active?.postMessage({ type: 'cache-urls', urls: [location.href, ...urls] });
      })
      .catch(() => {
        // Offline support is an extra: the app works the same without it.
      });
  });
}
