// Create fresh documents so the lab's already activated capabilities cannot contaminate a comparison
const panels = document.querySelectorAll('[data-runtime-demos]');
// Bind each opt-in panel without importing any ACL implementation
for (const panel of panels) {
    const outlet = panel.querySelector('[data-demo-outlet]');
    panel.addEventListener('click', (event) => {
        // Open one isolated, same-origin developer demonstration
        const button = event.target.closest('[data-demo]');
        if (!button) return;
        const map = JSON.parse(document.querySelector('script[type="importmap"]').textContent).imports,
            entry =
                map[
                    new URLSearchParams(location.search).get('entry') === 'core'
                        ? 'alpine-component-loader/core'
                        : 'alpine-component-loader'
                ],
            url = location.pathname.startsWith('/examples/offline/')
                ? new URL('/examples/offline/demo.html', location.href)
                : new URL('./frame.html', import.meta.url),
            frame = document.createElement('iframe');
        url.searchParams.set('runtime', new URL(entry, location.href).href);
        url.searchParams.set('demo', button.dataset.demo);
        // Fragments retain selections without creating uncached offline navigation URLs
        url.hash = url.searchParams.toString();
        url.search = '';
        frame.src = url.href;
        frame.title = button.textContent.trim() + ' demonstration';
        frame.style.cssText = 'width:100%;min-height:480px;border:1px solid #cbd5e1;border-radius:12px;margin-top:1rem';
        outlet.replaceChildren(frame);
    });
    panel.querySelector('[data-demo-close]')?.addEventListener('click', () => {
        // Destroy the realm and release every document-owned demonstration resource
        outlet.replaceChildren();
    });
}
