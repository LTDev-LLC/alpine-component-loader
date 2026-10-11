// Install discovery only for the compatibility entry and its isolated facades
const enableDiscovery = (context, Loader) => {
    const pendingBuiltIns = new Map();
    // Resolve the configured custom element name for a built in
    const builtInSelector = (name) =>
        name === 'declarative'
            ? Loader.globalConfig.defaultComponentName || 'acl-component'
            : name === 'dynamic'
              ? Loader.globalConfig.defaultDynamicName || 'acl-dynamic'
              : Loader.globalConfig.defaultBoundaryName || 'acl-boundary';

    // Register one built in custom element only when discovered
    const registerBuiltIn = async (name, elementName = builtInSelector(name)) => {
        const key = `${name}:${elementName}`;
        if (pendingBuiltIns.has(key)) return pendingBuiltIns.get(key);
        const registration = Promise.resolve(Loader)
            .then(async (Implementation) => {
                // Select the matching runtime registration path
                if (name === 'declarative') await Implementation.registerComponent(elementName);
                else if (name === 'dynamic') await Implementation.registerDynamicLoader(elementName);
                else await Implementation.registerErrorBoundary(elementName);
            })
            .finally(() => {
                // Release the shared registration promise after settlement
                if (pendingBuiltIns.get(key) === registration) pendingBuiltIns.delete(key);
            });
        pendingBuiltIns.set(key, registration);
        return registration;
    };

    // Find built in elements below a newly visible DOM root
    const scanBuiltIns = (root) => {
        if (!root?.querySelector) return [];
        const declarativeName = builtInSelector('declarative'),
            dynamicName = builtInSelector('dynamic'),
            boundaryName = builtInSelector('boundary'),
            registrations = [];
        if (root.matches?.(declarativeName) || root.querySelector(declarativeName))
            registrations.push(registerBuiltIn('declarative', declarativeName));
        if (root.matches?.(dynamicName) || root.querySelector(dynamicName))
            registrations.push(registerBuiltIn('dynamic', dynamicName));
        if (root.matches?.(boundaryName) || root.querySelector(boundaryName))
            registrations.push(registerBuiltIn('boundary', boundaryName));
        return registrations;
    };

    // Observe the document for built ins that require runtime activation
    const installBuiltInDiscovery = () => {
        if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return [];
        const root = Loader.root || document,
            initialRegistrations = scanBuiltIns(root);
        if (context.discoveryObserver) return initialRegistrations;
        context.discoveryObserver = new MutationObserver((records) => {
            // Inspect each mutation for newly added built in elements
            records.forEach((record) => {
                // Scan each added element as an independent DOM root
                record.addedNodes.forEach((node) => {
                    // Ignore non-element nodes that cannot contain built ins
                    if (node.nodeType === 1)
                        scanBuiltIns(node).forEach(
                            // Report background discovery failures without creating unhandled rejections
                            (registration) =>
                                void registration.catch((error) =>
                                    Loader._report(
                                        'warn',
                                        '[ACL] Failed to register a discovered built-in element.',
                                        error,
                                        { phase: 'runtime-import' },
                                    ),
                                ),
                        );
                });
            });
        });
        context.discoveryObserver.observe(root === document ? document.documentElement : root, {
            childList: true,
            subtree: true,
        });
        return initialRegistrations;
    };

    context.discover = installBuiltInDiscovery;
};

const Loader = (defaultContext.facade ||= createFacade(defaultContext));
enableDiscovery(defaultContext, Loader);
export default Loader;
export { ACLLoadError };
// Create an isolated synchronous facade without importing another implementation graph
export const createLoader = ({ root = null, config = {}, cacheNamespace = null } = {}) => {
    const context = createContext(),
        Loader = createFacade(context);
    context.facade = Loader;
    enableDiscovery(context, Loader);
    Loader.root = root;
    Loader.config({
        ...config,
        cacheNamespace: cacheNamespace ?? config.cacheNamespace ?? context.id,
    });
    return Loader;
};
// Create an IndexedDB adapter facade that opens storage on first use
export const createIndexedDBPersistenceAdapter = (...args) => {
    let adapterPromise = null,
        closed = false;
    // Load the persistence implementation only for the first operation
    const getAdapter = () => {
        if (!adapterPromise) {
            const loading = importDeferredLocalModule('./runtime/persistence.js')
                .then(
                    // Construct the concrete adapter after its module arrives
                    ({ createIndexedDBPersistenceAdapter: createAdapter }) => createAdapter(...args),
                )
                .catch((error) => {
                    // Evict a failed adapter import so the next storage operation can retry
                    if (adapterPromise === loading) adapterPromise = null;
                    throw new ACLLoadError('Unable to load the IndexedDB persistence adapter.', {
                        code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                        phase: 'runtime-import',
                        cause: error,
                        retryable: true,
                    });
                });
            adapterPromise = loading;
        }
        return adapterPromise;
    };
    return {
        // Read one persisted value through the deferred adapter
        async getItem(key) {
            return (await getAdapter()).getItem(key);
        },
        // Write one persisted value through the deferred adapter
        async setItem(key, value) {
            return (await getAdapter()).setItem(key, value);
        },
        // Remove one persisted value through the deferred adapter
        async removeItem(key) {
            return (await getAdapter()).removeItem(key);
        },
        // Close the adapter now or after its deferred construction
        close() {
            closed = true;
            void adapterPromise?.then(
                (adapter) => {
                    // Close a concrete adapter that finished opening
                    adapter.close?.();
                },
                // The initiating storage operation owns any deferred import failure
                () => {},
            );
        },
        // Expose facade closure state without opening storage
        get closed() {
            return closed;
        },
    };
};
