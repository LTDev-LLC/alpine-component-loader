// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

// Propagate jsDelivr's generated minified entry suffix to package-owned dependencies
const isMinifiedModule = new URL(import.meta.url).pathname.endsWith('.min.js'),
    resolveLocalModule = (specifier) => (isMinifiedModule ? specifier.replace(/\.js$/, '.min.js') : specifier),
    importLocalModule = (specifier) => import(/* @vite-ignore */ resolveLocalModule(specifier)),
    importDeferredLocalModule = (specifier, retry = 0) =>
        import(/* @vite-ignore */ `${resolveLocalModule(specifier)}${retry ? `?acl-retry=${retry}` : ''}`),
    [{ auditAccessibility }, { restoreOverlayFocus, trapOverlayFocus }, { ACLLoadError }] = await Promise.all([
        importLocalModule('./a11y.js'),
        importLocalModule('./runtime/overlay-utils.js'),
        importLocalModule('./acl-load-error.js'),
    ]);

// Define scanner defaults and focusable controls once
const DEFAULT_CONCURRENCY = 4,
    DEFAULT_BUTTON_POSITION = {
        bottom: 20,
        right: 20,
        gap: 8,
        companionSelector: null,
    },
    mountedScanners = new WeakMap();

const now = () => {
    // Run the now operation
    return globalThis.performance?.now?.() ?? Date.now();
};

// Convert an audit failure into readable scanner output
const errorMessage = (error) => (error instanceof Error ? error.message : String(error || 'Unknown audit error.'));

// Discover ACL hosts in light DOM and every reachable open shadow root without retaining duplicates
const collectActiveComponents = (root) => {
    const components = [],
        seen = new Set(),
        add = (element) => {
            // Add
            if (
                element?.isConnected &&
                element.matches?.('[data-acl-component]') &&
                !element.closest?.('[data-acl-a11y-scanner-ui]') &&
                !seen.has(element)
            ) {
                seen.add(element);
                components.push(element);
            }
        },
        visit = (currentRoot) => {
            // Visit
            if (!currentRoot?.querySelectorAll) return;
            if (currentRoot.nodeType === 1) add(currentRoot);
            // Process each element
            for (const element of currentRoot.querySelectorAll('*')) {
                add(element);
                if (element.shadowRoot) visit(element.shadowRoot);
            }
        };
    visit(root);
    return components;
};

// Keep scanner results connected to debugger and application listeners
const dispatchResult = (element, result) =>
    element.dispatchEvent(
        new CustomEvent('acl:a11y', {
            bubbles: true,
            composed: true,
            detail: {
                tag: element.localName,
                ...result,
            },
        }),
    );

// Audit a stable component snapshot with bounded async custom-auditor concurrency
const scanComponents = async (root, { auditor, concurrency }) => {
    const startedAt = now(),
        elements = collectActiveComponents(root),
        components = new Array(elements.length);
    let cursor = 0;
    const worker = async () => {
            // Run the worker operation
            while (cursor < elements.length) {
                const index = cursor++,
                    element = elements[index];
                if (!element.isConnected) {
                    components[index] = {
                        element,
                        tag: element.localName,
                        violations: [],
                        duration: 0,
                        error: 'Component disconnected before it could be audited.',
                    };
                    continue;
                }
                // Guard the worker operation against runtime failures
                try {
                    const result = await auditAccessibility(element.shadowRoot || element, { auditor });
                    components[index] = {
                        element,
                        tag: element.localName,
                        ...result,
                        error: null,
                    };
                    dispatchResult(element, result);
                } catch (error) {
                    components[index] = {
                        element,
                        tag: element.localName,
                        violations: [],
                        duration: 0,
                        error: errorMessage(error),
                    };
                }
            }
        },
        workerCount = Math.min(elements.length, concurrency);
    await Promise.all(Array.from({ length: workerCount }, worker));
    return {
        scannedAt: new Date().toISOString(),
        duration: now() - startedAt,
        componentCount: components.length,
        violationCount: components.reduce(
            // Accumulate the current item
            (total, item) => total + item.violations.length,
            0,
        ),
        errorCount: components.reduce(
            // Accumulate the current item
            (total, item) => total + Number(Boolean(item.error)),
            0,
        ),
        components,
    };
};

