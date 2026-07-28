// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    [{ validateCustomElementName }, { normalizeComponentMetadata }] = await Promise.all([
        importLocalModule('./config.js'),
        importLocalModule('./contracts.js'),
    ]);

// Return dependency-first tags while reporting a complete readable cycle path
const orderManifestDependencies = (components) => {
    const definitions = new Map(
            components.map(
                // Transform the current item
                (component) => [component.tagName, component],
            ),
        ),
        permanent = new Set(),
        visiting = new Set(),
        stack = [],
        ordered = [];

    const visit = (tagName) => {
        // Visit
        if (permanent.has(tagName)) return;
        if (visiting.has(tagName)) {
            const start = stack.indexOf(tagName),
                cycle = [...stack.slice(start), tagName];
            throw new TypeError(`[ACL] Manifest dependency cycle: ${cycle.join(' -> ')}.`);
        }
        visiting.add(tagName);
        stack.push(tagName);
        const definition = definitions.get(tagName);
        // Process each dependency
        for (const dependency of definition.dependencies) {
            if (!definitions.has(dependency))
                throw new TypeError(
                    `[ACL] Manifest component <${tagName}> references missing dependency <${dependency}>.`,
                );
            visit(dependency);
        }
        stack.pop();
        visiting.delete(tagName);
        permanent.add(tagName);
        ordered.push(tagName);
    };

    components.forEach(
        // Process the current item
        (component) => visit(component.tagName),
    );
    return ordered;
};

// Validate a version-one manifest and normalize component entries to definition objects
export const normalizeManifest = (manifest) => {
    if (
        !manifest ||
        manifest.version !== 1 ||
        !manifest.components ||
        typeof manifest.components !== 'object' ||
        Array.isArray(manifest.components)
    )
        throw new TypeError('[ACL] Component manifests require version: 1 and a components map.');
    // Expand shorthand source strings while validating every manifest definition
    const components = Object.entries(manifest.components).map(([tagName, entry]) => {
        // Transform the current item
        const definition = typeof entry === 'string' ? { source: entry } : entry;
        if (!definition?.source) throw new TypeError(`[ACL] Manifest component <${tagName}> is missing a source.`);
        const normalizedTagName = validateCustomElementName(tagName),
            dependencies = definition.dependencies == null ? [] : definition.dependencies;
        if (!Array.isArray(dependencies))
            throw new TypeError(`[ACL] Manifest dependencies for <${normalizedTagName}> must be an array.`);
        const normalizedDependencies = dependencies.map(
            // Transform the current item
            (dependency) => validateCustomElementName(dependency),
        );
        if (new Set(normalizedDependencies).size !== normalizedDependencies.length)
            throw new TypeError(`[ACL] Manifest component <${normalizedTagName}> contains duplicate dependencies.`);
        if (normalizedDependencies.includes(normalizedTagName))
            throw new TypeError(`[ACL] Manifest component <${normalizedTagName}> cannot depend on itself.`);
        return {
            tagName: normalizedTagName,
            source: definition.source,
            options: definition.options || {},
            dependencies: normalizedDependencies,
            metadata: normalizeComponentMetadata(definition.metadata, normalizedTagName),
        };
    });
    if (
        new Set(
            components.map(
                // Transform the current item
                (component) => component.tagName,
            ),
        ).size !== components.length
    )
        throw new TypeError('[ACL] Manifest component names must be unique after normalization.');
    const order = orderManifestDependencies(components),
        byTag = new Map(
            components.map(
                // Transform the current item
                (component) => [component.tagName, component],
            ),
        );
    return {
        ...manifest,
        components: order.map(
            // Transform the current item
            (tagName) => byTag.get(tagName),
        ),
        order,
    };
};

// Validate a version-one generated skeleton manifest without retaining caller-owned objects
export const normalizeSkeletonManifest = (manifest) => {
    if (
        !manifest ||
        manifest.version !== 1 ||
        !manifest.skeletons ||
        typeof manifest.skeletons !== 'object' ||
        Array.isArray(manifest.skeletons)
    )
        throw new TypeError('[ACL] Skeleton manifests require version: 1 and a skeletons map.');
    const skeletons = Object.entries(manifest.skeletons).map(([tagName, entry]) => {
        // Transform the current item
        const normalizedTagName = String(tagName || '').toLowerCase(),
            html = entry?.html;
        if (!normalizedTagName.includes('-'))
            throw new TypeError(`[ACL] Skeleton manifest tag "${tagName}" must contain a hyphen.`);
        if (typeof html !== 'string' || !html.trim())
            throw new TypeError(`[ACL] Skeleton manifest entry <${normalizedTagName}> requires non-empty html.`);
        return {
            tagName: normalizedTagName,
            html,
        };
    });
    return {
        version: 1,
        skeletons,
    };
};

// Expand roots to their complete dependency-first graph
export const resolveManifestDependencyTags = (manifest, roots, { includeRoots = true } = {}) => {
    const definitions = new Map(
            manifest.components.map(
                // Transform the current item
                (component) => [component.tagName, component],
            ),
        ),
        selected = new Set(),
        rootsSet = new Set(
            Array.from(
                roots || [],
                // Transform the current item
                (tag) => String(tag).toLowerCase(),
            ),
        ),
        visit = (tagName) => {
            // Visit
            const definition = definitions.get(tagName);
            if (!definition || selected.has(tagName)) return;
            definition.dependencies.forEach(visit);
            if (includeRoots || !rootsSet.has(tagName)) selected.add(tagName);
        };
    rootsSet.forEach(visit);
    return manifest.order.filter(
        // Select matching items
        (tagName) => selected.has(tagName),
    );
};

// Expand requested groups, remove duplicates, and retain only registered component tags
export const resolveManifestPrefetchTags = (manifest, registered, prefetch) => {
    if (prefetch === true) return [...registered];
    if (!Array.isArray(prefetch)) return [];
    const tags = prefetch.flatMap(
            // Expand the current item
            (name) => manifest.groups?.[name] || [name],
        ),
        roots = [
            ...new Set(
                tags
                    .map(
                        // Transform the current item
                        (tag) => tag.toLowerCase(),
                    )
                    .filter(
                        // Select matching items
                        (tag) => registered.includes(tag),
                    ),
            ),
        ];
    return resolveManifestDependencyTags(manifest, roots);
};

// Execute named async work with bounded workers while retaining every settled result
export const settleNamedTasks = async (names, task, concurrency = 4) => {
    const entries = Array.from(names),
        results = Object.fromEntries(
            entries.map(
                // Transform the current item
                (name) => [name, null],
            ),
        );
    if (!entries.length) return results;
    const workerCount = Math.max(1, Math.min(entries.length, Number(concurrency) || 1));
    let cursor = 0;
    // Share a monotonic cursor so workers claim each name exactly once without nested queues
    const worker = async () => {
        // Continue until the operation completes
        while (cursor < entries.length) {
            const name = entries[cursor++];
            // Guard the worker operation against runtime failures
            try {
                results[name] = {
                    status: 'fulfilled',
                    value: await task(name),
                };
            } catch (reason) {
                results[name] = {
                    status: 'rejected',
                    reason,
                };
            }
        }
    };
    await Promise.all(Array.from({ length: workerCount }, worker));
    return results;
};
