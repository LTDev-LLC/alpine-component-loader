import { resolve, sep } from 'node:path';
import { generateContractArtifacts, generateManifestSchema } from './contract-generator.mjs';
import { createRecursiveWatcher } from './dev-server.mjs';
import { generateOfflineBundle } from './offline-generator.mjs';
import { generateComponentManifest } from './project-tools.mjs';
import { generateRouteManifests } from './route-generator.mjs';

const VALID_TASKS = new Set(['manifest', 'types', 'schema', 'routes', 'offline', 'skeleton', 'audit']),
    BROWSER_TASKS = new Set(['routes', 'skeleton', 'audit']),
    TASK_ORDER = new Map(
        ['manifest', 'types', 'schema', 'routes', 'offline', 'skeleton', 'audit'].map(
            // Run this operation
            (task, index) => [task, index],
        ),
    );

export const configuredTasks = // Run this operation
    (config) => {
        const tasks = [];
        if (config.components?.directory && config.components?.manifest) tasks.push('manifest');
        if (config.contracts?.types && config.components?.manifest) tasks.push('types');
        if (config.contracts?.manifestSchema || config.contracts?.componentSchema || config.contracts?.offlineSchema)
            tasks.push('schema');
        if (config.routes?.entries?.length && config.routes?.manifest && config.routes?.outDir) tasks.push('routes');
        if (config.offline?.manifest && config.offline?.outDir) tasks.push('offline');
        return tasks;
    };

export const normalizeWatchTasks = // Run this operation
    (config, supplied, includeExpensive) => {
        const explicit = supplied?.length ? supplied : config.watch?.tasks,
            tasks = explicit?.length ? explicit : configuredTasks(config);
        // Process forof
        for (const task of tasks) {
            if (!VALID_TASKS.has(task)) throw new TypeError(`Unsupported ACL watch task "${task}".`);
        }
        return [...new Set(tasks)]
            .filter(
                // Run this operation
                (task) => {
                    if (task !== 'routes')
                        return includeExpensive || !BROWSER_TASKS.has(task) || explicit?.includes(task);
                    const crawls = config.routes?.entries?.some(
                        // Run this operation
                        (entry) => entry.discover,
                    );
                    return !crawls || includeExpensive || explicit?.includes(task);
                },
            )
            .sort(
                // Run this operation
                (left, right) => TASK_ORDER.get(left) - TASK_ORDER.get(right),
            );
    };

export const classifyWatchChange = // Run this operation
    (file, config, selected) => {
        const candidate = resolve(file),
            componentDirectory = config.components?.directory && resolve(config.components.directory),
            componentManifest =
                (config.components?.manifest || config.routes?.manifest || config.offline?.manifest) &&
                resolve(config.components?.manifest || config.routes?.manifest || config.offline?.manifest);
        if (
            componentDirectory &&
            (candidate === componentDirectory || candidate.startsWith(`${componentDirectory}${sep}`))
        )
            return selected.filter(
                // Run this operation
                (task) => ['manifest', 'types', 'routes', 'offline', 'skeleton', 'audit'].includes(task),
            );
        if (componentManifest && candidate === componentManifest)
            return selected.filter(
                // Run this operation
                (task) => ['types', 'routes', 'offline'].includes(task),
            );
        return selected;
    };

