// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

// Initialize cloned server content with the owning instance's sanitizer policy
export const hydrateContent = async (component, settings, tagName, AlpineComponentLoader, loadSignal)=>{
    const { applySanitizer } = await AlpineComponentLoader._loadModule('./rendering.js');
    if (settings.externalCss.length) await component._appendShadowExternalStyles(loadSignal);
    const fragment = document.createDocumentFragment();
    Array.from(component._root.childNodes).forEach(// Process the current item
    (node)=>fragment.appendChild(node.cloneNode(true)));
    const sanitized = await applySanitizer(fragment, settings, {
        el: component,
        root: component._root,
        props: component.$props,
        tagName
    });
    let styles = null;
    if (settings.shadow && window.ShadyCSS && (!window.ShadyCSS.nativeShadow || !window.ShadyCSS.nativeCss) && (sanitized.querySelector('style') || settings.sharedStyleSheets.length)) {
        // Prepare sanitized server content for the same scoped fallback as client rendering
        styles = await AlpineComponentLoader._loadModule('./component/styles.js');
        loadSignal.throwIfAborted();
        await styles.transformStyles(sanitized, component, settings, AlpineComponentLoader);
    }
    loadSignal.throwIfAborted();
    component._installAlpinePropsScope();
    Array.from(sanitized.childNodes).forEach((node)=>component._exposePropsToNode(node));
    component._root.replaceChildren(sanitized);
    styles?.finishStyles(component);
};
