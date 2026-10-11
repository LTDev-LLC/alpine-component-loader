import { registerRoute } from 'virtual:alpine-component-loader/routes';

const routes = Object.freeze({
        home: {
            segment: '',
            tagName: 'home-dashboard',
            title: 'Home dashboard',
        },
        account: {
            segment: 'account',
            tagName: 'account-dashboard',
            title: 'Account dashboard',
        },
    }),
    basePath = new URL(import.meta.env.BASE_URL, globalThis.location.origin).pathname;

const routeHref = (route) => new URL(route.segment || '.', `${globalThis.location.origin}${basePath}`).pathname;

const currentRouteKey = () => {
    const relative = globalThis.location.pathname.startsWith(basePath)
        ? globalThis.location.pathname.slice(basePath.length)
        : globalThis.location.pathname.slice(1);
    return relative.replace(/^\/+|\/+$/g, '') === routes.account.segment ? 'account' : 'home';
};

const createRouteHost = (routeKey) => {
    const host = document.createElement(routes[routeKey].tagName);
    if (routeKey === 'home') {
        host.setAttribute('visitor', 'Vite developer');
        const tip = document.createElement('p');
        tip.slot = 'tip';
        tip.textContent = 'Edit this template while Vite is running to see a targeted, state-preserving reload.';
        host.append(tip);
    } else {
        host.setAttribute('accountId', 'acct-2048');
        host.setAttribute('plan', 'pro');
    }
    return host;
};

// Release readiness listeners when a route is superseded or its application stops
const waitForHost = (host, signal) =>
    new Promise((resolve, reject) => {
        const cleanup = () => {
                host.removeEventListener('loaded', ready);
                host.removeEventListener('acl:error', fail);
                signal.removeEventListener('abort', cancel);
            },
            ready = () => {
                cleanup();
                resolve();
            },
            fail = (event) => {
                cleanup();
                reject(event.detail?.error || new Error('Route component failed'));
            },
            cancel = () => {
                cleanup();
                reject(new DOMException('Route superseded', 'AbortError'));
            };
        if (signal.aborted) {
            cancel();
            return;
        }
        host.addEventListener('loaded', ready, { once: true });
        host.addEventListener('acl:error', fail, { once: true });
        signal.addEventListener('abort', cancel, { once: true });
    });

export const startRouter = async ({ outlet, status, title, Loader }) => {
    let renderController = null,
        prefetchController = null,
        stopped = false;
    let generation = 0;

    const render = async (routeKey, { history = false } = {}) => {
        const route = routes[routeKey] || routes.home,
            activeKey = routes[routeKey] ? routeKey : 'home',
            currentGeneration = ++generation;
        renderController?.abort();
        renderController = new AbortController();
        const signal = renderController.signal;
        prefetchController?.abort();
        outlet.replaceChildren();
        status.dataset.state = 'loading';
        status.textContent = `Loading the ${activeKey} shard…`;
        const registration = await registerRoute(activeKey);
        if (stopped || currentGeneration !== generation) return;

        const host = createRouteHost(activeKey),
            ready = waitForHost(host, signal);
        outlet.replaceChildren(host);
        title.textContent = route.title;
        if (history) globalThis.history.pushState({ routeKey: activeKey }, '', routeHref(route) + location.search);
        document.querySelectorAll('[data-route]').forEach((link) => {
            link.setAttribute('href', routeHref(routes[link.dataset.route]) + location.search);
            if (link.dataset.route === activeKey) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        // A newer navigation owns the UI after this readiness wait is canceled
        try {
            await ready;
        } catch (error) {
            if (signal.aborted) return;
            throw error;
        }
        if (stopped || currentGeneration !== generation) return;
        status.dataset.state = 'ready';
        status.textContent = `${route.title} ready · ${registration.registered.length} components`;
    };

    const onNavigate = (event) => {
            const link = event.target instanceof Element ? event.target.closest('[data-route]') : null;
            if (
                !link ||
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey
            )
                return;
            event.preventDefault();
            render(link.dataset.route, { history: true }).catch((error) => {
                status.dataset.state = 'error';
                status.textContent = error.message;
            });
        },
        onPopState = () => {
            render(currentRouteKey()).catch((error) => {
                status.dataset.state = 'error';
                status.textContent = error.message;
            });
        };

    // Warm intent-selected route templates, and cancel speculative ownership before a navigation
    const onIntent = async (event) => {
        const link = event.target.closest?.('[data-route]');
        if (!link || stopped) return;
        prefetchController?.abort();
        const current = (prefetchController = new AbortController());
        try {
            await registerRoute(link.dataset.route);
            if (stopped || current.signal.aborted) return;
            await Loader.prefetchGraph([routes[link.dataset.route].tagName], { signal: current.signal });
        } catch (error) {
            if (!current.signal.aborted) console.warn('Route prefetch failed', error);
        }
    };
    document.addEventListener('pointerover', onIntent);
    document.addEventListener('focusin', onIntent);
    document.addEventListener('click', onNavigate);
    globalThis.addEventListener('popstate', onPopState);
    await render(currentRouteKey());

    return {
        stop() {
            stopped = true;
            generation++;
            renderController?.abort();
            prefetchController?.abort();
            outlet.replaceChildren();
            document.removeEventListener('pointerover', onIntent);
            document.removeEventListener('focusin', onIntent);
            document.removeEventListener('click', onNavigate);
            globalThis.removeEventListener('popstate', onPopState);
        },
    };
};
