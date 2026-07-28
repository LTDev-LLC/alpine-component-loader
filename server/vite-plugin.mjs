import { cp, mkdir, readFile, stat } from 'node:fs/promises';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { generateContractArtifacts } from './contract-generator.mjs';
import { loadProjectConfig } from './project-config.mjs';
import { generateComponentManifest } from './project-tools.mjs';
import { generateRouteManifests } from './route-generator.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    packageJson = JSON.parse(await readFile(resolve(packageRoot, 'package.json'), 'utf8')),
    packageVersion = packageJson.version,
    virtualClient = '\0virtual:alpine-component-loader/client',
    virtualRoutes = '\0virtual:alpine-component-loader/routes',
    publicEntries = Object.freeze({
        'alpine-component-loader': 'index.js',
        'alpine-component-loader/auto': 'auto.js',
        'alpine-component-loader/dev': 'dev.js',
        'alpine-component-loader/debugger': 'debugger.js',
        'alpine-component-loader/offline': 'offline.js',
        'alpine-component-loader/a11y': 'a11y.js',
        'alpine-component-loader/a11y-scanner': 'a11y-scanner.js',
        'alpine-component-loader/observability-exporters': 'observability-exporters.js',
        'alpine-component-loader/testing': 'testing.js',
        'alpine-component-loader/testing/playwright': 'testing-playwright.js',
        'alpine-component-loader/testing/vitest': 'testing-vitest.js',
    });

const exists = // Run this operation
    async (path) => {
        // Process try
        try {
            return await stat(path);
        } catch (error) {
            if (error?.code === 'ENOENT') return null;
            throw error;
        }
    };

const joinUrl = // Run this operation
    (...parts) => {
        const values = parts.filter(Boolean).map(String);
        if (!values.length) return '';
        const prefix = values.shift().replace(/\/+$/, ''),
            tail = values
                .map(
                    // Run this operation
                    (value) => value.replace(/^\/+|\/+$/g, ''),
                )
                .filter(Boolean)
                .join('/');
        if (!tail) return prefix || '/';
        return `${prefix}/${tail}`;
    };

const mergeImportMap = // Run this operation
    (html, imports) => {
        const expression = /<script\b[^>]*type\s*=\s*(?:"importmap"|'importmap'|importmap)[^>]*>([\s\S]*?)<\/script>/i,
            match = expression.exec(html);
        if (match) {
            // Process try
            try {
                const current = JSON.parse(match[1]);
                current.imports = {
                    // Configure this value
                    ...(current.imports || {}),
                    ...imports,
                };
                return html.replace(match[0], `<script type="importmap">${JSON.stringify(current, null, 4)}</script>`);
            } catch {
                throw new TypeError('The Vite entry HTML contains an invalid import map.');
            }
        }
        const script = `<script type="importmap">${JSON.stringify({ imports }, null, 4)}</script>`;
        return /<\/head>/i.test(html) ? html.replace(/<\/head>/i, `${script}\n</head>`) : `${script}\n${html}`;
    };

const contentType = // Run this operation
    (path) =>
        path.endsWith('.js')
            ? 'text/javascript; charset=utf-8'
            : path.endsWith('.json')
              ? 'application/json; charset=utf-8'
              : 'application/octet-stream';

const createStaticMiddleware =
    (prefix, root) =>
    // Serve package files without allowing paths to escape the package root
    async (request, response, next) => {
        const pathname = new URL(request.url || '/', 'http://localhost').pathname;
        if (!pathname.startsWith(prefix)) return next();
        const relativePath = decodeURIComponent(pathname.slice(prefix.length)).replace(/^\/+/, ''),
            candidate = resolve(root, relativePath);
        if (candidate !== root && !candidate.startsWith(`${root}${sep}`)) return next();
        const info = await exists(candidate);
        if (!info?.isFile()) return next();
        response.statusCode = 200;
        response.setHeader('Content-Type', contentType(candidate));
        response.end(await readFile(candidate));
    };

