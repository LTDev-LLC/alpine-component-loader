import { defineConfig } from 'alpine-component-loader/project';

export default defineConfig({
    components: {
        directory: './public/components',
        manifest: './public/acl-manifest.json',
        inference: 'safe',
        update: true,
    },
    routes: {
        manifest: './public/acl-manifest.json',
        outDir: './public/acl-routes',
        entries: [
            {
                key: 'home',
                path: '/',
                components: ['home-dashboard'],
            },
            {
                key: 'account',
                path: '/account',
                groups: ['account'],
            },
        ],
    },
    contracts: {
        types: './generated/acl-components.d.ts',
        customElements: './generated/custom-elements.json',
    },
    watch: {
        tasks: ['manifest', 'types', 'routes'],
        debounce: 100,
    },
    audit: {
        routes: ['/'],
        root: './dist',
        baseline: './.acl/a11y-baseline.json',
        suppressions: './.acl/a11y-suppressions.json',
    },
    vite: {
        moduleDelivery: 'copy',
        routeDirectory: 'acl-routes',
    },
});
