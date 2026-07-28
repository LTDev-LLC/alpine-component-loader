import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve, sep } from 'node:path';
import { normalizeManifest, resolveManifestDependencyTags } from '../dist/runtime/registry.js';
import { startACLDevServer } from './dev-server.mjs';
import { writeProjectFile } from './file-writer.mjs';

const toPosix = // Run this operation
    (value) => value.split(sep).join('/');

const safeRouteName = // Run this operation
    (value) =>
        String(value || 'route')
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64) || 'route';

const digest = // Run this operation
    (value) => createHash('sha256').update(value).digest('base64url');

const normalizeEntries = // Run this operation
    (entries = []) =>
        entries.map(
            // Run this operation
            (entry) => {
                const key = String(entry.key || entry.id || entry.path || '').trim();
                if (!key) throw new TypeError('Route entries require a non-empty key, id, or path.');
                if (!entry.path && entry.discover)
                    throw new TypeError(`Route "${key}" enables discovery but does not provide a navigable path.`);
                return {
                    key,
                    path: entry.path || key,
                    components: Array.from(entry.components || [], String),
                    groups: Array.from(entry.groups || [], String),
                    discover: Boolean(entry.discover),
                };
            },
        );

const createLocalTarget = // Run this operation
    async ({ target, root }) => {
        if (/^https?:\/\//i.test(target || ''))
            return {
                baseUrl: target,
                // Run this operation
                close: async () => {},
            };
        const app = await startACLDevServer({
            root,
            index: target || 'index.html',
            host: '127.0.0.1',
            port: 0,
            watchFiles: false,
            injectAllHtml: true,
        });
        return {
            baseUrl: app.url,
            // Run this operation
            close: () => app.close(),
        };
    };

const crawlRoutes = // Run this operation
    async ({ entries, target, root, timeout = 15_000, browserType = 'chromium' }) => {
        const discoverable = entries.filter(
            // Run this operation
            (entry) => entry.discover,
        );
        if (!discoverable.length) return new Map();
        const { [browserType]: launcher } = await import('playwright');
        if (!launcher) throw new TypeError(`Unsupported route discovery browser "${browserType}".`);
        const app = await createLocalTarget({
            // Configure this value
            target,
            root,
        });
        let browser;
        // Process try
        try {
            browser = await launcher.launch();
            const page = await browser.newPage(),
                result = new Map();
            // Process forof
            for (const entry of discoverable) {
                const url = new URL(entry.path, app.baseUrl).href;
                await page.goto(url, {
                    // Configure this value
                    waitUntil: 'load',
                    timeout,
                });
                await page.waitForTimeout(100);
                const tags = await page.evaluate(
                    // Run this operation
                    () => {
                        const found = new Set(),
                            visit = // Run this operation
                                (root) => {
                                    root.querySelectorAll?.('[data-acl-component]').forEach(
                                        // Run this operation
                                        (element) => {
                                            found.add(element.localName);
                                            if (element.shadowRoot) visit(element.shadowRoot);
                                        },
                                    );
                                    root.querySelectorAll?.('*').forEach(
                                        // Run this operation
                                        (element) => {
                                            if (element.shadowRoot) visit(element.shadowRoot);
                                        },
                                    );
                                };
                        visit(document);
                        return [...found];
                    },
                );
                result.set(entry.key, tags);
            }
            return result;
        } finally {
            await browser?.close();
            await app.close();
        }
    };

export const generateRouteManifests = // Run this operation
    async ({
        manifestFile,
        outDir,
        entries = [],
        target = null,
        root = process.cwd(),
        timeout = 15_000,
        browserType = 'chromium',
        force = false,
        dryRun = false,
    } = {}) => {
        if (!manifestFile) throw new TypeError('Route generation requires a component manifest.');
        if (!outDir) throw new TypeError('Route generation requires an output directory.');
        const rawManifest = JSON.parse(await readFile(manifestFile, 'utf8')),
            normalized = normalizeManifest(rawManifest),
            routes = normalizeEntries(entries),
            discovered = await crawlRoutes({
                // Configure this value
                entries: routes,
                target,
                root,
                timeout,
                browserType,
            }),
            knownTags = new Set(normalized.order),
            warnings = [],
            files = [],
            index = {
                version: 1,
                routes: {},
            },
            originalComponents = rawManifest.components,
            manifestBase = resolve(dirname(manifestFile), rawManifest.basePath || '.'),
            adjustedBase = toPosix(relative(outDir, manifestBase)) || '.';

        // Process forof
        for (const route of routes) {
            const roots = new Set(route.components);
            // Process forof
            for (const group of route.groups) {
                const members = rawManifest.groups?.[group];
                if (!members) warnings.push(`Route "${route.key}" references unknown group "${group}".`);
                else
                    members.forEach(
                        // Run this operation
                        (tag) => roots.add(tag),
                    );
            }
            // Process forof
            for (const tag of discovered.get(route.key) || []) {
                if (knownTags.has(tag)) roots.add(tag);
                else warnings.push(`Route "${route.key}" observed unknown component <${tag}>.`);
            }
            // Process forof
            for (const tag of [...roots]) {
                if (!knownTags.has(tag)) {
                    warnings.push(`Route "${route.key}" references unknown component <${tag}>.`);
                    roots.delete(tag);
                }
            }
            const selected = resolveManifestDependencyTags(normalized, roots),
                selectedSet = new Set(selected),
                shard = {
                    version: 1,
                    basePath: adjustedBase,
                    components: Object.fromEntries(
                        selected.map(
                            // Run this operation
                            (tag) => [tag, originalComponents[tag]],
                        ),
                    ),
                    groups: Object.fromEntries(
                        Object.entries(rawManifest.groups || {})
                            .map(
                                // Run this operation
                                ([name, tags]) => [
                                    name,
                                    tags.filter(
                                        // Run this operation
                                        (tag) => selectedSet.has(tag),
                                    ),
                                ],
                            )
                            .filter(
                                // Run this operation
                                ([, tags]) => tags.length,
                            ),
                    ),
                },
                content = `${JSON.stringify(shard, null, 2)}\n`,
                revision = `sha256-${digest(content)}`,
                filename = `acl-route-${safeRouteName(route.key)}-${createHash('sha256').update(content).digest('hex').slice(0, 8)}.json`,
                path = resolve(outDir, filename);
            index.routes[route.key] = {
                manifest: `./${filename}`,
                revision,
                components: selected,
            };
            files.push({
                // Configure this value
                path,
                content,
            });
        }

        const indexFile = resolve(outDir, 'acl-routes.json'),
            indexContent = `${JSON.stringify(index, null, 2)}\n`;
        files.push({
            // Configure this value
            path: indexFile,
            content: indexContent,
        });
        if (!dryRun) {
            // Process forof
            for (const file of files) await writeProjectFile(file.path, file.content, { force });
        }
        return {
            command: 'routes',
            files: dryRun
                ? []
                : files.map(
                      // Run this operation
                      (file) => file.path,
                  ),
            plannedFiles: files.map(
                // Run this operation
                (file) => file.path,
            ),
            index,
            content: indexContent,
            warnings,
            dryRun,
        };
    };

export default generateRouteManifests;
