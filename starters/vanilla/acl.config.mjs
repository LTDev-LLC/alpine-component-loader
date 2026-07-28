import { defineConfig } from 'alpine-component-loader/project';

export default defineConfig({
    components: {
        directory: './components',
        manifest: './acl-manifest.json',
        inference: 'safe',
        update: true,
    },
    routes: {
        manifest: './acl-manifest.json',
        outDir: './acl-routes',
        entries: [{ key: 'home', path: '/', components: ['hello-card'] }],
    },
    contracts: {
        types: './generated/acl-components.d.ts',
        customElements: './generated/custom-elements.json',
    },
    watch: {
        tasks: ['manifest', 'types', 'routes'],
        debounce: 100,
    },
});
