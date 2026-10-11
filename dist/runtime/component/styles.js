// @license AlpineComponentLoader
// Copyright (c) LouisT
// Licensed under the MIT license in the repository root

const suffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, suffix)), [{ setBoundedMapEntry }, { createRuntimeCaches }] = await Promise.all([
    importLocalModule('../config.js'),
    importLocalModule('../caches.js')
]);
// Transform component styles only when content or shared sheets require them
export const transformStyles = async (rootNode, component, settings, AlpineComponentLoader)=>{
    // Process styles through constructible sheets scoping or stripping
    if (!settings.stripStyles) {
        if (settings.shadow && window.ShadyCSS && (!window.ShadyCSS.nativeShadow || !window.ShadyCSS.nativeCss)) {
            const template = document.createElement('template');
            // Include shared sheets in the same sanitized shadow-template preparation phase
            settings.sharedStyleSheets.forEach((sheet)=>{
                const style = document.createElement('style');
                style.textContent = Array.from(sheet.cssRules).map((rule)=>rule.cssText).join('\n');
                template.content.appendChild(style);
            });
            template.content.append(...rootNode.childNodes);
            window.ShadyCSS.prepareTemplate(template, component.localName);
            rootNode.append(...template.content.childNodes);
            component._usesShadyCSS = true;
            return;
        }
        const styles = Array.from(rootNode.querySelectorAll('style'));
        // Use constructible stylesheets for Shadow DOM when supported
        if (settings.shadow && settings.useConstructibleStyles && document.adoptedStyleSheets) {
            const combinedCss = styles.map(// Transform the current item
            (s)=>s.textContent).join('\n');
            let sheet = null;
            if (combinedCss.trim().length > 0) {
                const module = {
                    createRuntimeCaches
                }, { styleSheetCache } = AlpineComponentLoader._context.caches ||= module.createRuntimeCaches();
                if (styleSheetCache.has(combinedCss)) sheet = styleSheetCache.get(combinedCss);
                else {
                    sheet = new CSSStyleSheet();
                    sheet.replaceSync(combinedCss);
                    setBoundedMapEntry(styleSheetCache, combinedCss, sheet, settings.runtimeCacheMax);
                }
            }
            // Apply shared + internal styles
            component._root.adoptedStyleSheets = [
                ...settings.sharedStyleSheets || [],
                ...sheet ? [
                    sheet
                ] : []
            ];
            // Remove style tags since we moved them to adoptedStyleSheets
            styles.forEach(// Process the current item
            (el)=>el.remove());
        } else {
            // Fallback: Standard tag injection + scoping
            styles.forEach((style)=>{
                // Process the current item
                if (!settings.shadow) {
                    // Native @scope support
                    if ('CSSScopeRule' in window) {
                        style.textContent = `@scope { ${style.textContent.replace(/:host/g, ':scope')} }`;
                    } else {
                        component._scopeId ||= `scope-${Math.random().toString(36).slice(2, 9)}`;
                        component.setAttribute('data-scope', component._scopeId);
                        const scopeSelector = `${component.localName}[data-scope="${component._scopeId}"]`;
                        style.textContent = scopeLightDomCss(style.textContent, scopeSelector);
                    }
                }
            });
        }
    } else {
        rootNode.querySelectorAll('style').forEach(// Process the current item
        (el)=>el.remove());
    }
};
// Apply fallback custom properties and scoped styles after the prepared DOM is inserted
export const finishStyles = (component)=>{
    if (component._usesShadyCSS) window.ShadyCSS?.styleElement(component);
};
// Split a selector list only at top-level commas outside quotes, brackets, and functions
const splitSelectorList = (selectorText)=>{
    const selectors = [];
    let current = '', depth = 0, quote = null, escaped = false;
    // Process each character
    for (const character of selectorText){
        if (escaped) {
            current += character;
            escaped = false;
            continue;
        }
        if (character === '\\') {
            current += character;
            escaped = true;
            continue;
        }
        if (quote) {
            current += character;
            if (character === quote) quote = null;
            continue;
        }
        if (character === '"' || character === "'") {
            quote = character;
            current += character;
            continue;
        }
        if (character === '(' || character === '[') depth++;
        else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
        if (character === ',' && depth === 0) {
            selectors.push(current.trim());
            current = '';
        } else current += character;
    }
    if (current.trim()) selectors.push(current.trim());
    return selectors;
};
// Rewrite one selector list so every branch is anchored to the component scope
export const scopeSelectorText = (selectorText, scopeSelector)=>splitSelectorList(selectorText).map((selector)=>{
        // Transform the current item
        let scoped = selector.replace(/:host\s*\(([^)]+)\)/g, `${scopeSelector}$1`).replace(/:host\b/g, scopeSelector).replace(/:scope\b/g, scopeSelector).replace(/^\s*(?:html|body|:root)\b/, scopeSelector);
        if (!scoped.includes(scopeSelector)) scoped = `${scopeSelector} ${scoped}`;
        return scoped;
    }).join(', ');
// Parse and recursively scope ordinary CSS rules while leaving keyframes untouched
export const scopeLightDomCss = (cssText, scopeSelector)=>{
    let sheet, temporaryStyle = null;
    // Guard the scope light dom css operation against runtime failures
    try {
        if (typeof CSSStyleSheet === 'function' && CSSStyleSheet.prototype.replaceSync) {
            sheet = new CSSStyleSheet();
            sheet.replaceSync(cssText);
        } else {
            temporaryStyle = document.createElement('style');
            temporaryStyle.textContent = cssText;
            document.head.appendChild(temporaryStyle);
            sheet = temporaryStyle.sheet;
        }
        // Descend through grouping rules but never rewrite animation keyframe selectors
        const rewriteRules = (rules)=>Array.from(rules || []).forEach((rule)=>{
                // Process the current item
                if (typeof CSSStyleRule !== 'undefined' && rule instanceof CSSStyleRule) {
                    rule.selectorText = scopeSelectorText(rule.selectorText, scopeSelector);
                    return;
                }
                if (rule.cssRules && !(typeof CSSKeyframesRule !== 'undefined' && rule instanceof CSSKeyframesRule)) rewriteRules(rule.cssRules);
            });
        rewriteRules(sheet?.cssRules);
        return Array.from(sheet?.cssRules || []).map(// Transform the current item
        (rule)=>rule.cssText).join('\n');
    } finally{
        temporaryStyle?.remove();
    }
};
