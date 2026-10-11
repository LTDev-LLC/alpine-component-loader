// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    { ACLLoadError } = await importLocalModule('./errors.js');

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'data']),
    EXECUTABLE_PROTOCOL = /^(?:javascript|vbscript):/i,
    EXECUTABLE_DATA = /^data\s*:\s*(?:text\/html|application\/xhtml\+xml|image\/svg\+xml)/i,
    parsedFragmentCaches = new WeakMap();

const normalizeUrlForPolicy = (value) => {
    // Normalize url for policy
    return String(value || '')
        .replace(/[\u0000-\u0020\u007f]+/g, '')
        .trim();
};

export const isExecutableUrl = (value) => {
    // Check whether executable url
    const normalized = normalizeUrlForPolicy(value);
    return EXECUTABLE_PROTOCOL.test(normalized) || EXECUTABLE_DATA.test(normalized);
};

const policyAllowsUrl = (value, context) => {
    // Run the policy allows url operation
    if (isExecutableUrl(value)) return false;
    const policy = context.settings?.security?.urlPolicy;
    if (typeof policy !== 'function') return true;
    // Guard the policy allows url operation against runtime failures
    try {
        return policy(String(value), context) !== false;
    } catch {
        return false;
    }
};

const trustedHtml = (html, settings) => {
    // Run the trusted html operation
    const policy = settings?.security?.trustedTypesPolicy;
    return policy?.createHTML ? policy.createHTML(String(html)) : html;
};

// Parse HTML into a detached fragment containing both head and body nodes
export const htmlToFragment = (html, settings = {}) => {
    let doc;
    // Guard the html to fragment operation against runtime failures
    try {
        doc = new DOMParser().parseFromString(trustedHtml(html, settings), 'text/html');
    } catch (cause) {
        if (cause?.name === 'TypeError')
            throw new ACLLoadError('A Trusted Types policy is required to parse component HTML.', {
                code: 'ACL_TRUSTED_TYPES_REQUIRED',
                phase: 'sanitize',
                cause,
            });
        throw cause;
    }
    const fragment = document.createDocumentFragment();
    [...doc.head.childNodes, ...doc.body.childNodes].forEach(
        // Process the current item
        (node) => fragment.appendChild(node),
    );
    return fragment;
};

// Clone one of the two most recently parsed templates for a component definition
export const cloneParsedFragment = (html, settings = {}) => {
    if (settings?.security?.trustedTypesPolicy || !settings || typeof settings !== 'object')
        return htmlToFragment(html, settings);
    const cache = parsedFragmentCaches.get(settings) || [],
        source = String(html),
        cachedIndex = cache.findIndex(
            // Find a matching parsed source within the tiny definition cache
            (entry) => entry.source === source,
        );
    if (cachedIndex >= 0) {
        const [cached] = cache.splice(cachedIndex, 1);
        cache.unshift(cached);
        return cached.fragment.cloneNode(true);
    }
    const fragment = htmlToFragment(source, settings);
    cache.unshift({
        source,
        fragment,
    });
    if (cache.length > 2) cache.length = 2;
    parsedFragmentCaches.set(settings, cache);
    return fragment.cloneNode(true);
};

// Enumerate descendants while following inert template content fragments
const collectElements = (rootNode) => {
    // Visit each node exactly once including inert template fragments
    const elements = [],
        stack = [rootNode];
    // Process queued work in a bounded deterministic order
    while (stack.length) {
        const node = stack.pop();
        if (node?.nodeType === 1) elements.push(node);
        const children = node?.localName === 'template' && node.content ? node.content.childNodes : node?.childNodes;
        // Process queued work in a bounded deterministic order
        if (children) for (let index = children.length - 1; index >= 0; index--) stack.push(children[index]);
    }
    return elements;
};

// Remove executable elements handlers navigation sinks and unsafe URLs
export const sanitizeNodeTree = (rootNode, settings = {}, context = {}) => {
    collectElements(rootNode).forEach((element) => {
        // Process the current item
        const localName = element.localName?.toLowerCase();
        if (
            localName === 'script' ||
            localName === 'base' ||
            (localName === 'meta' && element.getAttribute('http-equiv')?.trim().toLowerCase() === 'refresh')
        ) {
            element.remove();
            return;
        }
        Array.from(element.attributes).forEach((attribute) => {
            // Process the current item
            const name = attribute.name.toLowerCase(),
                value = attribute.value;
            if (name.startsWith('on') || name === 'srcdoc') {
                element.removeAttribute(attribute.name);
                return;
            }
            const policyContext = {
                ...context,
                settings,
                element,
                attribute: name,
            };
            if (URL_ATTRIBUTES.has(name) && !policyAllowsUrl(value, policyContext)) {
                element.removeAttribute(attribute.name);
                return;
            }
            if (name === 'srcset') {
                const candidates = value
                    .split(',')
                    .map(
                        // Transform the current item
                        (candidate) => candidate.trim().split(/\s+/)[0],
                    )
                    .filter(Boolean);
                if (
                    candidates.some(
                        // Check the current item
                        (candidate) => !policyAllowsUrl(candidate, policyContext),
                    )
                )
                    element.removeAttribute(attribute.name);
            }
        });
    });
    return rootNode;
};

// Apply a custom sanitizer contract or the built-in safe-mode sanitizer
export const applySanitizer = async (rootNode, settings, context) => {
    if (!settings.sanitize) return rootNode;
    if (typeof settings.sanitize === 'function') {
        const result = await settings.sanitize(rootNode, context);
        if (typeof result === 'string') return htmlToFragment(result, settings);
        if (result instanceof Node) {
            if (result instanceof DocumentFragment) return result;
            const fragment = document.createDocumentFragment();
            fragment.appendChild(result);
            return fragment;
        }
        return rootNode;
    }
    return sanitizeNodeTree(rootNode, settings, context);
};
