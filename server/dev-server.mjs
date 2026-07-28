import { watch } from 'node:fs';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMinifiedJavaScriptReader } from './javascript-minifier.mjs';
import { requireOptionalDependency } from './optional-dependency.mjs';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    distributionRoot = resolve(packageRoot, 'dist'),
    hmrPrefix = '/__acl_hmr/',
    modulePrefix = `${hmrPrefix}modules/`,
    eventPath = `${hmrPrefix}events`,
    clientPath = `${hmrPrefix}client.js`,
    alpinePath = `${hmrPrefix}alpine.js`,
    inlineTemplatePrefix = `${hmrPrefix}templates/`,
    inlineRevisionLimit = 32,
    ignoredDirectories = new Set(['.git', 'node_modules']),
    require = createRequire(import.meta.url);
let parseDocument = null;

// Resolve the optional Alpine browser bundle from the peer or test alias
let alpineBrowserPath = null;
// Process each candidate
for (const candidate of ['alpinejs/dist/cdn.min.js', 'alpinejs-315/dist/cdn.min.js']) {
    // Guard the operation against runtime failures
    try {
        alpineBrowserPath = require.resolve(candidate);
        break;
    } catch {
        // Continue probing because Alpine remains an optional peer dependency
    }
}

// Map static file extensions to explicit response content types
const contentTypes = {
    '.avif': 'image/avif',
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.htm': 'text/html; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.wasm': 'application/wasm',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.xml': 'application/xml; charset=utf-8',
};

// Expose package entry points through development-only import map URLs
const packageImports = {
    'alpine-component-loader': `${modulePrefix}index.js`,
    'alpine-component-loader/auto': `${modulePrefix}auto.js`,
    'alpine-component-loader/dev': `${modulePrefix}dev.js`,
    'alpine-component-loader/debugger': `${modulePrefix}debugger.js`,
    'alpine-component-loader/a11y': `${modulePrefix}a11y.js`,
    'alpine-component-loader/a11y-scanner': `${modulePrefix}a11y-scanner.js`,
    'alpine-component-loader/offline': `${modulePrefix}offline.js`,
    'alpine-component-loader/observability-exporters': `${modulePrefix}observability-exporters.js`,
    'alpine-component-loader/testing': `${modulePrefix}testing.js`,
    'alpine-component-loader/testing/playwright': `${modulePrefix}testing-playwright.js`,
    'alpine-component-loader/testing/vitest': `${modulePrefix}testing-vitest.js`,
};

