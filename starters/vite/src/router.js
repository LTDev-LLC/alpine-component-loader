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
        host.setAttribute('account-id', 'acct-2048');
        host.setAttribute('plan', 'pro');
    }
    return host;
};

const waitForHost = (host) =>
    new Promise((resolve, reject) => {
        host.addEventListener('loaded', resolve, { once: true });
        host.addEventListener(
            'acl:error',
            (event) => reject(event.detail?.error || new Error('The route component failed to load.')),
            { once: true },
        );
    });

export const startRouter = async ({ outlet, status, title }) => {
    let generation = 0;

    const render = async (routeKey, { history = false } = {}) => {
        const route = routes[routeKey] || routes.home,
            activeKey = routes[routeKey] ? routeKey : 'home',
            currentGeneration = ++generation;
        status.dataset.state = 'loading';
        status.textContent = `Loading the ${activeKey} shard…`;
        const registration = await registerRoute(activeKey);
        if (currentGeneration !== generation) return;

        const host = createRouteHost(activeKey),
            ready = waitForHost(host);
        outlet.replaceChildren(host);
        title.textContent = route.title;
        if (history) globalThis.history.pushState({ routeKey: activeKey }, '', routeHref(route));
        document.querySelectorAll('[data-route]').forEach((link) => {
            link.setAttribute('href', routeHref(routes[link.dataset.route]));
            if (link.dataset.route === activeKey) link.setAttribute('aria-current', 'page');
            else link.removeAttribute('aria-current');
        });
        await ready;
        if (currentGeneration !== generation) return;
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

    document.addEventListener('click', onNavigate);
    globalThis.addEventListener('popstate', onPopState);
    await render(currentRouteKey());

    return {
        stop() {
            document.removeEventListener('click', onNavigate);
            globalThis.removeEventListener('popstate', onPopState);
        },
    };
};
