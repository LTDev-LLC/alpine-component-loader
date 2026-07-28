import { defineConfig } from 'vite';
import { alpineComponentLoader } from 'alpine-component-loader/vite';

export default defineConfig({
    base: process.env.ACL_BASE || '/',
    plugins: [
        alpineComponentLoader({
            configFile: './acl.config.mjs',
        }),
    ],
});