// Derive every package entry from an explicit readable or minified root mapping
const resolvePackageImports = (existingImports = {}) => {
    const rootSpecifier = 'alpine-component-loader',
        rootMapping = existingImports[rootSpecifier];
    if (typeof rootMapping !== 'string') return packageImports;
    const rootMatch = /^(.*\/)index(\.min)?\.js(?:[?#].*)?$/.exec(rootMapping);
    if (!rootMatch) return packageImports;
    const base = rootMatch[1],
        suffix = rootMatch[2] ? '.min.js' : '.js',
        resolved = Object.fromEntries(
            Object.entries(packageImports).map(
                // Move each public entry to the selected root base and suffix
                ([specifier, localUrl]) => [
                    specifier,
                    `${base}${localUrl.slice(modulePrefix.length).replace(/\.js$/, suffix)}`,
                ],
            ),
        );
    // Normalize the root to the same query-free identity used by relative imports
    resolved[rootSpecifier] = `${base}index${suffix}`;
    return resolved;
};

// Connect browser pages to the development event stream
const bootstrapSource = `import AlpineComponentLoader from 'alpine-component-loader';
import { connectACLDevServer } from 'alpine-component-loader/dev';

const connection = connectACLDevServer({ loader: AlpineComponentLoader });
globalThis.__aclDevConnection = connection;
addEventListener('beforeunload', () => connection.close(), { once: true });
`;

const standaloneBootstrapSource = `import AlpineComponentLoader from '${modulePrefix}index.js';
import { connectACLDevServer } from '${modulePrefix}dev.js';

const connection = connectACLDevServer({ loader: AlpineComponentLoader });
globalThis.__aclDevConnection = connection;
addEventListener('beforeunload', () => connection.close(), { once: true });
`;

// Enforce path containment and exclude hidden or dependency directories
const isContained = (root, candidate) => candidate === root || candidate.startsWith(`${root}${sep}`),
    isIgnoredPath = (path) =>
        relative(path.root, path.file)
            .split(sep)
            .some(
                // Check the current item
                (part) => ignoredDirectories.has(part) || part.startsWith('.'),
            );

// Convert a platform path into an encoded root-relative browser path
const encodePath = (value) => `/${value.split(sep).filter(Boolean).map(encodeURIComponent).join('/')}`;

// Parse uniquely identified inline templates while preserving the exact surrounding page source
export const inspectInlineTemplates = (source) => {
    const errors = [],
        templates = new Map(),
        contentRanges = [];
    let documentNode;
    // Guard parse5 because malformed editor output must trigger an ordinary page reload
    try {
        parseDocument ||= requireOptionalDependency(require, 'parse5', 'inline-template HMR').parse;
        documentNode = parseDocument(String(source), {
            sourceCodeLocationInfo: true,
            onParseError: (error) => errors.push(error),
        });
    } catch (error) {
        errors.push(error);
    }
    // Visit each parsed node while treating identified templates as opaque ranges
    const visit = (node) => {
        if (!node) return;
        if (node.tagName === 'template') {
            const attributes = new Map(
                    (node.attrs || []).map(
                        // Index one parsed template attribute
                        (attribute) => [attribute.name, attribute.value],
                    ),
                ),
                componentName = attributes.get('acl-component')?.trim(),
                templateId = attributes.get('id')?.trim(),
                kind = componentName ? 'component' : templateId ? 'id' : null,
                name = componentName || templateId,
                location = node.sourceCodeLocation;
            if (
                kind &&
                location?.startTag?.endOffset != null &&
                location?.endTag?.startOffset != null &&
                location.endTag.startOffset >= location.startTag.endOffset
            ) {
                const key = `${kind}:${name}`;
                if (templates.has(key)) errors.push(new Error(`Duplicate inline template identity: ${name}`));
                else {
                    const start = location.startTag.endOffset,
                        end = location.endTag.startOffset;
                    templates.set(key, {
                        html: String(source).slice(start, end),
                        kind,
                        name,
                    });
                    contentRanges.push({
                        end,
                        key,
                        start,
                    });
                }
            }
            return;
        }
        node.childNodes?.forEach(visit);
        visit(node.content);
    };
    visit(documentNode);
    if (errors.length)
        return {
            errors,
            outside: null,
            templates,
        };
    contentRanges.sort((left, right) => left.start - right.start);
    let cursor = 0,
        outside = '';
    contentRanges.forEach((range) => {
        outside += `${String(source).slice(cursor, range.start)}\0${range.key}\0`;
        cursor = range.end;
    });
    outside += String(source).slice(cursor);
    return {
        errors,
        outside,
        templates,
    };
};

// Classify page edits conservatively so only content-only template changes become HMR updates
export const diffInlineTemplates = (previousSource, nextSource) => {
    const previous = inspectInlineTemplates(previousSource),
        next = inspectInlineTemplates(nextSource);
    if (previous.errors.length || next.errors.length || previous.outside !== next.outside)
        return {
            mode: 'reload',
            templates: [],
        };
    const previousKeys = [...previous.templates.keys()],
        nextKeys = [...next.templates.keys()];
    if (
        previousKeys.length !== nextKeys.length ||
        previousKeys.some((key) => !next.templates.has(key)) ||
        nextKeys.some((key) => !previous.templates.has(key))
    )
        return {
            mode: 'reload',
            templates: [],
        };
    const templates = nextKeys.flatMap(
        // Return only template bodies whose exact authored source changed
        (key) => {
            const current = next.templates.get(key);
            return previous.templates.get(key).html === current.html ? [] : [current];
        },
    );
    return {
        mode: templates.length ? 'inline' : 'none',
        templates,
    };
};

// Insert markup immediately after a document doctype when one exists
const insertAfterDoctype = (html, addition) => {
    const match = html.match(/^\s*<!doctype\s+html[^>]*>/i);
    if (!match) return `${addition}\n${html}`;
    return `${html.slice(0, match.index + match[0].length)}\n${addition}${html.slice(match.index + match[0].length)}`;
};

// Insert an import map at the start of the head or after the doctype fallback
const insertImportMap = (html, importMapTag) => {
    const head = /<head\b[^>]*>/i.exec(html);
    if (head)
        return `${html.slice(0, head.index + head[0].length)}\n${importMapTag}${html.slice(head.index + head[0].length)}`;
    return insertAfterDoctype(html, importMapTag);
};

// Add package mappings to the first valid import map or create a development map
export const injectHMRBootstrap = (html) => {
    if (html.includes('data-acl-hmr-client')) return html;

    const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
    let importMapMatch = null;
    // Preserve user mappings while locating the first parseable import map
    for (const match of html.matchAll(scriptPattern)) {
        if (/\btype\s*=\s*(?:["']importmap["']|importmap)(?:\s|$)/i.test(match[1])) {
            // Guard the inject hmrbootstrap operation against runtime failures
            try {
                const parsed = JSON.parse(match[2]);
                if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue;
                const existingImports =
                        parsed.imports && typeof parsed.imports === 'object' && !Array.isArray(parsed.imports)
                            ? parsed.imports
                            : {},
                    resolvedPackageImports = resolvePackageImports(existingImports);
                parsed.imports = {
                    ...existingImports,
                    ...resolvedPackageImports,
                };
                const replacement = `<script${match[1]}>\n${JSON.stringify(parsed, null, 2)}\n</script>`;
                importMapMatch = {
                    index: match.index,
                    length: match[0].length,
                    replacement,
                };
                break;
            } catch {
                // Leave malformed user maps untouched for the fallback injection path
            }
        }
    }

    // Replace a valid map or inject a dedicated map before adding the client module
    const importMapTag = `<script type="importmap" data-acl-hmr-importmap>\n${JSON.stringify({ imports: packageImports }, null, 2)}\n</script>`;
    let transformed = importMapMatch
        ? `${html.slice(0, importMapMatch.index)}${importMapMatch.replacement}${html.slice(importMapMatch.index + importMapMatch.length)}`
        : insertImportMap(html, importMapTag);
    const clientTag = `<script type="module" src="${clientPath}" data-acl-hmr-client></script>`,
        bodyClose = /<\/body\s*>/i.exec(transformed);
    transformed = bodyClose
        ? `${transformed.slice(0, bodyClose.index)}${clientTag}\n${transformed.slice(bodyClose.index)}`
        : `${transformed}\n${clientTag}\n`;
    return transformed;
};

// Add only the external development client when a server already owns its module URLs and CSP
export const injectStandaloneHMRClient = (html) => {
    if (html.includes('data-acl-hmr-client')) return html;
    const clientTag = `<script type="module" src="${clientPath}?standalone=1" data-acl-hmr-client></script>`,
        bodyClose = /<\/body\s*>/i.exec(html);
    return bodyClose
        ? `${html.slice(0, bodyClose.index)}${clientTag}\n${html.slice(bodyClose.index)}`
        : `${html}\n${clientTag}\n`;
};

// Send a no-store response while suppressing bodies for HEAD requests
const send = (request, response, status, body = '', contentType = 'text/plain; charset=utf-8') => {
    // Send
    const value = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    response.writeHead(status, {
        'cache-control': 'no-store',
        'content-length': value.length,
        'content-type': contentType,
        'x-content-type-options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : value);
};

// Decode a request path while rejecting traversal hidden and platform-specific segments
const decodeRequestPath = (pathname) => {
    let decoded;
    // Guard the decode request path operation against runtime failures
    try {
        decoded = decodeURIComponent(pathname);
    } catch {
        return null;
    }
    if (decoded.includes('\0') || decoded.includes('\\')) return null;
    const segments = decoded.split('/').filter(Boolean);
    if (
        segments.some(
            // Check the current item
            (segment) => segment === '.' || segment === '..' || segment.startsWith('.'),
        )
    )
        return null;
    return segments;
};

// Resolve a request to a contained regular file or an explicit redirect status
const resolveStaticFile = async (root, pathname) => {
    const segments = decodeRequestPath(pathname);
    if (!segments) return { status: 403 };
    const candidate = resolve(root, ...segments);
    if (!isContained(root, candidate)) return { status: 403 };
    // Guard the resolve static file operation against runtime failures
    try {
        const resolved = await realpath(candidate);
        if (!isContained(root, resolved)) return { status: 403 };
        const info = await stat(resolved);
        if (info.isDirectory()) {
            if (!pathname.endsWith('/')) return { status: 301 };
            const indexCandidate = resolve(resolved, 'index.html');
            // Guard the resolve static file operation against runtime failures
            try {
                const indexPath = await realpath(indexCandidate);
                if (!isContained(root, indexPath) || !(await stat(indexPath)).isFile()) return { status: 404 };
                return {
                    path: indexPath,
                    status: 200,
                };
            } catch (error) {
                if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { status: 404 };
                throw error;
            }
        }
        if (!info.isFile()) return { status: 404 };
        return {
            path: resolved,
            status: 200,
        };
    } catch (error) {
        if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return { status: 404 };
        throw error;
    }
};

// Resolve a physical file first and synthesize only missing .min.js requests
const resolveServedFile = async (root, pathname) => {
    const exact = await resolveStaticFile(root, pathname);
    if (exact.status !== 404 || !pathname.endsWith('.min.js')) return exact;
    const readable = await resolveStaticFile(root, pathname.replace(/\.min\.js$/, '.js'));
    if (readable.status === 200)
        return {
            ...readable,
            minify: true,
        };
    return readable.status === 403 ? readable : exact;
};

// Watch a complete project tree with a native recursive backend and a per-directory fallback
export const createRecursiveWatcher = async ({ root, onChange, debounce = 75, pollInterval = 5000, ignore = null }) => {
    if (!Number.isInteger(Number(pollInterval)) || Number(pollInterval) < 0)
        throw new TypeError(`Watcher poll interval must be a non-negative integer: ${pollInterval}`);
    const watchers = new Map(),
        pendingDirectories = new Set(),
        fileSignatures = new Map(),
        debounceTimers = new Map();
    let closed = false,
        polling = false,
        pollTimer = null,
        nativeWatcher = null,
        fallbackPromise = null;

    // Keep watcher bookkeeping helpers inside the lifetime they coordinate
    const ignored = (file) =>
            isIgnoredPath({
                root,
                file,
            }) || Boolean(ignore?.(file)),
        fileSignature = (info) => `${info.size}:${info.mtimeMs}:${info.ctimeMs}`,
        // Remove a deleted directory and every watcher nested beneath it
        removeDirectory = (directory) => {
            // Process each entry
            for (const [watchedDirectory, watcher] of watchers) {
                if (watchedDirectory === directory || watchedDirectory.startsWith(`${directory}${sep}`)) {
                    watcher.close();
                    watchers.delete(watchedDirectory);
                }
            }
            // Process each file
            for (const file of fileSignatures.keys()) {
                if (isContained(directory, file)) fileSignatures.delete(file);
            }
        },
        // Coalesce repeated path changes before notifying the development client
        schedule = (file) => {
            if (closed || ignored(file)) return;
            // Process each entry
            for (const [pendingFile, timer] of debounceTimers) {
                if (pendingFile !== file && isContained(pendingFile, file)) {
                    clearTimeout(timer);
                    debounceTimers.delete(pendingFile);
                }
            }
            if (
                Array.from(debounceTimers.keys()).some(
                    // Check the current item
                    (pendingFile) => pendingFile !== file && isContained(file, pendingFile),
                )
            )
                return;
            clearTimeout(debounceTimers.get(file));
            const timer = setTimeout(
                () => {
                    // Run the scheduled delayed task
                    debounceTimers.delete(file);
                    onChange(file);
                },
                Math.max(0, debounce),
            );
            timer.unref?.();
            debounceTimers.set(file, timer);
        },
        // Snapshot one directory and optionally schedule only real file changes
        snapshotDirectory = async (directory, notify = false) => {
            const entries = await readdir(directory, { withFileTypes: true }),
                seenFiles = new Set();
            await Promise.all(
                entries.map(async (entry) => {
                    // Transform the current item
                    if (entry.isDirectory()) return;
                    const file = resolve(directory, entry.name);
                    if (ignored(file)) return;
                    // Guard the snapshot directory operation against runtime failures
                    try {
                        const info = await stat(file);
                        if (!info.isFile()) return;
                        const signature = fileSignature(info),
                            previous = fileSignatures.get(file);
                        seenFiles.add(file);
                        fileSignatures.set(file, signature);
                        if (notify && signature !== previous) schedule(file);
                    } catch (error) {
                        if (error?.code !== 'ENOENT') throw error;
                    }
                }),
            );
            if (notify) {
                // Process each file
                for (const file of fileSignatures.keys()) {
                    if (dirname(file) === directory && !seenFiles.has(file)) {
                        fileSignatures.delete(file);
                        schedule(file);
                    }
                }
            }
            return entries;
        },
        // Watch one directory and recursively register its existing children
        addDirectory = async (directory, required = false) => {
            if (closed || watchers.has(directory) || pendingDirectories.has(directory) || ignored(directory)) return;
            pendingDirectories.add(directory);
            let entries, watcher;
            // Guard the add directory operation against runtime failures
            try {
                entries = await snapshotDirectory(directory);
                // Discover new directories after rename events and release deleted subtrees
                watcher = watch(directory, (eventType, filename) => {
                    // Handle a watched file change
                    if (closed) return;
                    if (filename == null) {
                        void snapshotDirectory(directory, true)
                            .then(
                                // Handle the resolved operation
                                (currentEntries) =>
                                    Promise.all(
                                        currentEntries
                                            .filter(
                                                // Select matching items
                                                (entry) =>
                                                    entry.isDirectory() &&
                                                    !ignoredDirectories.has(entry.name) &&
                                                    !entry.name.startsWith('.'),
                                            )
                                            .map(
                                                // Transform the current item
                                                (entry) => addTree(resolve(directory, entry.name)),
                                            ),
                                    ),
                            )
                            .catch((error) => {
                                // Handle the rejected operation
                                if (error?.code === 'ENOENT') removeDirectory(directory);
                            });
                        return;
                    }
                    const changedName = String(filename),
                        changedPath = resolve(directory, changedName);
                    void stat(changedPath)
                        .then((info) => {
                            // Handle the resolved operation
                            if (info.isDirectory()) return eventType === 'rename' ? addTree(changedPath) : undefined;
                            if (!info.isFile()) return;
                            const signature = fileSignature(info),
                                previous = fileSignatures.get(changedPath);
                            fileSignatures.set(changedPath, signature);
                            // Native change events remain authoritative when timestamp resolution is coarse
                            if (eventType === 'change' || signature !== previous) schedule(changedPath);
                        })
                        .catch((error) => {
                            // Handle the rejected operation
                            if (error?.code !== 'ENOENT') return;
                            const removedDirectory = Array.from(watchers.keys()).some(
                                // Check the current item
                                (watchedDirectory) =>
                                    watchedDirectory === changedPath ||
                                    watchedDirectory.startsWith(`${changedPath}${sep}`),
                            );
                            if (removedDirectory) {
                                removeDirectory(changedPath);
                                schedule(changedPath);
                            } else if (fileSignatures.delete(changedPath)) {
                                schedule(changedPath);
                            }
                        });
                });
            } catch (error) {
                pendingDirectories.delete(directory);
                if (required) throw error;
                console.warn(`[ACL Serve] Could not watch ${directory}: ${error.message}`);
                return;
            }
            watcher.on('error', (error) => {
                // Handle the error event
                return console.warn(`[ACL Serve] Watcher failed for ${directory}: ${error.message}`);
            });
            watchers.set(directory, watcher);
            pendingDirectories.delete(directory);
            await Promise.all(
                entries
                    .filter(
                        // Select matching items
                        (entry) =>
                            entry.isDirectory() && !ignoredDirectories.has(entry.name) && !entry.name.startsWith('.'),
                    )
                    .map(
                        // Transform the current item
                        (entry) => addDirectory(resolve(directory, entry.name)),
                    ),
            );
        },
        // Route recursive additions through the same deduplicated directory helper
        addTree = async (directory) => addDirectory(directory);

    // Traverse the tree for native-backend initialization and periodic safety scans
    const snapshotTree = async (notify = false) => {
            const seenFiles = new Set(),
                visit = async (directory) => {
                    // Visit every supported descendant of one directory
                    const entries = await readdir(directory, { withFileTypes: true });
                    await Promise.all(
                        // Snapshot child paths concurrently within one directory
                        entries.map(async (entry) => {
                            const path = resolve(directory, entry.name);
                            if (ignored(path)) return;
                            if (entry.isDirectory()) {
                                if (ignoredDirectories.has(entry.name) || entry.name.startsWith('.')) return;
                                await visit(path);
                                return;
                            }
                            if (!entry.isFile()) return;
                            const info = await stat(path),
                                signature = fileSignature(info),
                                previous = fileSignatures.get(path);
                            seenFiles.add(path);
                            fileSignatures.set(path, signature);
                            if (notify && previous !== undefined && signature !== previous) schedule(path);
                            else if (notify && previous === undefined) schedule(path);
                        }),
                    );
                };
            await visit(root);
            if (notify) {
                // Detect paths that disappeared since the previous tree snapshot
                for (const file of fileSignatures.keys()) {
                    if (!seenFiles.has(file)) {
                        fileSignatures.delete(file);
                        schedule(file);
                    }
                }
            }
        },
        startFallback = async (error = null) => {
            if (closed) return;
            if (fallbackPromise) return await fallbackPromise;
            nativeWatcher?.close();
            nativeWatcher = null;
            if (error) console.warn(`[ACL Serve] Recursive watcher failed; using directory watchers: ${error.message}`);
            fallbackPromise = addDirectory(root, true).catch((fallbackError) => {
                console.warn(`[ACL Serve] Watcher failed for ${root}: ${fallbackError.message}`);
            });
            return await fallbackPromise;
        },
        handleNativeChange = (eventType, filename) => {
            if (closed) return;
            if (filename == null) {
                void snapshotTree(true).catch((error) => {
                    if (!closed) void startFallback(error);
                });
                return;
            }
            const changedPath = resolve(root, String(filename));
            void stat(changedPath)
                .then((info) => {
                    if (info.isDirectory()) {
                        if (eventType === 'rename') void snapshotTree(true);
                        return;
                    }
                    if (!info.isFile()) return;
                    const signature = fileSignature(info),
                        previous = fileSignatures.get(changedPath);
                    fileSignatures.set(changedPath, signature);
                    if (eventType === 'change' || signature !== previous) schedule(changedPath);
                })
                .catch((error) => {
                    if (error?.code !== 'ENOENT') return;
                    let removed = false;
                    // Release every indexed file beneath the removed path
                    for (const file of fileSignatures.keys()) {
                        if (file === changedPath || isContained(changedPath, file)) {
                            fileSignatures.delete(file);
                            removed = true;
                        }
                    }
                    if (removed) schedule(changedPath);
                });
        };

    await snapshotTree();
    // Recursive fs.watch remains platform-dependent; unsupported hosts use the fallback
    try {
        nativeWatcher = watch(root, { recursive: true }, handleNativeChange);
        nativeWatcher.on('error', (error) => {
            void startFallback(error);
        });
    } catch (error) {
        await startFallback(error);
    }
    if (Number(pollInterval) > 0) {
        pollTimer = setInterval(
            // Recover file changes when a platform drops a native watcher event
            () => {
                if (closed || polling) return;
                polling = true;
                void snapshotTree(true)
                    .catch(() => undefined)
                    .finally(() => {
                        polling = false;
                    });
            },
            Number(pollInterval),
        );
        pollTimer.unref?.();
    }
    return {
        get backend() {
            return nativeWatcher ? 'recursive' : 'directory';
        },
        pollInterval: Number(pollInterval),
        // Close every watcher and debounce timer exactly once
        close() {
            if (closed) return;
            closed = true;
            if (pollTimer) clearInterval(pollTimer);
            pollTimer = null;
            // Process each timer
            for (const timer of debounceTimers.values()) clearTimeout(timer);
            debounceTimers.clear();
            // Process each watcher
            for (const watcher of watchers.values()) watcher.close();
            nativeWatcher?.close();
            nativeWatcher = null;
            watchers.clear();
            pendingDirectories.clear();
            fileSignatures.clear();
        },
    };
};

// Normalize and validate a TCP port including the ephemeral zero value
const validatePort = (value) => {
    const port = Number(value);
    if (!Number.isInteger(port) || port < 0 || port > 65535) throw new TypeError(`Invalid port: ${value}`);
    return port;
};

// Resolve and validate the serve root and primary HTML entry against traversal
const validateProject = async ({ root, index }) => {
    let projectRoot;
    // Guard the validate project operation against runtime failures
    try {
        projectRoot = await realpath(resolve(root));
    } catch {
        throw new TypeError(`Serve root does not exist: ${root}`);
    }
    if (!(await stat(projectRoot)).isDirectory()) throw new TypeError(`Serve root is not a directory: ${root}`);
    if (typeof index !== 'string' || extname(index).toLowerCase() !== '.html')
        throw new TypeError(`Primary index must be an .html file: ${index}`);
    const requestedIndex = isAbsolute(index) ? resolve(index) : resolve(projectRoot, index);
    if (!isContained(projectRoot, requestedIndex))
        throw new TypeError(`Primary index must be inside the serve root: ${index}`);
    if (
        relative(projectRoot, requestedIndex)
            .split(sep)
            .some(
                // Check the current item
                (part) => part.startsWith('.'),
            )
    )
        throw new TypeError(`Primary index cannot be a hidden file: ${index}`);
    let indexPath;
    // Guard the validate project operation against runtime failures
    try {
        indexPath = await realpath(requestedIndex);
    } catch {
        throw new TypeError(`Primary index does not exist: ${index}`);
    }
    if (!isContained(projectRoot, indexPath) || !(await stat(indexPath)).isFile())
        throw new TypeError(`Primary index must be a file inside the serve root: ${index}`);
    return {
        indexPath,
        indexUrl: encodePath(relative(projectRoot, requestedIndex)),
        root: projectRoot,
    };
};

// Create embeddable HMR routes and watching for servers that own their HTML response pipeline
export const createACLDevHMR = async ({
    root = process.cwd(),
    pageSources = [],
    watchFiles = true,
    watchDebounce = 75,
    watchPollInterval = 5000,
    onFileChange = null,
} = {}) => {
    const projectRoot = await realpath(resolve(root));
    if (!(await stat(projectRoot)).isDirectory()) throw new TypeError(`HMR root is not a directory: ${root}`);
    const clients = new Set(),
        pageSnapshots = new Map(),
        inlineRevisions = new Map(),
        minifiedFiles = createMinifiedJavaScriptReader();
    let inlineRevision = 0,
        watcher = null,
        closed = false;

    // Register one private page source and its public browser identity
    const registerPageSource = async (file, source = '/') => {
        const path = resolve(projectRoot, file);
        if (!isContained(projectRoot, path)) throw new TypeError(`HMR page source must be inside ${projectRoot}.`);
        pageSnapshots.set(path, {
            source,
            value: await readFile(path, 'utf8'),
        });
        return path;
    };

    // Remove one completed or disconnected event stream
    const removeClient = (response) => clients.delete(response);

    // Send one event frame to every active stream
    const broadcast = (message) => {
        const frame = `data: ${JSON.stringify(message)}\n\n`;
        // Process each connected client independently
        for (const response of clients) {
            if (response.destroyed || response.writableEnded) {
                removeClient(response);
                continue;
            }
            // Guard individual streams so one disconnected client cannot block the rest
            try {
                response.write(frame);
            } catch {
                removeClient(response);
            }
        }
        return {
            clients: clients.size,
            message,
        };
    };

    // Classify and publish one changed server-owned file
    const broadcastChange = async (file) => {
        const resolvedFile = resolve(file),
            relativePath = relative(projectRoot, resolvedFile);
        if (
            !relativePath ||
            relativePath.startsWith('..') ||
            isIgnoredPath({
                root: projectRoot,
                file: resolvedFile,
            })
        )
            return null;
        const source = encodePath(relativePath),
            pageSnapshot = pageSnapshots.get(resolvedFile);
        let classification = 'reload';
        if (pageSnapshot) {
            let nextSource;
            // Read the latest page or recover through an ordinary navigation
            try {
                nextSource = await readFile(resolvedFile, 'utf8');
            } catch {
                pageSnapshots.delete(resolvedFile);
                await onFileChange?.(resolvedFile, {
                    classification,
                    source: pageSnapshot.source,
                });
                return broadcast({
                    source: pageSnapshot.source,
                    type: 'acl:page-reload',
                });
            }
            const change = diffInlineTemplates(pageSnapshot.value, nextSource);
            pageSnapshots.set(resolvedFile, {
                source: pageSnapshot.source,
                value: nextSource,
            });
            classification = change.mode;
            await onFileChange?.(resolvedFile, {
                classification,
                source: pageSnapshot.source,
            });
            if (change.mode === 'none') return null;
            if (change.mode === 'inline') {
                const revision = ++inlineRevision,
                    url = `${inlineTemplatePrefix}${revision}`,
                    payload = {
                        revision,
                        source: pageSnapshot.source,
                        templates: change.templates,
                    };
                inlineRevisions.set(revision, payload);
                // Retain only the newest bounded revision records
                while (inlineRevisions.size > inlineRevisionLimit)
                    inlineRevisions.delete(inlineRevisions.keys().next().value);
                return broadcast({
                    fallback: true,
                    revision,
                    source: pageSnapshot.source,
                    templates: change.templates.map(
                        // Announce identities without placing template bodies on the event stream
                        ({ kind, name }) => ({
                            kind,
                            name,
                        }),
                    ),
                    type: 'acl:inline-template-changed',
                    url,
                });
            }
            return broadcast({
                source: pageSnapshot.source,
                type: 'acl:page-reload',
            });
        }
        if (extname(resolvedFile).toLowerCase() === '.html') classification = 'template';
        await onFileChange?.(resolvedFile, {
            classification,
            source,
        });
        return broadcast(
            classification === 'template'
                ? {
                      fallback: true,
                      source,
                      type: 'acl:template-changed',
                  }
                : {
                      source,
                      type: 'acl:page-reload',
                  },
        );
    };

    await Promise.all(
        pageSources.map((entry) =>
            typeof entry === 'string' ? registerPageSource(entry) : registerPageSource(entry.path, entry.source || '/'),
        ),
    );

    // Serve one request belonging to the internal HMR namespace
    const handleRequest = async (request, response) => {
        const url = new URL(request.url || '/', 'http://localhost');
        if (!url.pathname.startsWith(hmrPrefix)) return false;
        if (url.pathname === eventPath) {
            if (request.method !== 'GET') {
                response.setHeader('allow', 'GET');
                send(request, response, 405, 'Method not allowed');
                return true;
            }
            response.writeHead(200, {
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
                'content-type': 'text/event-stream; charset=utf-8',
                'x-accel-buffering': 'no',
                'x-content-type-options': 'nosniff',
            });
            response.write(': connected\n\n');
            clients.add(response);
            const cleanup = () => {
                // Release the completed event stream
                return removeClient(response);
            };
            request.once('close', cleanup);
            response.once('close', cleanup);
            return true;
        }
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.setHeader('allow', 'GET, HEAD');
            send(request, response, 405, 'Method not allowed');
            return true;
        }
        if (url.pathname.startsWith(inlineTemplatePrefix)) {
            const revisionText = url.pathname.slice(inlineTemplatePrefix.length);
            if (!/^\d+$/.test(revisionText) || !inlineRevisions.has(Number(revisionText))) {
                send(request, response, 404, 'Inline template revision not found');
                return true;
            }
            send(
                request,
                response,
                200,
                JSON.stringify(inlineRevisions.get(Number(revisionText))),
                contentTypes['.json'],
            );
            return true;
        }
        if (url.pathname === clientPath) {
            send(
                request,
                response,
                200,
                url.searchParams.has('standalone') ? standaloneBootstrapSource : bootstrapSource,
                contentTypes['.js'],
            );
            return true;
        }
        if (url.pathname === alpinePath) {
            if (!alpineBrowserPath) {
                send(request, response, 404, 'Alpine.js is not installed');
                return true;
            }
            send(request, response, 200, await readFile(alpineBrowserPath), contentTypes['.js']);
            return true;
        }
        if (url.pathname.startsWith(modulePrefix)) {
            const modulePathname = url.pathname.slice(modulePrefix.length),
                result = await resolveServedFile(distributionRoot, `/${modulePathname}`);
            if (result.status !== 200) {
                send(request, response, result.status, result.status === 403 ? 'Forbidden' : 'Not found');
                return true;
            }
            const body = result.minify ? await minifiedFiles.read(result.path) : await readFile(result.path);
            send(
                request,
                response,
                200,
                body,
                contentTypes[extname(result.path).toLowerCase()] || 'application/octet-stream',
            );
            return true;
        }
        send(request, response, 404, 'Not found');
        return true;
    };

    if (watchFiles)
        watcher = await createRecursiveWatcher({
            root: projectRoot,
            onChange: (file) => {
                // Publish watched changes without blocking the native callback
                void broadcastChange(file).catch((error) => {
                    console.warn(`[ACL HMR] Could not classify ${file}: ${error.message}`);
                    broadcast({
                        source: encodePath(relative(projectRoot, file)),
                        type: 'acl:page-reload',
                    });
                });
            },
            debounce: watchDebounce,
            pollInterval: watchPollInterval,
        });

    const keepalive = setInterval(() => {
        // Keep active event streams visible to intermediaries
        // Process each connected response
        for (const response of clients) {
            if (response.destroyed || response.writableEnded) removeClient(response);
            else {
                // Guard the keepalive operation against runtime failures
                try {
                    response.write(': keepalive\n\n');
                } catch {
                    removeClient(response);
                }
            }
        }
    }, 15_000);
    keepalive.unref?.();

    return {
        broadcast,
        broadcastChange,
        handleRequest,
        injectHTML: injectStandaloneHMRClient,
        registerPageSource,
        get clients() {
            return clients.size;
        },
        close() {
            if (closed) return;
            closed = true;
            clearInterval(keepalive);
            watcher?.close();
            watcher = null;
            // End every active event stream
            for (const response of clients) response.end();
            clients.clear();
            inlineRevisions.clear();
            pageSnapshots.clear();
            minifiedFiles.clear();
        },
    };
};

// Create an HMR development server with static file containment and graceful teardown
export const startACLDevServer = async ({
    root = process.cwd(),
    index = 'index.html',
    host = '127.0.0.1',
    port = 4173,
    watchFiles = true,
    watchDebounce = 75,
    watchPollInterval = 5000,
    injectAllHtml = false,
} = {}) => {
    if (typeof host !== 'string' || !host.trim()) throw new TypeError('Host must be a non-empty string.');
    const listenPort = validatePort(port),
        project = await validateProject({
            root,
            index,
        }),
        clients = new Set(),
        pageSnapshots = new Map(),
        inlineRevisions = new Map(),
        minifiedFiles = createMinifiedJavaScriptReader();
    let watcher = null,
        closePromise = null,
        inlineRevision = 0;

    pageSnapshots.set(project.indexPath, {
        source: project.indexUrl,
        value: await readFile(project.indexPath, 'utf8'),
    });

    // Track event-stream clients and translate file changes into browser messages
    const removeClient = (response) => {
            clients.delete(response);
        },
        // Send one event frame to every live stream and discard broken clients
        broadcast = (message) => {
            const frame = `data: ${JSON.stringify(message)}\n\n`;
            // Process each response
            for (const response of clients) {
                if (response.destroyed || response.writableEnded) {
                    removeClient(response);
                    continue;
                }
                // Guard the broadcast operation against runtime failures
                try {
                    response.write(frame);
                } catch {
                    removeClient(response);
                }
            }
            return {
                clients: clients.size,
                message,
            };
        },
        // Choose inline replacement external-template replacement or full reload for a changed path
        broadcastChange = async (file) => {
            const relativePath = relative(project.root, file);
            if (
                !relativePath ||
                relativePath.startsWith('..') ||
                isIgnoredPath({
                    root: project.root,
                    file,
                })
            )
                return null;
            const resolvedFile = resolve(file),
                source = encodePath(relativePath),
                pageSnapshot = pageSnapshots.get(resolvedFile);
            if (pageSnapshot) {
                let nextSource;
                // A missing or unreadable page can only recover through normal navigation
                try {
                    nextSource = await readFile(resolvedFile, 'utf8');
                } catch {
                    pageSnapshots.delete(resolvedFile);
                    return broadcast({
                        type: 'acl:page-reload',
                        source: pageSnapshot.source,
                    });
                }
                const change = diffInlineTemplates(pageSnapshot.value, nextSource);
                pageSnapshots.set(resolvedFile, {
                    source: pageSnapshot.source,
                    value: nextSource,
                });
                if (change.mode === 'none') return null;
                if (change.mode === 'inline') {
                    const revision = ++inlineRevision,
                        url = `${inlineTemplatePrefix}${revision}`,
                        payload = {
                            revision,
                            source: pageSnapshot.source,
                            templates: change.templates,
                        };
                    inlineRevisions.set(revision, payload);
                    // Retain only the newest bounded revision records
                    while (inlineRevisions.size > inlineRevisionLimit)
                        inlineRevisions.delete(inlineRevisions.keys().next().value);
                    return broadcast({
                        fallback: true,
                        revision,
                        source: pageSnapshot.source,
                        templates: change.templates.map(({ kind, name }) => ({
                            kind,
                            name,
                        })),
                        type: 'acl:inline-template-changed',
                        url,
                    });
                }
                return broadcast({
                    type: 'acl:page-reload',
                    source: pageSnapshot.source,
                });
            }
            if (resolve(file) !== project.indexPath && extname(file).toLowerCase() === '.html')
                return broadcast({
                    type: 'acl:template-changed',
                    source,
                    fallback: true,
                });
            return broadcast({
                type: 'acl:page-reload',
                source,
            });
        };

    // Route event streams package modules Alpine and contained project files
    const server = createServer((request, response) => {
        // Handle the HTTP request
        const url = new URL(request.url || '/', 'http://localhost');
        // Establish a long-lived server-sent event connection for HMR messages
        if (url.pathname === eventPath) {
            if (request.method !== 'GET') {
                response.setHeader('allow', 'GET');
                send(request, response, 405, 'Method not allowed');
                return;
            }
            response.writeHead(200, {
                'cache-control': 'no-cache, no-transform',
                connection: 'keep-alive',
                'content-type': 'text/event-stream; charset=utf-8',
                'x-accel-buffering': 'no',
                'x-content-type-options': 'nosniff',
            });
            response.write(': connected\n\n');
            clients.add(response);
            // Remove the stream client when either side reports connection closure
            const cleanup = () => removeClient(response);
            request.once('close', cleanup);
            response.once('close', cleanup);
            return;
        }
        if (url.pathname.startsWith(inlineTemplatePrefix)) {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                response.setHeader('allow', 'GET, HEAD');
                send(request, response, 405, 'Method not allowed');
                return;
            }
            const revisionText = url.pathname.slice(inlineTemplatePrefix.length);
            if (!/^\d+$/.test(revisionText) || !inlineRevisions.has(Number(revisionText))) {
                send(request, response, 404, 'Inline template revision not found');
                return;
            }
            send(
                request,
                response,
                200,
                JSON.stringify(inlineRevisions.get(Number(revisionText))),
                contentTypes['.json'],
            );
            return;
        }
        // Restrict ordinary static requests to safe read-only methods
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            response.setHeader('allow', 'GET, HEAD');
            send(request, response, 405, 'Method not allowed');
            return;
        }
        // Serve the generated browser connection client from memory
        if (url.pathname === clientPath) {
            send(request, response, 200, bootstrapSource, contentTypes['.js']);
            return;
        }
        // Serve the optional Alpine peer bundle through a stable development URL
        if (url.pathname === alpinePath) {
            if (!alpineBrowserPath) {
                send(request, response, 404, 'Alpine.js is not installed');
                return;
            }
            void readFile(alpineBrowserPath)
                .then((body) => {
                    // Handle the resolved operation
                    send(request, response, 200, body, contentTypes['.js']);
                })
                .catch((error) => {
                    // Handle the rejected operation
                    console.error('[ACL Serve] Failed to serve Alpine.js:', error);
                    send(request, response, 500, 'Internal server error');
                });
            return;
        }

        // Read one resolved file and optionally inject the HMR bootstrap
        const serveResolvedFile = async ({ path, minify = false }, inject = false) => {
            // Guard the serve resolved file operation against runtime failures
            try {
                let body = minify ? await minifiedFiles.read(path) : await readFile(path);
                if (inject) {
                    const source = body.toString('utf8');
                    pageSnapshots.set(path, {
                        source:
                            path === project.indexPath ? project.indexUrl : encodePath(relative(project.root, path)),
                        value: source,
                    });
                    body = Buffer.from(injectHMRBootstrap(source));
                }
                send(
                    request,
                    response,
                    200,
                    body,
                    contentTypes[extname(path).toLowerCase()] || 'application/octet-stream',
                );
            } catch (error) {
                console.error(`[ACL Serve] Failed to serve ${path}:`, error);
                send(
                    request,
                    response,
                    500,
                    error?.code === 'ACL_OPTIONAL_DEPENDENCY_MISSING' ? error.message : 'Internal server error',
                );
            }
        };

        // Resolve package modules exclusively within the built distribution tree
        if (url.pathname.startsWith(modulePrefix)) {
            const modulePathname = url.pathname.slice(modulePrefix.length);
            void resolveServedFile(distributionRoot, `/${modulePathname}`)
                .then((result) => {
                    // Handle the resolved operation
                    if (result.status !== 200) {
                        send(request, response, result.status, result.status === 403 ? 'Forbidden' : 'Not found');
                        return;
                    }
                    void serveResolvedFile(result);
                })
                .catch((error) => {
                    // Handle the rejected operation
                    console.error('[ACL Serve] Failed to resolve a package module:', error);
                    send(request, response, 500, 'Internal server error');
                });
            return;
        }

        // Resolve project assets and inject HMR only into the configured primary page
        const isRootRequest = url.pathname === '/',
            pathname = isRootRequest ? project.indexUrl : url.pathname;
        void resolveServedFile(project.root, pathname)
            .then((result) => {
                // Handle the resolved operation
                if (result.status === 301) {
                    response.writeHead(301, {
                        'cache-control': 'no-store',
                        location: `${url.pathname}/${url.search}`,
                    });
                    response.end();
                    return;
                }
                if (result.status !== 200) {
                    send(request, response, result.status, result.status === 403 ? 'Forbidden' : 'Not found');
                    return;
                }
                const inject =
                    result.path === project.indexPath ||
                    (injectAllHtml && extname(result.path).toLowerCase() === '.html');
                void serveResolvedFile(result, inject);
            })
            .catch((error) => {
                // Handle the rejected operation
                console.error('[ACL Serve] Failed to resolve a static file:', error);
                send(request, response, 500, 'Internal server error');
            });
    });

    // Reject malformed HTTP clients without surfacing parser details
    server.on('clientError', (_error, socket) => {
        // Handle the client error event
        if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
    });

    if (watchFiles)
        watcher = await createRecursiveWatcher({
            root: project.root,
            onChange: (file) => {
                void broadcastChange(file).catch((error) => {
                    console.warn(`[ACL Serve] Could not classify ${file}: ${error.message}`);
                    broadcast({
                        source: encodePath(relative(project.root, file)),
                        type: 'acl:page-reload',
                    });
                });
            },
            debounce: watchDebounce,
            pollInterval: watchPollInterval,
        });

    // Keep event streams active through intermediaries and prune disconnected clients
    const keepalive = setInterval(() => {
        // Run the scheduled interval task
        for (const response of clients) {
            if (response.destroyed || response.writableEnded) removeClient(response);
            else {
                // Guard the keepalive operation against runtime failures
                try {
                    response.write(': keepalive\n\n');
                } catch {
                    removeClient(response);
                }
            }
        }
    }, 15_000);
    keepalive.unref?.();

    // Await either the first successful listen event or startup error
    try {
        await new Promise((resolvePromise, rejectPromise) => {
            // Settle the asynchronous operation
            const onError = (error) => {
                    server.off('listening', onListening);
                    rejectPromise(error);
                },
                // Release the error listener before resolving a successful startup
                onListening = () => {
                    server.off('error', onError);
                    resolvePromise();
                };
            server.once('error', onError);
            server.once('listening', onListening);
            server.listen(listenPort, host.trim());
        });
    } catch (error) {
        clearInterval(keepalive);
        watcher?.close();
        throw error;
    }

    // Normalize IPv4 and IPv6 listener addresses into one browser origin
    const address = server.address(),
        addressHost = address.address.includes(':') ? `[${address.address}]` : address.address,
        origin = `http://${addressHost}:${address.port}`;
    return {
        origin,
        url: `${origin}/`,
        root: project.root,
        indexPath: project.indexPath,
        indexUrl: project.indexUrl,
        broadcast,
        broadcastChange,
        // Report the number of currently connected event-stream clients
        get clients() {
            return clients.size;
        },
        // Close timers watchers streams and the HTTP listener through one shared promise
        close() {
            if (closePromise) return closePromise;
            closePromise = new Promise((resolvePromise) => {
                // Settle the asynchronous operation
                clearInterval(keepalive);
                watcher?.close();
                watcher = null;
                // Process each response
                for (const response of clients) response.end();
                clients.clear();
                inlineRevisions.clear();
                pageSnapshots.clear();
                minifiedFiles.clear();
                server.close(
                    // Finish server shutdown
                    () => resolvePromise(),
                );
                server.closeIdleConnections?.();
            });
            return closePromise;
        },
    };
};

export const ACL_HMR_PATHS = Object.freeze({
    alpine: alpinePath,
    client: clientPath,
    events: eventPath,
    modules: modulePrefix,
    templates: inlineTemplatePrefix,
});
