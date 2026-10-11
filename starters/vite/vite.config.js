import { defineConfig } from 'vite';
import { alpineComponentLoader } from 'alpine-component-loader/vite';

export default defineConfig({
    base: process.env.ACL_BASE || '/',
    plugins: [
        alpineComponentLoader({
            configFile: './acl.config.mjs',
            ...(process.env.ACL_PRELOAD
                ? {
                      preload: {
                          entry: process.env.ACL_PRELOAD === 'core' ? 'core' : 'default',
                          tags: ['home-dashboard'],
                          features: ['boundary', 'styles', 'slots'],
                      },
                  }
                : {}),
            ...(process.env.ACL_MODULE_BASE
                ? { moduleDelivery: 'external', moduleBase: process.env.ACL_MODULE_BASE }
                : {}),
        }),
    ],
});
