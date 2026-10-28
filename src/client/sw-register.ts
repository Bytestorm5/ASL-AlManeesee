/* Registers the service worker (offline reading). Production builds only —
   in `astro dev` there is no sw.js, and a worker left over from a previous
   build would serve stale bundles over the dev server. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  addEventListener('load', () => { navigator.serviceWorker.register('/sw.js').catch(() => undefined); });
}
export {};
