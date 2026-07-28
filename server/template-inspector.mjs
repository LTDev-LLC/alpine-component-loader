import { loadOptionalDependency } from './optional-dependency.mjs';

const { parseFragment } = await loadOptionalDependency('parse5', 'component template inspection');

export const DECLARATIVE_JSON_ATTRIBUTES = new Set([
    'acl-props',
    'data-fetch-options',
    'external-css',
    'external-scripts',
    'forward-events',
]);

// Traverse parse5's document fragment and inert template contents in source order
const visitElements = (root, visitor) => {
    // Run this operation
    for (const node of root?.childNodes || []) {
        if (node.tagName) visitor(node);
        visitElements(node, visitor);
        if (node.tagName === 'template' && node.content) visitElements(node.content, visitor);
    }
};

// Inspect component markup structurally so formatting and quoting cannot change results
export const inspectComponentTemplate = (source, { knownTags = [] } = {}) => {
    const parseErrors = [],
        fragment = parseFragment(String(source), {
            sourceCodeLocationInfo: true,
            // Run this operation
            onParseError: (error) => parseErrors.push(error),
        }),
        // Run this operation
        known = new Set(Array.from(knownTags, (tag) => String(tag).toLowerCase())),
        encountered = new Set(),
        declarativeJson = [],
        slots = new Set(),
        externalCss = new Set(),
        externalScripts = new Set(),
        propSuggestions = new Set(),
        eventSuggestions = new Set(),
        dataSuggestions = new Set();

    visitElements(fragment, (node) => {
        const tagName = String(node.tagName || '').toLowerCase(),
            attributes = Object.fromEntries(
                (node.attrs || []).map(
                    // Run this operation
                    (attribute) => [attribute.name.toLowerCase(), attribute.value],
                ),
            );
        if (known.has(tagName)) encountered.add(tagName);
        if (tagName === 'slot') slots.add(attributes.name || 'default');
        if (
            tagName === 'link' &&
            String(attributes.rel || '')
                .toLowerCase()
                .split(/\s+/)
                .includes('stylesheet') &&
            attributes.href
        )
            externalCss.add(attributes.href);
        if (tagName === 'script' && attributes.src) externalScripts.add(attributes.src);
        // Run this operation
        for (const attribute of node.attrs || []) {
            const name = String(attribute.name || '').toLowerCase();
            // Process forof
            for (const match of String(attribute.value).matchAll(/\$props\.([A-Za-z_$][\w$]*)/g))
                propSuggestions.add(match[1]);
            // Process forof
            for (const match of String(attribute.value).matchAll(/\$(?:dispatch|emit)\(\s*['"]([^'"]+)['"]/g))
                eventSuggestions.add(match[1]);
            if (name === 'data-src' || name.startsWith('data-fetch-') || name === 'data-method' || name === 'data-body')
                dataSuggestions.add(name);
            if (!DECLARATIVE_JSON_ATTRIBUTES.has(name)) continue;
            const location = node.sourceCodeLocation?.attrs?.[name] || node.sourceCodeLocation || null;
            declarativeJson.push({
                name,
                value: attribute.value,
                line: location?.startLine || null,
                column: location?.startCol || null,
            });
        }
    });

    return {
        dependencies: Array.from(knownTags, (tag) => String(tag).toLowerCase()).filter((tag) => encountered.has(tag)),
        declarativeJson,
        parseErrors,
        slots: [...slots],
        externalCss: [...externalCss],
        externalScripts: [...externalScripts],
        suggestions: {
            props: [...propSuggestions],
            events: [...eventSuggestions],
            data: [...dataSuggestions],
        },
    };
};

export default inspectComponentTemplate;
