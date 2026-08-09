// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const min = new URL(import.meta.url).pathname.endsWith('.min.js'), resolveLocalModule = (specifier)=>min ? specifier.replace(/\.js$/, '.min.js') : specifier, importLocalModule = (specifier)=>import(/* @vite-ignore */ resolveLocalModule(specifier)), { default: AlpineComponentLoader, ACLLoadError, createIndexedDBPersistenceAdapter } = await importLocalModule('./index.js');
let stopAutoTemplateObserver = null;
// Apply browser auto configuration
const boot = async ()=>{
    if (typeof document === 'undefined') return;
    // Guard auto startup
    try {
        if (globalThis.AlpineComponentLoaderConfig) AlpineComponentLoader.config(globalThis.AlpineComponentLoaderConfig);
        stopAutoTemplateObserver?.();
        stopAutoTemplateObserver = null;
        if (AlpineComponentLoader.globalConfig.autoStart === false) return;
        if (AlpineComponentLoader.globalConfig.observeTemplates !== false) stopAutoTemplateObserver = AlpineComponentLoader.observeTemplates();
        await AlpineComponentLoader.start();
    } catch (error) {
        stopAutoTemplateObserver?.();
        stopAutoTemplateObserver = null;
        console.warn('[ACL] Failed to auto-register components.', error);
    }
};
// Defer boot until parsing finishes
if (typeof document !== 'undefined' && document.readyState === 'loading') window.addEventListener('DOMContentLoaded', // Handle the domcontent loaded event
()=>void boot(), {
    once: true
});
else setTimeout(// Allow an importing module to queue definitions before automatic startup begins
()=>void boot(), 0);
export { boot as startAutoLoader };
export { ACLLoadError, createIndexedDBPersistenceAdapter };
export default AlpineComponentLoader;
