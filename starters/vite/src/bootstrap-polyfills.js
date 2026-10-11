// Keep the dedicated fallback entry compatible with existing generated projects
const url = new URL(location.href);
url.searchParams.set('polyfills', '1');
history.replaceState(null, '', url);
void import('./bootstrap.js');
