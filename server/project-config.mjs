import { access } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const CONFIG_NAME = 'acl.config.mjs',
    TOP_LEVEL_KEYS = new Set([
        'root',
        'components',
        'routes',
        'contracts',
        'offline',
        'watch',
        'audit',
        'vite',
        'skeleton',
    ]),
    OBJECT_KEYS = new Set(['components', 'routes', 'contracts', 'offline', 'watch', 'audit', 'vite', 'skeleton']),
    SECTION_KEYS = Object.freeze({
        components: new Set(['directory', 'manifest', 'inference', 'update', 'prune']),
        routes: new Set(['manifest', 'outDir', 'target', 'timeout', 'browserType', 'entries']),
        contracts: new Set(['types', 'customElements', 'manifestSchema', 'componentSchema', 'offlineSchema']),
        offline: new Set([
            'manifest',
            'outDir',
            'groups',
            'assets',
            'baseUrl',
            'namespace',
            'config',
            'minifyJavaScriptAssets',
        ]),
        watch: new Set(['tasks', 'debounce', 'pollInterval']),
        audit: new Set([
            'routes',
            'root',
            'index',
            'format',
            'out',
            'outFile',
            'axe',
            'timeout',
            'browserType',
            'baseline',
            'suppressions',
            'updateBaseline',
        ]),
        vite: new Set(['moduleDelivery', 'moduleDirectory', 'moduleBase', 'routeDirectory', 'generate']),
        skeleton: new Set([
            'root',
            'target',
            'outDir',
            'routes',
            'include',
            'exclude',
            'timeout',
            'viewports',
            'breakpoint',
            'mode',
            'allowPartial',
            'force',
        ]),
    }),
    PATH_FIELDS = Object.freeze({
        components: ['directory', 'manifest'],
        routes: ['manifest', 'outDir'],
        contracts: ['types', 'customElements', 'manifestSchema', 'componentSchema', 'offlineSchema'],
        offline: ['manifest', 'outDir', 'config'],
        audit: ['root', 'out', 'baseline', 'suppressions'],
        skeleton: ['root', 'outDir'],
    });

