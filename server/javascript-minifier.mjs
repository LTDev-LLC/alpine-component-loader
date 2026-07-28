import { readFile } from 'node:fs/promises';
import { loadOptionalDependency } from './optional-dependency.mjs';

const defaultCacheMax = 256;

/** @type {Promise<(source: string, options: any) => Promise<{ code: string }>> | null} */
let javascriptMinifierPromise = null;

// Load the native minifier only when a generated .min.js response is requested
const loadJavaScriptMinifier = () => {
    if (javascriptMinifierPromise) return javascriptMinifierPromise;
    const loading = loadOptionalDependency('@swc/core', 'generated .min.js output')
        .then(
            // Select the callable minifier from the deferred compiler module
            ({ minify }) => {
                if (typeof minify !== 'function') throw new TypeError('@swc/core does not expose minify().');
                return minify;
            },
        )
        .catch(
            // Release a failed compiler import so a later request can retry
            (error) => {
                if (javascriptMinifierPromise === loading) javascriptMinifierPromise = null;
                throw error;
            },
        );
    javascriptMinifierPromise = loading;
    return loading;
};

// Minify one ES2022 or classic JavaScript source without writing generated files
/** @param {string} source */
export const minifyJavaScript = async (source) => {
    const minify = await loadJavaScriptMinifier(),
        result = await minify(source, {
            module: 'unknown',
            ecma: 2022,
            compress: true,
            mangle: true,
            sourceMap: false,
            format: {
                comments: {
                    regex: '@license|Copyright|Licensed under the MIT license',
                },
            },
        });
    return Buffer.from(result.code);
};

// Cache generated responses by readable source content and coalesce concurrent work
/** @param {{ maxEntries?: number }} [options] */
export const createMinifiedJavaScriptReader = ({ maxEntries = defaultCacheMax } = {}) => {
    if (!Number.isInteger(maxEntries) || maxEntries < 1)
        throw new TypeError('The minified JavaScript cache size must be a positive integer.');
    /** @type {Map<string, { source: string, promise: Promise<Buffer> }>} */
    const files = new Map();

    return {
        /** @param {string} path */
        async read(path) {
            // Load and transform the latest readable source
            const source = await readFile(path, 'utf8'),
                cached = files.get(path);
            if (cached?.source === source) {
                // Refresh the bounded insertion order after a cache hit
                files.delete(path);
                files.set(path, cached);
                return await cached.promise;
            }
            const operation = minifyJavaScript(source).catch(
                    // Evict failed transformations so corrected source can retry
                    (error) => {
                        if (files.get(path)?.promise === operation) files.delete(path);
                        throw error;
                    },
                ),
                entry = {
                    source,
                    promise: operation,
                };
            files.set(path, entry);
            // Evict the least recently used generated responses at the configured bound
            while (files.size > maxEntries) {
                const oldest = files.keys().next().value;
                if (oldest !== undefined) files.delete(oldest);
            }
            return await operation;
        },
        clear() {
            // Release every generated response owned by this reader
            files.clear();
        },
    };
};
