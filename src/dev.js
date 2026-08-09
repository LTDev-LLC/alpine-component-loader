// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'),
    resolveLocalModule = (specifier) => (isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier),
    importLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    [{ default: AlpineComponentLoader }, { getInlineComponentName }] = await Promise.all([
        importLocalModule('./index.js'),
        importLocalModule('./inline-templates.js'),
    ]);

// Resolve fetchable template sources to absolute URLs while preserving inline selectors
const normalizeSource = (source) => {
    if (typeof source !== 'string' || source.startsWith('#')) return source;
    // Guard the normalize source operation against runtime failures
    try {
        return new URL(source, document.baseURI).href;
    } catch {
        return source;
    }
};

// Traverse the document and every reachable open shadow root without recursive calls
const collectRoots = (root) => {
    const roots = [],
        pending = [root];
    // Iterate over the indexed values
    for (let index = 0; index < pending.length; index++) {
        const current = pending[index];
        roots.push(current);
        current.querySelectorAll?.('*').forEach((element) => {
            // Collect roots
            if (element.shadowRoot) pending.push(element.shadowRoot);
        });
    }
    return roots;
};

// Invalidate changed templates and reload only live instances whose definitions use them
export const reloadChangedTemplates = async (sources, loader = AlpineComponentLoader) => {
    if (typeof document === 'undefined')
        return {
            sources: [],
            tags: [],
            reloaded: 0,
        };
    const normalizedSources = new Set(
            (Array.isArray(sources) ? sources : [sources]).filter(Boolean).map(normalizeSource),
        ),
        matchingDefinitions = loader
            .getRegisteredTags()
            .map(
                // Transform the current item
                (tagName) => loader.getDefinition(tagName),
            )
            .filter(
                // Select matching items
                (definition) => normalizedSources.has(normalizeSource(definition?.source)),
            ),
        reloadTargets = new Set();

    // Clear every matching definition before collecting its instances across shadow boundaries
    await Promise.all(
        matchingDefinitions.map(async (definition) => {
            // Transform the current item
            await loader.clearTemplate(definition.source, definition.settings?._templateCacheKey);
            collectRoots(document).forEach(
                // Process the current item
                (root) =>
                    root.querySelectorAll?.(definition.tagName).forEach(
                        // Reload changed templates
                        (element) => reloadTargets.add(element),
                    ),
            );
        }),
    );

    const reloadResults = await Promise.allSettled(
            Array.from(reloadTargets, (element) => {
                // Transform the current item
                return element.reload?.({
                    preserveState: true,
                    clearTemplate: false,
                    clearData: false,
                    reason: 'hmr',
                });
            }),
        ),
        detail = {
            sources: Array.from(normalizedSources),
            tags: matchingDefinitions.map(
                // Transform the current item
                (definition) => definition.tagName,
            ),
            reloaded: reloadResults.filter(
                // Select matching items
                (result) => result.status === 'fulfilled',
            ).length,
            failed: reloadResults.filter(
                // Select matching items
                (result) => result.status === 'rejected',
            ).length,
        };
    window.dispatchEvent(new CustomEvent('acl:dev-reload', { detail }));
    return detail;
};

// Resolve an inline-template payload completely before mutating the active document
const prepareInlineTemplateUpdates = (templates, loader) => {
    if (!Array.isArray(templates) || !templates.length)
        throw new TypeError('[ACL Dev] Inline template updates require a non-empty template list.');
    const seen = new Set();
    return templates.map((update) => {
        const kind = update?.kind,
            name = String(update?.name || '').trim(),
            key = `${kind}:${name}`;
        if (!['component', 'id'].includes(kind) || !name || typeof update.html !== 'string' || seen.has(key))
            throw new TypeError('[ACL Dev] Received an invalid inline template update.');
        seen.add(key);
        const matches = Array.from(document.querySelectorAll('template')).filter(
            // Locate the exact live template identity
            (template) =>
                kind === 'component'
                    ? getInlineComponentName(template)?.toLowerCase() === name.toLowerCase()
                    : template.id === name,
        );
        if (matches.length !== 1)
            throw new TypeError(`[ACL Dev] Inline template "${name}" is not unique in the active page.`);
        const template = matches[0],
            definitions = loader
                .getRegisteredTags()
                .map(
                    // Resolve each registered definition once
                    (tagName) => loader.getDefinition(tagName),
                )
                .filter(
                    // Require the template to back an active loader definition
                    (definition) =>
                        kind === 'component'
                            ? definition?.tagName === name && definition.source === template
                            : definition?.source === template || definition?.source === `#${name}`,
                );
        if (!definitions.length)
            throw new TypeError(`[ACL Dev] Inline template "${name}" is not an active ACL definition.`);
        return {
            definitions,
            html: update.html,
            template,
        };
    });
};