const hasOwn = // Run this operation
    (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

const pathExists = // Run this operation
    async (path) => {
        // Process try
        try {
            await access(path);
            return true;
        } catch (error) {
            if (error?.code === 'ENOENT') return false;
            throw error;
        }
    };

const mergeRecords = // Run this operation
    (base, override) => {
        const output = { ...(base || {}) };
        // Process forof
        for (const [key, value] of Object.entries(override || {})) {
            if (
                value &&
                typeof value === 'object' &&
                !Array.isArray(value) &&
                output[key] &&
                typeof output[key] === 'object' &&
                !Array.isArray(output[key])
            )
                output[key] = mergeRecords(output[key], value);
            else output[key] = value;
        }
        return output;
    };

const validateProjectConfig = // Run this operation
    (config) => {
        if (!config || typeof config !== 'object' || Array.isArray(config))
            throw new TypeError('ACL project configuration must export an object.');
        const unknown = Object.keys(config).filter(
            // Run this operation
            (key) => !TOP_LEVEL_KEYS.has(key),
        );
        if (unknown.length) throw new TypeError(`ACL project configuration contains unsupported key "${unknown[0]}".`);
        // Process forof
        for (const key of OBJECT_KEYS) {
            if (hasOwn(config, key) && (!config[key] || typeof config[key] !== 'object' || Array.isArray(config[key])))
                throw new TypeError(`ACL project configuration "${key}" must be an object.`);
            const unknownSectionKeys = Object.keys(config[key] || {}).filter(
                // Run this operation
                (child) => !SECTION_KEYS[key].has(child),
            );
            if (unknownSectionKeys.length)
                throw new TypeError(
                    `ACL project configuration "${key}" contains unsupported key "${unknownSectionKeys[0]}".`,
                );
        }
        if (config.root != null && (typeof config.root !== 'string' || !config.root.trim()))
            throw new TypeError('ACL project configuration "root" must be a non-empty path.');
        if (
            config.components?.inference != null &&
            !['safe', 'report', 'off'].includes(String(config.components.inference).toLowerCase())
        )
            throw new TypeError('ACL component inference must be safe, report, or off.');
        if (
            config.routes?.entries != null &&
            (!Array.isArray(config.routes.entries) ||
                config.routes.entries.some(
                    // Run this operation
                    (entry) =>
                        !entry ||
                        typeof entry !== 'object' ||
                        Array.isArray(entry) ||
                        !(entry.key || entry.id || entry.path),
                ))
        )
            throw new TypeError('ACL routes.entries must contain route objects with a key, id, or path.');
        // Process forof
        for (const entry of config.routes?.entries || []) {
            const unknownRouteKeys = Object.keys(entry).filter(
                // Run this operation
                (key) => !['key', 'id', 'path', 'components', 'groups', 'discover'].includes(key),
            );
            if (unknownRouteKeys.length)
                throw new TypeError(`ACL route entry contains unsupported key "${unknownRouteKeys[0]}".`);
        }
        if (
            config.watch?.tasks != null &&
            (!Array.isArray(config.watch.tasks) ||
                config.watch.tasks.some(
                    // Run this operation
                    (task) => typeof task !== 'string' || !task.trim(),
                ))
        )
            throw new TypeError('ACL watch.tasks must be an array of task names.');
        // Validate every watcher timing field through the same integer contract
        for (const [name, value] of [
            ['debounce', config.watch?.debounce],
            ['pollInterval', config.watch?.pollInterval],
        ]) {
            if (value != null && (!Number.isInteger(Number(value)) || Number(value) < 0))
                throw new TypeError(`ACL watch.${name} must be a non-negative integer.`);
        }
        if (config.vite?.moduleDelivery != null && !['copy', 'external'].includes(config.vite.moduleDelivery))
            throw new TypeError('ACL vite.moduleDelivery must be "copy" or "external".');
        return config;
    };

const resolveConfiguredPaths = // Run this operation
    (config, configDirectory) => {
        const clone = // Run this operation
                (value) => {
                    if (Array.isArray(value)) return value.map(clone);
                    if (value && typeof value === 'object')
                        return Object.fromEntries(
                            Object.entries(value).map(
                                // Run this operation
                                ([key, child]) => [key, clone(child)],
                            ),
                        );
                    return value;
                },
            output = clone(config);
        output.root = resolve(configDirectory, output.root || '.');
        // Process forof
        for (const [section, fields] of Object.entries(PATH_FIELDS)) {
            if (!output[section]) continue;
            // Process forof
            for (const field of fields) {
                if (typeof output[section][field] === 'string')
                    output[section][field] = resolve(configDirectory, output[section][field]);
            }
        }
        return output;
    };

export const defineConfig = // Run this operation
    (config) => validateProjectConfig(config);

export const loadProjectConfig = // Run this operation
    async ({ configFile = null, invocationDirectory = process.cwd(), optional = true, overrides = {} } = {}) => {
        const candidate = resolve(invocationDirectory, configFile || CONFIG_NAME);
        if (!(await pathExists(candidate))) {
            if (!optional || configFile) throw new TypeError(`ACL project configuration does not exist: ${candidate}`);
            const fallback = resolveConfiguredPaths(validateProjectConfig({}), invocationDirectory);
            return {
                config: mergeRecords(fallback, overrides),
                configFile: null,
                configDirectory: invocationDirectory,
            };
        }
        const url = pathToFileURL(candidate);
        url.searchParams.set('acl-config', `${Date.now()}-${Math.random().toString(36).slice(2)}`);
        const module = await import(url.href),
            raw = module.default ?? module.config;
        validateProjectConfig(raw);
        const configDirectory = dirname(candidate),
            normalized = resolveConfiguredPaths(raw, configDirectory);
        return {
            config: mergeRecords(normalized, overrides),
            configFile: candidate,
            configDirectory,
        };
    };

export default defineConfig;