export const alpineComponentLoader = // Run this operation
    (pluginOptions = {}) => {
        let resolvedConfig = null,
            project = null,
            options = null,
            generation = null,
            generationDirty = false;

        const loadOptions = // Run this operation
            async (root) => {
                const loaded = await loadProjectConfig({
                    configFile: pluginOptions.configFile,
                    invocationDirectory: root,
                    optional: true,
                });
                project = loaded.config;
                options = {
                    moduleDelivery: 'copy',
                    moduleDirectory: `assets/alpine-component-loader/${packageVersion}`,
                    moduleBase: null,
                    routeDirectory: 'acl-routes',
                    generate: true,
                    ...project.vite,
                    ...pluginOptions,
                };
                if (!['copy', 'external'].includes(options.moduleDelivery))
                    throw new TypeError('ACL Vite moduleDelivery must be "copy" or "external".');
                if (options.moduleDelivery === 'external' && !options.moduleBase)
                    throw new TypeError('ACL Vite external module delivery requires moduleBase.');
            };

        const runGenerators = // Run this operation
            async ({ includeDiscovery = false } = {}) => {
                if (!options?.generate) return;
                if (generation) {
                    generationDirty = true;
                    return generation;
                }
                generation = // Run this operation
                    (async () => {
                        // Process dowhile
                        do {
                            generationDirty = false;
                            if (project.components?.directory && project.components?.manifest)
                                await generateComponentManifest({
                                    directory: project.components.directory,
                                    outFile: project.components.manifest,
                                    inference: project.components.inference || 'safe',
                                    update: true,
                                    prune: project.components.prune ?? false,
                                    force: true,
                                });
                            if (project.contracts?.types && project.components?.manifest)
                                await generateContractArtifacts({
                                    manifestFile: project.components.manifest,
                                    outFile: project.contracts.types,
                                    customElementsFile:
                                        project.contracts.customElements ||
                                        resolve(project.root, 'custom-elements.json'),
                                    force: true,
                                });
                            if (project.routes?.entries?.length && project.routes?.outDir) {
                                const entries = includeDiscovery
                                    ? project.routes.entries
                                    : project.routes.entries.map(
                                          // Run this operation
                                          (entry) => ({
                                              // Configure this value
                                              ...entry,
                                              discover: false,
                                          }),
                                      );
                                await generateRouteManifests({
                                    manifestFile: project.routes.manifest || project.components?.manifest,
                                    outDir: project.routes.outDir,
                                    entries,
                                    target: project.routes.target,
                                    root: project.root,
                                    timeout: project.routes.timeout,
                                    force: true,
                                });
                            }
                        } while (generationDirty);
                    })();
                // Process try
                try {
                    await generation;
                } finally {
                    generation = null;
                }
            };

        return {
            name: 'alpine-component-loader',
            enforce: 'pre',
            // Run this operation
            async config(userConfig) {
                const applicationRoot = resolve(userConfig.root || process.cwd()),
                    configuredAllow = Array.isArray(userConfig.server?.fs?.allow) ? userConfig.server.fs.allow : [];
                await loadOptions(applicationRoot);
                return {
                    optimizeDeps: {
                        exclude: ['alpine-component-loader'],
                    },
                    server: {
                        fs: {
                            allow: [...new Set([...configuredAllow, applicationRoot, packageRoot])],
                        },
                    },
                    build: {
                        rollupOptions: {
                            external: [/^alpine-component-loader(?:\/|$)/],
                        },
                    },
                };
            },
            // Run this operation
            configResolved(config) {
                resolvedConfig = config;
            },
            // Run this operation
            async buildStart() {
                await runGenerators();
            },
            // Run this operation
            resolveId(id) {
                if (id === 'virtual:alpine-component-loader/client') return virtualClient;
                if (id === 'virtual:alpine-component-loader/routes') return virtualRoutes;
                return null;
            },
            // Run this operation
            load(id) {
                if (id === virtualClient)
                    return `
import { reloadChangedTemplates } from 'alpine-component-loader/dev';
if (import.meta.hot) {
    import.meta.hot.on('acl:template-changed', async ({ sources }) => {
        await reloadChangedTemplates(sources || []);
    });
}
`;
                if (id === virtualRoutes) {
                    const base = resolvedConfig?.base || '/',
                        indexUrl =
                            resolvedConfig?.command === 'serve'
                                ? '/@acl-routes/acl-routes.json'
                                : joinUrl(base, options.routeDirectory, 'acl-routes.json');
                    return `
import AlpineComponentLoader from 'alpine-component-loader';
export const routeIndexUrl = ${JSON.stringify(indexUrl)};
export const registerRoute = (routeKey, options) =>
    AlpineComponentLoader.registerRouteManifest(routeKey, routeIndexUrl, options);
export default registerRoute;
`;
                }
                return null;
            },
            // Run this operation
            configureServer(server) {
                server.middlewares.use(createStaticMiddleware('/@acl/', resolve(packageRoot, 'dist')));
                if (project.routes?.outDir)
                    server.middlewares.use(createStaticMiddleware('/@acl-routes/', project.routes.outDir));
            },
            // Run this operation
            async handleHotUpdate(context) {
                const componentRoot = project.components?.directory;
                if (
                    componentRoot &&
                    (context.file === componentRoot || context.file.startsWith(`${componentRoot}${sep}`))
                )
                    await runGenerators();
                if (/\.html?$/i.test(context.file)) {
                    const source = `/${context.file.slice(resolvedConfig.root.length).replaceAll(sep, '/').replace(/^\/+/, '')}`;
                    context.server.ws.send({
                        type: 'custom',
                        event: 'acl:template-changed',
                        data: { sources: [source] },
                    });
                    return [];
                }
                return undefined;
            },
            // Run this operation
            transformIndexHtml(html, context) {
                const development = Boolean(context.server),
                    base = resolvedConfig?.base || '/',
                    imports = Object.fromEntries(
                        Object.entries(publicEntries).map(
                            // Run this operation
                            ([specifier, file]) => [
                                specifier,
                                development
                                    ? `/@acl/${file}`
                                    : options.moduleDelivery === 'external' && options.moduleBase
                                      ? joinUrl(options.moduleBase, file)
                                      : joinUrl(base, options.moduleDirectory, file),
                            ],
                        ),
                    );
                let output = mergeImportMap(html, imports);
                if (development) {
                    const client = '<script type="module" src="/@id/virtual:alpine-component-loader/client"></script>';
                    output = /<\/head>/i.test(output)
                        ? output.replace(/<\/head>/i, `${client}\n</head>`)
                        : `${client}\n${output}`;
                }
                return output;
            },
            // Run this operation
            async writeBundle() {
                if (options.moduleDelivery !== 'copy') return;
                const outputRoot = resolve(resolvedConfig.root, resolvedConfig.build.outDir);
                await mkdir(outputRoot, { recursive: true });
                await cp(resolve(packageRoot, 'dist'), resolve(outputRoot, options.moduleDirectory), {
                    recursive: true,
                    force: true,
                });
                if (project.routes?.outDir && (await exists(project.routes.outDir)))
                    await cp(project.routes.outDir, resolve(outputRoot, options.routeDirectory), {
                        recursive: true,
                        force: true,
                    });
            },
        };
    };

export default alpineComponentLoader;
