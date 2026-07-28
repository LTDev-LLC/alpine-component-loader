// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js',
    importLocalModule = (specifier) => import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)),
    { cloneRuntimeValue } = await importLocalModule('./values.js');

// Snapshot only clonable application props and omit loader helper state
const publicProps = (props) =>
    Object.fromEntries(
        Object.entries(props || {})
            .filter(
                // Select matching items
                ([name, value]) => !name.startsWith('$') && typeof value !== 'function',
            )
            .map(
                // Transform the current item
                ([name, value]) => [name, cloneRuntimeValue(value)],
            ),
    );

// Fall back to structural child indexes when controls have no stable identifier
const elementPath = (element, root) => {
    const indexes = [];
    let current = element;
    // Continue until the operation completes
    while (current && current !== root) {
        const parent = current.parentElement || (current.parentNode === root ? root : null);
        if (!parent) return null;
        indexes.unshift(Array.from(parent.children).indexOf(current));
        current = parent;
    }
    return indexes.join('.');
};

const byPath = (root, path) => {
    // Run the by path operation
    let current = root;
    // Process each index
    for (const index of String(path).split('.').filter(Boolean).map(Number)) current = current?.children?.[index];
    return current || null;
};

const selectorEscape = (value) => {
    // Run the selector escape operation
    return globalThis.CSS?.escape ? CSS.escape(value) : String(value).replace(/["\\]/g, '\\$&');
};

// Prefer explicit keys then unique attributes before using a structural path
const preserveKey = (element, root) => {
    const explicit = element.getAttribute('data-acl-preserve-key');
    if (explicit) return `key:${explicit}`;
    if (element.id && root.querySelectorAll(`#${selectorEscape(element.id)}`).length === 1) return `id:${element.id}`;
    if (
        element.getAttribute('name') &&
        root.querySelectorAll(`[name="${selectorEscape(element.getAttribute('name'))}"]`).length === 1
    )
        return `name:${element.getAttribute('name')}`;
    return `path:${elementPath(element, root)}`;
};

const resolveKey = (key, root) => {
    // Resolve key
    const [kind, ...parts] = key.split(':'),
        value = parts.join(':');
    if (kind === 'key') return root.querySelector(`[data-acl-preserve-key="${selectorEscape(value)}"]`);
    if (kind === 'id') return root.querySelector(`#${selectorEscape(value)}`);
    if (kind === 'name') return root.querySelector(`[name="${selectorEscape(value)}"]`);
    return byPath(root, value);
};

// Capture portable public and DOM state before a development template replacement
export const captureReloadState = (element, root, props) => {
    const controls = Array.from(root.querySelectorAll('input, textarea, select')).map(
            // Transform the current item
            (control) => ({
                key: preserveKey(control, root),
                value: control.value,
                checked: 'checked' in control ? control.checked : undefined,
                selectedIndex: 'selectedIndex' in control ? control.selectedIndex : undefined,
                selectionStart: typeof control.selectionStart === 'number' ? control.selectionStart : null,
                selectionEnd: typeof control.selectionEnd === 'number' ? control.selectionEnd : null,
            }),
        ),
        scroll = Array.from(root.querySelectorAll('*'))
            .filter(
                // Select matching items
                (node) => node.scrollTop || node.scrollLeft,
            )
            .map(
                // Transform the current item
                (node) => ({
                    key: preserveKey(node, root),
                    top: node.scrollTop,
                    left: node.scrollLeft,
                }),
            ),
        active = root.activeElement || (root.contains?.(document.activeElement) ? document.activeElement : null),
        alpine = globalThis.Alpine
            ? Array.from(root.querySelectorAll('[x-data]')).map(
                  // Snapshot public local Alpine state using the same stable DOM keys as controls
                  (node) => ({
                      key: preserveKey(node, root),
                      value: publicProps(node._x_dataStack?.[0] || globalThis.Alpine.$data?.(node)),
                  }),
              )
            : [];
    return {
        alpine,
        props: publicProps(props),
        controls,
        scroll,
        focus: active
            ? {
                  key: preserveKey(active, root),
                  selectionStart: typeof active.selectionStart === 'number' ? active.selectionStart : null,
                  selectionEnd: typeof active.selectionEnd === 'number' ? active.selectionEnd : null,
              }
            : null,
        hostScroll: {
            top: element.scrollTop,
            left: element.scrollLeft,
        },
    };
};

// Restore through the existing props object so Alpine retains its reactive proxy
export const restoreReloadProps = (props, snapshot) => {
    Object.entries(snapshot?.props || {}).forEach(([name, value]) => {
        // Process the current item
        props[name] = cloneRuntimeValue(value);
    });
};

// Restore recreated DOM state after Alpine has initialized the replacement template
export const restoreReloadDomState = (element, root, snapshot) => {
    // Restore local Alpine data through its new reactive proxy before DOM control state
    for (const state of snapshot?.alpine || []) {
        const node = resolveKey(state.key, root),
            data = node && (node._x_dataStack?.[0] || globalThis.Alpine?.$data?.(node));
        if (!data) continue;
        Object.entries(state.value || {}).forEach(([name, value]) => {
            data[name] = cloneRuntimeValue(value);
        });
    }
    // Process each state
    for (const state of snapshot?.controls || []) {
        const control = resolveKey(state.key, root);
        if (!control) continue;
        if ('value' in control) control.value = state.value;
        if (state.checked !== undefined && 'checked' in control) control.checked = state.checked;
        if (state.selectedIndex !== undefined && 'selectedIndex' in control)
            control.selectedIndex = state.selectedIndex;
        if (state.selectionStart != null && typeof control.setSelectionRange === 'function') {
            // Guard the restore reload dom state operation against runtime failures
            try {
                control.setSelectionRange(state.selectionStart, state.selectionEnd);
            } catch {
                // Ignore unsupported input types
            }
        }
    }
    // Process each state
    for (const state of snapshot?.scroll || []) {
        const node = resolveKey(state.key, root);
        if (node) node.scrollTo?.(state.left, state.top);
    }
    element.scrollTo?.(snapshot?.hostScroll?.left || 0, snapshot?.hostScroll?.top || 0);
    if (snapshot?.focus) {
        const active = resolveKey(snapshot.focus.key, root);
        active?.focus?.({ preventScroll: true });
        if (active && snapshot.focus.selectionStart != null && typeof active.setSelectionRange === 'function') {
            // Guard the restore reload dom state operation against runtime failures
            try {
                active.setSelectionRange(snapshot.focus.selectionStart, snapshot.focus.selectionEnd);
            } catch {
                // Ignore unsupported input types
            }
        }
    }
};