const runTask = // Run this operation
    async (task, config, onProgress) => {
        onProgress?.({
            // Configure this value
            task,
            status: 'start',
        });
        let result;
        if (task === 'manifest') {
            result = await generateComponentManifest({
                directory: config.components.directory,
                outFile: config.components.manifest,
                inference: config.components.inference || 'safe',
                update: config.components.update ?? true,
                prune: config.components.prune ?? false,
                force: true,
            });
        } else if (task === 'types') {
            result = await generateContractArtifacts({
                manifestFile: config.components.manifest,
                outFile: config.contracts.types,
                customElementsFile: config.contracts.customElements || resolve(config.root, 'custom-elements.json'),
                force: true,
            });
        } else if (task === 'schema') {
            result = [];
            // Process forof
            for (const [kind, field] of [
                ['manifest', 'manifestSchema'],
                ['component', 'componentSchema'],
                ['offline', 'offlineSchema'],
            ]) {
                if (config.contracts?.[field])
                    result.push(
                        await generateManifestSchema({
                            kind,
                            outFile: config.contracts[field],
                            force: true,
                        }),
                    );
            }
        } else if (task === 'routes') {
            result = await generateRouteManifests({
                manifestFile: config.routes.manifest || config.components?.manifest,
                outDir: config.routes.outDir,
                entries: config.routes.entries,
                target: config.routes.target,
                root: config.root,
                timeout: config.routes.timeout,
                browserType: config.routes.browserType,
                force: true,
            });
        } else if (task === 'offline') {
            result = await generateOfflineBundle({
                manifestFile: config.offline.manifest || config.components?.manifest,
                outDir: config.offline.outDir,
                groups: config.offline.groups,
                assets: config.offline.assets,
                baseUrl: config.offline.baseUrl,
                namespace: config.offline.namespace,
                configFile: config.offline.config,
                minifyJavaScriptAssets: config.offline.minifyJavaScriptAssets,
                force: true,
            });
        } else if (task === 'skeleton') {
            const { generateSkeletons } = await import('./skeleton-generator.mjs');
            result = await generateSkeletons(
                {
                    ...config.skeleton,
                    force: true,
                },
                {
                    // Run this operation
                    onProgress: (message) =>
                        onProgress?.({
                            // Configure this value
                            task,
                            status: 'progress',
                            message,
                        }),
                },
            );
        } else if (task === 'audit') {
            const { runAccessibilityAudit } = await import('./audit-runner.mjs');
            result = await runAccessibilityAudit(config.audit);
        }
        onProgress?.({
            // Configure this value
            task,
            status: 'complete',
            result,
        });
        return result;
    };

export const startProjectWatcher = // Run this operation
    async ({
        config,
        tasks = null,
        includeExpensive = false,
        debounce = null,
        pollInterval = null,
        onProgress = null,
    } = {}) => {
        if (!config?.root) throw new TypeError('ACL watch requires normalized project configuration.');
        const selected = normalizeWatchTasks(config, tasks, includeExpensive);
        if (!selected.length) throw new TypeError('ACL watch has no configured tasks.');
        let closed = false,
            running = null,
            dirty = false,
            dirtyTasks = new Set(),
            lastResults = {};

        const run = // Run this operation
            async (reason = 'initial', requestedTasks = selected) => {
                if (closed) return lastResults;
                if (running) {
                    dirty = true;
                    requestedTasks.forEach(
                        // Run this operation
                        (task) => dirtyTasks.add(task),
                    );
                    return running;
                }
                let activeTasks = [...requestedTasks];
                running = // Run this operation
                    (async () => {
                        // Process dowhile
                        do {
                            dirty = false;
                            const passTasks = activeTasks;
                            activeTasks = [];
                            const results = {};
                            // Process forof
                            for (const task of passTasks) {
                                // Process try
                                try {
                                    results[task] = await runTask(task, config, onProgress);
                                } catch (error) {
                                    results[task] = { error };
                                    onProgress?.({
                                        // Configure this value
                                        task,
                                        status: 'error',
                                        error,
                                        reason,
                                    });
                                }
                            }
                            lastResults = {
                                // Configure this value
                                ...lastResults,
                                ...results,
                            };
                            activeTasks = selected.filter(
                                // Run this operation
                                (task) => dirtyTasks.has(task),
                            );
                            dirtyTasks.clear();
                        } while (dirty && !closed);
                        return lastResults;
                    })();
                // Process try
                try {
                    return await running;
                } finally {
                    running = null;
                }
            };

        await run();
        const ignoredOutputs = [
                config.components?.manifest,
                config.contracts?.types,
                config.contracts?.customElements,
                config.contracts?.manifestSchema,
                config.contracts?.componentSchema,
                config.contracts?.offlineSchema,
                config.routes?.outDir,
                config.offline?.outDir,
                config.skeleton?.outDir,
                config.audit?.out,
                config.audit?.baseline,
            ]
                .filter(Boolean)
                .map(
                    // Run this operation
                    (path) => resolve(path),
                ),
            ignore = // Run this operation
                (file) => {
                    const candidate = resolve(file);
                    return ignoredOutputs.some(
                        // Run this operation
                        (path) => candidate === path || candidate.startsWith(`${path}${sep}`),
                    );
                };

        const watcher = await createRecursiveWatcher({
            root: config.root,
            debounce: debounce ?? config.watch?.debounce ?? 100,
            pollInterval: pollInterval ?? config.watch?.pollInterval ?? 5000,
            ignore,
            // Run this operation
            onChange: (file) => {
                void run('change', classifyWatchChange(file, config, selected));
            },
        });
        return {
            tasks: selected,
            get results() {
                return lastResults;
            },
            run,
            // Run this operation
            async close() {
                if (closed) return;
                closed = true;
                watcher.close();
                await running;
            },
        };
    };

export default startProjectWatcher;
