declare module 'virtual:alpine-component-loader/routes' {
    export const routeIndexUrl: string;
    export function registerRoute(
        routeKey: string,
        options?: import('./index.d.ts').ACLManifestRequestOptions & { baseUrl?: string },
    ): ReturnType<typeof import('./index.d.ts').default.registerManifestFrom>;
    export default registerRoute;
}
