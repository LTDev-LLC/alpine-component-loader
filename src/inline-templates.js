// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

export const INLINE_COMPONENT_TEMPLATE_SELECTOR = 'template[acl-component],template[x-acl]';

// Resolve one declaration name
export const getInlineComponentName = (template) => {
    const legacyName = template?.getAttribute?.('acl-component')?.trim() || '',
        conciseName = template?.getAttribute?.('x-acl')?.trim() || '';
    if (legacyName && conciseName && legacyName.toLowerCase() !== conciseName.toLowerCase())
        throw new TypeError(
            `[ACL] Inline template markers conflict: acl-component="${legacyName}" and x-acl="${conciseName}".`,
        );
    return conciseName || legacyName || null;
};

// Check one root and its descendants
export const containsInlineComponentTemplate = (root) =>
    Boolean(
        root?.matches?.(INLINE_COMPONENT_TEMPLATE_SELECTOR) ||
        root?.querySelector?.(INLINE_COMPONENT_TEMPLATE_SELECTOR),
    );

// Collect matching templates in document order
export const collectInlineComponentTemplates = (root) => {
    const templates = [];
    if (root?.matches?.(INLINE_COMPONENT_TEMPLATE_SELECTOR)) templates.push(root);
    root?.querySelectorAll?.(INLINE_COMPONENT_TEMPLATE_SELECTOR).forEach((template) => templates.push(template));
    return templates;
};