// Fetch and apply one server-owned inline-template revision atomically
const reloadInlineTemplateRevision = async (message, loader) => {
    const response = await fetch(message.url, {
        cache: 'no-store',
        credentials: 'same-origin',
    });
    if (!response.ok) throw new TypeError(`[ACL Dev] Inline template revision returned ${response.status}.`);
    const payload = await response.json();
    if (
        payload?.revision !== message.revision ||
        payload?.source !== message.source ||
        !Array.isArray(payload.templates)
    )
        throw new TypeError('[ACL Dev] Inline template revision did not match its event.');
    const expected = new Set(
            (message.templates || []).map(
                // Normalize one announced template identity
                (template) => `${template?.kind}:${String(template?.name || '').trim()}`,
            ),
        ),
        received = new Set(
            payload.templates.map(
                // Normalize one fetched template identity
                (template) => `${template?.kind}:${String(template?.name || '').trim()}`,
            ),
        );
    if (
        expected.size !== received.size ||
        [...expected].some(
            // Require the fetched revision to contain exactly the announced templates
            (key) => !received.has(key),
        )
    )
        throw new TypeError('[ACL Dev] Inline template revision contents did not match its event.');
    const updates = prepareInlineTemplateUpdates(payload.templates, loader),
        replacements = updates.map(
            // Parse every inert replacement before changing any live template
            (update) => ({
                ...update,
                fragment: document.createRange().createContextualFragment(update.html),
            }),
        );
    // Patch every validated source only after the complete payload succeeds
    replacements.forEach(({ fragment, template }) => {
        template.content.replaceChildren(fragment);
    });
    const sources = [
        ...new Set(
            replacements.flatMap(({ definitions }) =>
                definitions.map(
                    // Reload through each definition's original source identity
                    (definition) => definition.source,
                ),
            ),
        ),
    ];
    return await reloadChangedTemplates(sources, loader);
};

// Maintain a native reconnecting EventSource that consumes development messages
export const connectACLDevServer = ({
    url = null,
    loader = AlpineComponentLoader,
    EventSourceImpl = globalThis.EventSource,
} = {}) => {
    if (typeof window === 'undefined' || typeof EventSourceImpl !== 'function')
        throw new TypeError('[ACL Dev] A browser-compatible EventSource implementation is required.');

    const eventSource = new EventSourceImpl(url || '/__acl_hmr/events');
    let closed = false,
        inlineQueue = Promise.resolve(),
        fallbackStarted = false;

    const fallbackReload = () => {
        // Navigate at most once for a failed or unmatched update
        if (closed || fallbackStarted) return;
        fallbackStarted = true;
        location.reload();
    };

    // Parse supported messages while keeping asynchronous reload failures detached
    const onMessage = (event) => {
        // Guard the on message operation against runtime failures
        try {
            const message = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
            if (['template-changed', 'acl:template-changed'].includes(message?.type)) {
                const sources = message.sources || message.source;
                void reloadChangedTemplates(sources, loader)
                    .then((result) => {
                        // Handle the resolved operation
                        if (message.fallback && result.reloaded === 0) fallbackReload();
                    })
                    .catch((error) => {
                        // Handle the rejected operation
                        console.error('[ACL Dev] Template reload failed.', error);
                    });
                return;
            }
            if (message?.type === 'acl:inline-template-changed') {
                inlineQueue = inlineQueue
                    .then(async () => {
                        // Ignore queued work after an explicit connection shutdown
                        if (closed) return;
                        const result = await reloadInlineTemplateRevision(message, loader);
                        if (message.fallback && result.reloaded === 0) fallbackReload();
                    })
                    .catch((error) => {
                        // Preserve ordered updates and recover through navigation on any protocol failure
                        console.error('[ACL Dev] Inline template reload failed.', error);
                        if (message.fallback) fallbackReload();
                    });
                return;
            }
            if (['page-reload', 'acl:page-reload'].includes(message?.type)) fallbackReload();
        } catch (error) {
            console.warn('[ACL Dev] Ignored invalid development message.', error);
        }
    };

    eventSource.addEventListener('message', onMessage);
    return {
        // Expose the active stream without allowing callers to replace it
        get eventSource() {
            return closed ? null : eventSource;
        },
        // Permanently stop native reconnects and release the stream once
        close() {
            if (closed) return;
            closed = true;
            eventSource.removeEventListener('message', onMessage);
            eventSource.close();
        },
    };
};

export default connectACLDevServer;