// Mount one scanner controller per document
export const mountAccessibilityScanner = (options = {}) => {
    if (typeof document === 'undefined' || typeof window === 'undefined')
        throw new TypeError('[ACL A11y Scanner] Mounting requires browser DOM APIs.');
    if (!options || typeof options !== 'object' || Array.isArray(options))
        throw new TypeError('[ACL A11y Scanner] mount() expects an options object.');

    const root = options.root || document,
        documentRef = root.nodeType === 9 ? root : root.ownerDocument;
    if (!documentRef || typeof root.querySelectorAll !== 'function')
        throw new TypeError('[ACL A11y Scanner] root must be a Document, Element, or open ShadowRoot.');
    if (mountedScanners.has(documentRef))
        throw new Error('[ACL A11y Scanner] A scanner is already mounted in this document.');

    const requestedConcurrency = Number(options.concurrency ?? DEFAULT_CONCURRENCY);
    if (!Number.isFinite(requestedConcurrency) || requestedConcurrency < 1)
        throw new TypeError('[ACL A11y Scanner] concurrency must be a positive finite number.');
    if (options.auditor != null && typeof options.auditor !== 'function')
        throw new TypeError('[ACL A11y Scanner] auditor must be a function or null.');
    if (options.button != null && (typeof options.button !== 'object' || Array.isArray(options.button)))
        throw new TypeError('[ACL A11y Scanner] button must be an options object.');

    const view = documentRef.defaultView || window,
        concurrency = Math.max(1, Math.floor(requestedConcurrency)),
        buttonOptions = {
            ...DEFAULT_BUTTON_POSITION,
            ...(options.button || {}),
        };
    let nodes = null,
        dialogModule = null,
        destroyed = false,
        open = false,
        previousFocus = null,
        previousBodyOverflow = '',
        latestResult = null,
        scanPromise = null,
        mountPromise = null,
        dialogImportAttempt = 0,
        resolveDomReady;
    const domReady = documentRef.body
        ? Promise.resolve()
        : new Promise((resolve) => {
              // Release deferred operations once the document can host the scanner UI
              resolveDomReady = resolve;
          });

    const assertActive = () => {
            // Reject operations after scanner cleanup
            if (destroyed) throw new Error('[ACL A11y Scanner] This scanner has been destroyed.');
        },
        positionToggle = () => {
            // Align the scanner toggle with its configured companion
            if (!nodes) return;
            nodes.toggle.style.width = '';
            nodes.toggle.style.height = '';
            nodes.toggle.style.bottom = `${Number(buttonOptions.bottom) || 0}px`;
            nodes.toggle.style.right = `${Number(buttonOptions.right) || 0}px`;
            if (!buttonOptions.companionSelector) return;
            let companion = null;
            // Guard the position toggle operation against runtime failures
            try {
                companion = documentRef.querySelector(buttonOptions.companionSelector);
            } catch {
                return;
            }
            if (!companion || companion === nodes.toggle) return;
            const rect = companion.getBoundingClientRect(),
                gap = Number(buttonOptions.gap) || 0,
                viewportWidth = documentRef.documentElement?.clientWidth || view.innerWidth,
                viewportHeight = documentRef.documentElement?.clientHeight || view.innerHeight;
            if (rect.width > 0 && rect.height > 0) {
                nodes.toggle.style.width = `${rect.width}px`;
                nodes.toggle.style.height = `${rect.height}px`;
            }
            nodes.toggle.style.right = `${Math.max(0, viewportWidth - rect.left + gap)}px`;
            nodes.toggle.style.bottom = `${Math.max(0, viewportHeight - rect.bottom)}px`;
        },
        closeDialog = () => {
            // Close the scanner dialog and restore page state
            if (!nodes || !open) return;
            open = false;
            nodes.modal.hidden = true;
            documentRef.body.style.overflow = previousBodyOverflow;
            restoreOverlayFocus(previousFocus);
            previousFocus = null;
        },
        scan = async () => {
            // Run one accessibility scan and render its result
            assertActive();
            await mountUi();
            assertActive();
            if (scanPromise) return scanPromise;
            dialogModule.renderScannerLoading(documentRef, nodes);
            nodes.rescan.disabled = true;
            scanPromise = scanComponents(root, {
                auditor: options.auditor || null,
                concurrency,
            })
                .then((result) => {
                    // Handle the resolved operation
                    latestResult = result;
                    if (!destroyed) dialogModule.renderScannerResult(documentRef, nodes, result);
                    return result;
                })
                .finally(() => {
                    // Finalize the asynchronous operation
                    if (!destroyed) nodes.rescan.disabled = false;
                    scanPromise = null;
                });
            return scanPromise;
        },
        openDialog = async (focusTarget = documentRef.activeElement) => {
            // Open the scanner dialog and focus its first control
            assertActive();
            await mountUi();
            assertActive();
            if (!open) {
                open = true;
                previousFocus = focusTarget;
                previousBodyOverflow = documentRef.body.style.overflow;
                documentRef.body.style.overflow = 'hidden';
                nodes.modal.hidden = false;
                nodes.headerClose.focus();
            }
            return await scan();
        },
        onKeyDown = (event) => {
            // Handle escape and focus trapping while the dialog is open
            if (!open) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                closeDialog();
                return;
            }
            trapOverlayFocus(event, nodes.dialog, documentRef);
        },
        onBackdropClick = (event) => {
            // Close the dialog when its backdrop is selected
            if (event.target === nodes.modal) closeDialog();
        },
        onFocusIn = (event) => {
            // Restore focus when it leaves the open dialog
            if (open && !nodes.dialog.contains(event.target)) nodes.headerClose.focus();
        },
        onToggleClick = () => {
            // Open the dialog from its floating toggle
            void openDialog(nodes.toggle).catch(() => {});
        },
        onRescanClick = () => {
            // Start a fresh scan from the dialog action
            void scan().catch(() => {});
        },
        mountUi = () => {
            // Share one deferred mount and evict failures so a later explicit operation can retry
            if (nodes) return Promise.resolve(nodes);
            if (mountPromise) return mountPromise;
            const attempt = dialogImportAttempt++,
                mounting = domReady
                    .then(async () => {
                        // Load and mount the deferred scanner interface
                        if (destroyed) return null;
                        // Guard the optional module boundary while leaving UI construction errors intact
                        try {
                            dialogModule = await importDeferredLocalModule('./runtime/a11y-scanner-dialog.js', attempt);
                        } catch (error) {
                            if (destroyed) return null;
                            if (error instanceof ACLLoadError && error.code === 'ACL_RUNTIME_MODULE_LOAD_FAILED')
                                throw error;
                            throw new ACLLoadError('Unable to load the accessibility scanner dialog.', {
                                code: 'ACL_RUNTIME_MODULE_LOAD_FAILED',
                                phase: 'runtime-import',
                                cause: error,
                                retryable: true,
                            });
                        }
                        if (destroyed) return null;
                        nodes = dialogModule.createScannerUi(documentRef);
                        positionToggle();
                        nodes.toggle.addEventListener('click', onToggleClick);
                        nodes.rescan.addEventListener('click', onRescanClick);
                        nodes.headerClose.addEventListener('click', closeDialog);
                        nodes.footerClose.addEventListener('click', closeDialog);
                        nodes.modal.addEventListener('click', onBackdropClick);
                        documentRef.addEventListener('keydown', onKeyDown);
                        documentRef.addEventListener('focusin', onFocusIn);
                        view.addEventListener('resize', positionToggle, { passive: true });
                        return nodes;
                    })
                    .finally(() => {
                        // Retain mounted nodes, but never retain a failed or obsolete transaction
                        if (mountPromise === mounting) mountPromise = null;
                    });
            mountPromise = mounting;
            return mounting;
        },
        beginMount = () => {
            // Background mounting has no direct caller, so consume its reported failure
            void mountUi().catch(() => {});
        },
        onDomReady = () => {
            // Mount the interface once the document body is ready
            resolveDomReady?.();
            beginMount();
        };
    if (documentRef.body) beginMount();
    else documentRef.addEventListener('DOMContentLoaded', onDomReady, { once: true });

    const controller = {
        scan,
        open: openDialog,
        close: closeDialog,
        // Get result
        getResult: () => latestResult,
        destroy() {
            // Destroy the scanner and release every mounted resource
            if (destroyed) return;
            closeDialog();
            destroyed = true;
            documentRef.removeEventListener('DOMContentLoaded', onDomReady);
            documentRef.removeEventListener('keydown', onKeyDown);
            documentRef.removeEventListener('focusin', onFocusIn);
            view.removeEventListener('resize', positionToggle);
            if (nodes) {
                nodes.toggle.removeEventListener('click', onToggleClick);
                nodes.rescan.removeEventListener('click', onRescanClick);
                nodes.headerClose.removeEventListener('click', closeDialog);
                nodes.footerClose.removeEventListener('click', closeDialog);
                nodes.modal.removeEventListener('click', onBackdropClick);
                nodes.style.remove();
                nodes.toggle.remove();
                nodes.modal.remove();
            } else {
                resolveDomReady?.();
            }
            nodes = null;
            mountedScanners.delete(documentRef);
        },
    };
    mountedScanners.set(documentRef, controller);
    return controller;
};

const ACLA11yScanner = { mount: mountAccessibilityScanner };

export default ACLA11yScanner;
