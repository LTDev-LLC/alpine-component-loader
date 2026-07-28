/// <reference path="./vite-routes.d.ts" />

export interface ACLVitePlugin {
    name: string;
    enforce?: 'pre' | 'post';
    [hook: string]: unknown;
}

export interface AlpineComponentLoaderViteOptions {
    configFile?: string;
    moduleDelivery?: 'copy' | 'external';
    moduleDirectory?: string;
    moduleBase?: string;
    routeDirectory?: string;
    generate?: boolean;
}

export function alpineComponentLoader(options?: AlpineComponentLoaderViteOptions): ACLVitePlugin;
export default alpineComponentLoader;
