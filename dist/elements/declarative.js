// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), [{ HTMLElementBase }, { INTERNAL_COMPONENT_ATTRIBUTES, readDeclarativeOptionSettings }, { parsePropDefinitions }, { parseJson, parseListAttribute, resolveWindowPath }] = await Promise.all([
    importLocalModule('../runtime/config.js'),
    importLocalModule('../runtime/data-options.js'),
    importLocalModule('../runtime/props.js'),
    importLocalModule('../runtime/values.js')
]);
const loaderOnlyAttributes = new Set([
    'src',
    'tag',
    'shadow',
    'data-fetch-options',
    'external-css',
    'external-scripts',
    'forward-events',
    'hooks',
    'template-cache-strategy',
    'sanitize',
    'acl-props'
]);
const inferenceIgnoredAttributes = new Set([
    ...loaderOnlyAttributes,
    ...INTERNAL_COMPONENT_ATTRIBUTES,
    'loading',
    'class',
    'style',
    'id',
    'bind-store',
    'fallback',
    'loading-template',
    'loading-html'
]);
// Create the declarative proxy element class bound to a specific loader implementation
export const createDeclarativeLoader = (loaderClass)=>class AlpineDeclarativeLoader extends HTMLElementBase {
        // Convert the proxy exactly once after it becomes connected
        connectedCallback() {
            if (this._aclProxyStarted) return;
            this._aclProxyStarted = true;
            void this._load().catch((error)=>{
                console.error(`[ACL] Failed to register declarative component from <${this.localName}>.`, error);
            });
        }
        // Parse declarative controls, register the target definition, and replace the proxy element
        async _load() {
            const src = this.getAttribute('src');
            if (!src) {
                console.error(`<${this.localName}> requires a "src" attribute.`);
                return;
            }
            let tagName = this.getAttribute('tag');
            if (!tagName) tagName = src.split('/').pop().split('.').shift();
            if (!tagName.includes('-')) {
                console.error(`<${this.localName}>: Tag name "${tagName}" must contain a hyphen.`);
                return;
            }
            // Merge descriptor-driven data controls with the remaining declarative-only options
            const declaredProps = parsePropDefinitions(this.getAttribute('acl-props') || '{}'), declarativeOptions = readDeclarativeOptionSettings(this, loaderClass.globalConfig), config = {
                shadow: this.hasAttribute('shadow') ? this.getAttribute('shadow') !== 'false' : loaderClass.globalConfig.shadow,
                loading: this.getAttribute('loading') || 'eager',
                ...declarativeOptions,
                bindStore: this.getAttribute('bind-store') || null,
                fallback: this.getAttribute('fallback') || null,
                templateCacheStrategy: this.getAttribute('template-cache-strategy') || loaderClass.globalConfig.templateCacheStrategy,
                loadingTemplate: this.getAttribute('loading-template') || null,
                loadingHtml: this.getAttribute('loading-html') || null,
                sanitize: this.hasAttribute('sanitize') ? this.getAttribute('sanitize') !== 'false' : undefined,
                externalCss: parseListAttribute(this.getAttribute('external-css')),
                externalScripts: parseListAttribute(this.getAttribute('external-scripts')),
                events: {
                    forward: parseListAttribute(this.getAttribute('forward-events'))
                },
                attributes: declaredProps
            };
            const hooksPath = this.getAttribute('hooks');
            if (hooksPath) {
                const hooks = resolveWindowPath(hooksPath);
                if (hooks && typeof hooks === 'object') config.hooks = hooks;
                else console.warn(`[ACL] hooks="${hooksPath}" did not resolve to a hook object.`);
            }
            // Infer undeclared public prop types only when this proxy owns initial registration
            if (!customElements.get(tagName)) {
                // Process each attribute
                for (const attribute of this.attributes){
                    if (inferenceIgnoredAttributes.has(attribute.name)) continue;
                    const value = attribute.value.trim();
                    let inferredType = String;
                    if (value.startsWith('[') || value.startsWith('{')) inferredType = value.startsWith('[') ? Array : Object;
                    else if (value === 'true' || value === 'false' || value === '') inferredType = Boolean;
                    else if (!Number.isNaN(Number(value))) inferredType = Number;
                    if (!config.attributes[attribute.name]) config.attributes[attribute.name] = inferredType;
                }
                await loaderClass.define(tagName, src, config);
            }
            // Forward public attributes and child nodes to the real component without cloning state
            const realElement = document.createElement(tagName);
            // Process each attribute
            for (const attribute of this.attributes){
                if (!loaderOnlyAttributes.has(attribute.name)) realElement.setAttribute(attribute.name, attribute.value);
            }
            realElement.append(...Array.from(this.childNodes));
            this.replaceWith(realElement);
        }
    };
