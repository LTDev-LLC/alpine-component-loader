import { readFile } from 'node:fs/promises';
import { normalizeManifest, resolveManifestDependencyTags } from '../dist/runtime/registry.js';
import { moduleClosure } from './module-graph.mjs';

// Infer only capabilities activated by explicit manifest definitions
export const selectRuntimeModules = async ({
    manifest,
    tags = [],
    groups = [],
    features = [],
    all = false,
    entryUrl,
}) => {
    const graph = JSON.parse(await readFile(new URL('../dist/module-graph.json', import.meta.url), 'utf8')),
        normalized = normalizeManifest(manifest),
        roots = [...tags];
    groups.forEach((group) => {
        if (!manifest.groups?.[group]) throw new TypeError(`Unknown manifest group ${group}`);
        roots.push(...manifest.groups[group]);
    });
    if (all && !roots.length) roots.push(...normalized.order);
    roots.forEach((tag) => {
        if (!normalized.order.includes(tag)) throw new TypeError(`Unknown component ${tag}`);
    });
    const selected = resolveManifestDependencyTags(normalized, roots),
        capabilities = new Set(features),
        modules = new Set([
            entryUrl && /\/core(?:\.min)?\.js$/.test(new URL(entryUrl, 'https://acl.invalid/').pathname)
                ? 'core.js'
                : 'index.js',
            'runtime/loader.js',
        ]);
    if (selected.length) modules.add('runtime/registry.js');
    selected.forEach((tag) => {
        // Derive optional roots without importing them into the browser facade
        const component = normalized.components.find((item) => item.tagName === tag),
            options = component.options || {};
        capabilities.add('component');
        if (!component.source.startsWith('#')) {
            capabilities.add('templates');
            if (options.cacheTemplates !== false) capabilities.add('cache');
        }
        if (options.data?.src || Number(options.data?.poll) > 0) capabilities.add('data');
        if (options.hydrate && options.hydrate !== 'eager') capabilities.add('hydration');
        if ((options.loading && options.loading !== 'eager') || (options.hydrate && options.hydrate !== 'eager'))
            capabilities.add('triggers');
        if (options.shadow || options.sharedStyleSheets?.length) capabilities.add('styles');
        if (options.executeScripts) capabilities.add('scripts');
        if (options.persist) capabilities.add('persistence');
        if (options.externalCss?.length || options.externalScripts?.length) capabilities.add('assets');
        if (options.form) capabilities.add('form');
        if (options.hydrationScheduler) capabilities.add('scheduler');
        if (
            options.loading === 'lazy' ||
            options.hydrate === 'visible' ||
            (Number(options.data?.poll) > 0 &&
                (options.data?.pauseWhenHidden !== false ||
                    options.data?.pauseWhenOffline !== false ||
                    options.data?.pauseWhenOffscreen))
        )
            capabilities.add('environment');
        if (options.observability) capabilities.add('observability');
        if (options.adaptivePrefetch) capabilities.add('adaptivePrefetch');
    });
    capabilities.forEach((feature) => {
        if (!graph.capabilities[feature]) throw new TypeError(`Unsupported runtime capability ${feature}`);
        graph.capabilities[feature].forEach((path) => modules.add(path));
    });
    return moduleClosure(graph, [...modules]);
};

// Match native module URL resolution including the generated minified family
export const resolveRuntimeModuleUrl = (entryUrl, path, preserveInstance = true) => {
    const relativeEntry = !/^[a-z][a-z\d+.-]*:/i.test(entryUrl),
        entry = new URL(entryUrl, 'https://acl.invalid/');
    if (!/\/(?:index|core)(?:\.min)?\.js$/.test(entry.pathname))
        throw new TypeError('Runtime entryUrl must point to index(.min).js or core(.min).js');
    const url = new URL(entry.pathname.endsWith('.min.js') ? path.replace(/\.js$/, '.min.js') : path, entry);
    if (preserveInstance && entry.searchParams.has('acl-instance'))
        url.searchParams.set('acl-instance', entry.searchParams.get('acl-instance'));
    return relativeEntry ? `${url.pathname}${url.search}` : url.href;
};

// Expand actual URL identities including edges that intentionally share modules across instances
export const resolveRuntimeModuleRecords = async (entryUrl, paths) => {
    const graph = JSON.parse(await readFile(new URL('../dist/module-graph.json', import.meta.url), 'utf8')),
        selected = new Set(paths),
        records = new Map();
    // Resolve the queued operation and release its resources

    const visit = (path, instance) => {
        const url = resolveRuntimeModuleUrl(entryUrl, path, instance);
        if (records.has(url)) return;
        records.set(url, {
            path,
            url,
        });
        const node = graph.nodes[path];
        // Resolve the queued operation and release its resources
        // Process the pending work in deterministic order
        for (const child of [...node.eager, ...node.deferred.filter((target) => selected.has(target))])
            visit(child, instance && node.instanceEdges.includes(child));
    };
    visit(
        /\/core(?:\.min)?\.js$/.test(new URL(entryUrl, 'https://acl.invalid/').pathname) ? 'core.js' : 'index.js',
        true,
    );
    // Process the pending work in deterministic order
    for (const path of paths) if (![...records.values()].some((record) => record.path === path)) visit(path, false);
    return [...records.values()].sort((a, b) => a.url.localeCompare(b.url));
};

// Produce explicit dependency hints without fetching or evaluating runtime capabilities
export const generateModulePreloads = async (options) => {
    // Resolve the queued operation and release its resources
    const paths = await selectRuntimeModules(options),
        records = await resolveRuntimeModuleRecords(options.entryUrl, paths),
        urls = records.map((record) => record.url),
        // Resolve the queued operation and release its resources
        escape = (value) => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
    return {
        urls,
        html: urls.map((url) => `<link rel="modulepreload" href="${escape(url)}">`).join('\n'),
    };
};
