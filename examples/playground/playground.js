import DEFAULT_SOURCES from './sample-sources.js';
import AlpineComponentLoader from 'alpine-component-loader';
import { mountAccessibilityScanner } from 'alpine-component-loader/a11y-scanner';

const STORAGE_KEY = 'acl-playground:v5',
    MESSAGE_SOURCE = 'acl-playground',
    AUTO_RUN_DELAY = 600,
    MAX_LOGS = 50,
    sourceKeys = Object.keys(DEFAULT_SOURCES),
    Alpine = globalThis.Alpine;

if (!Alpine) throw new Error('The bundled Alpine runtime could not load.');

const workbenchState = {
    activeEditor: 'page',
    autoRun: true,
    consoleText: 'No console messages.',
    diagnosticsOpen: false,
    metricsText: 'Metrics become available after the first run.',
    runLabel: 'Update 0',
    status: {
        message: 'Preparing preview…',
        state: 'pending',
    },
    audit: {
        state: 'idle',
        message: 'Not audited yet.',
        running: false,
        workbench: null,
        preview: null,
        workbenchStale: false,
        previewStale: false,
        // Format one scanner scope for the compact ACL summary card
        summary(scope) {
            const result = this[scope];
            if (!result) return 'Not audited';
            if (result.error) return 'Unavailable';
            const stale = this[`${scope}Stale`] ? ' · stale' : '';
            return `${result.componentCount} components · ${result.violationCount} findings${stale}`;
        },
        // Aggregate both document-scoped scanner summaries without retaining findings
        combinedSummary() {
            const available = [this.workbench, this.preview].filter(
                // Retain only scopes that completed successfully
                (result) => result && !result.error,
            );
            if (!available.length) return 'Not audited';
            const components = available.reduce(
                    // Sum audited ACL hosts across both documents
                    (total, result) => total + result.componentCount,
                    0,
                ),
                violations = available.reduce(
                    // Sum normalized findings across both documents
                    (total, result) => total + result.violationCount,
                    0,
                ),
                errors = available.reduce(
                    // Sum isolated per-component scanner errors
                    (total, result) => total + result.errorCount,
                    0,
                ),
                stale = this.workbenchStale || this.previewStale ? ' · stale' : '';
            return `${components} components · ${violations} findings · ${errors} errors${stale}`;
        },
    },
};

Alpine.store('playground', workbenchState);
const playgroundStore = Alpine.store('playground');
await AlpineComponentLoader.start();

// Wait for nested ACL workbench components to finish exposing the coordinator's DOM anchors
const waitForWorkbench = () =>
    new Promise((resolve, reject) => {
        const selectors = [
                '#preview',
                '#workbench',
                '#workbench-splitter',
                ...sourceKeys.map(
                    // Require every source editor rendered by the nested editor component
                    (key) => `#editor-${key}`,
                ),
            ],
            ready = () =>
                selectors.every(
                    // Check one coordinator anchor
                    (selector) => document.querySelector(selector),
                ),
            observer = new MutationObserver(() => {
                // Resolve as soon as every nested component has rendered
                if (!ready()) return;
                clearTimeout(timeout);
                observer.disconnect();
                resolve();
            }),
            timeout = setTimeout(() => {
                // Fail explicitly instead of starting a partially connected coordinator
                observer.disconnect();
                reject(new Error('The ACL workbench did not finish rendering.'));
            }, 5000);
        if (ready()) {
            clearTimeout(timeout);
            resolve();
            return;
        }
        observer.observe(document.documentElement, {
            childList: true,
            subtree: true,
        });
    });

await waitForWorkbench();

const workbenchScanner = mountAccessibilityScanner({
        root: document,
        concurrency: 4,
        button: {
            bottom: 20,
            right: 20,
        },
    }),
    preview = document.querySelector('#preview'),
    splitter = document.querySelector('#workbench-splitter'),
    workbench = document.querySelector('#workbench'),
    editors = Object.fromEntries(
        sourceKeys.map(
            // Map every editable source to its textarea
            (key) => [key, document.querySelector(`[data-editor="${key}"]`)],
        ),
    ),
    runtimeUrl = new URL('../../dist/index.min.js', location.href).href,
    devRuntimeUrl = new URL('../../dist/dev.min.js', location.href).href,
    a11yScannerUrl = new URL('../../dist/a11y-scanner.min.js', location.href).href,
    alpineUrl = 'https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js';

let runSequence = 0,
    activeRun = 0,
    activeEditorKey = 'page',
    autoRunTimer = null,
    previewReady = false,
    appliedSources = null,
    pendingSources = new Set(),
    executionQueue = Promise.resolve(),
    auditPromise = null,
    logs = [];

// Return a fresh source object so defaults are never mutated by editor state
const cloneDefaultSources = () => Object.fromEntries(sourceKeys.map((key) => [key, DEFAULT_SOURCES[key]]));

// Read a versioned local draft without allowing malformed values to replace defaults
const readSavedState = () => {
    // Guard browser storage because privacy settings can disable it
    try {
        const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (!parsed || typeof parsed !== 'object') return null;
        const savedSources = Object.fromEntries(
            sourceKeys.map(
                // Normalize one persisted source field
                (key) => [key, typeof parsed.sources?.[key] === 'string' ? parsed.sources[key] : null],
            ),
        );
        if (Object.values(savedSources).some((value) => value == null)) return null;
        return {
            autoRun: parsed.autoRun !== false,
            sources: savedSources,
        };
    } catch {
        return null;
    }
};

// Persist only authored source and the local auto-run preference
const saveState = () => {
    // Guard browser storage because the preview remains usable without persistence
    try {
        localStorage.setItem(
            STORAGE_KEY,
            JSON.stringify({
                autoRun: playgroundStore.autoRun,
                sources: Object.fromEntries(sourceKeys.map((key) => [key, editors[key].value])),
            }),
        );
    } catch {
        // Ignore unavailable browser storage
    }
};

// Keep lightweight source counts visible without parsing or evaluating editor content
const updateEditorCount = (key) => {
    const value = editors[key].value,
        lines = value ? value.split('\n').length : 0;
    document.querySelector(`[data-editor-count="${key}"]`).textContent =
        `${lines} ${lines === 1 ? 'line' : 'lines'} · ${value.length.toLocaleString()} characters`;
};

// Switch the accessible tab and its corresponding source panel
const activateEditor = (key) => {
    activeEditorKey = key;
    playgroundStore.activeEditor = key;
};

// Render the bounded console stream for the active preview run
const renderLogs = () => {
    playgroundStore.consoleText = logs.length
        ? logs.map((entry) => `[${entry.level}] ${entry.message}`).join('\n')
        : 'No console messages.';
};

// Publish the current run state through one stable status element
const showStatus = (state, message) => {
    playgroundStore.status = {
        message,
        state,
    };
};

// Wait for one DOM event and remove the listener after it settles
const once = (target, name) =>
    new Promise((resolve) => {
        target.addEventListener(name, resolve, { once: true });
    });

// Load Alpine into the fresh preview realm before evaluating the user module
const loadAlpine = (documentRoot) =>
    new Promise((resolve, reject) => {
        const script = documentRoot.createElement('script');
        script.src = alpineUrl;
        script.addEventListener('load', resolve, { once: true });
        script.addEventListener('error', () => reject(new Error('The bundled Alpine runtime could not load.')), {
            once: true,
        });
        documentRoot.head.append(script);
    });

// Build one persistent preview runner that accepts incremental source updates
const createRunnerSource = () => `
const SOURCE = ${JSON.stringify(MESSAGE_SOURCE)};
let currentRunId = 0;
let activeHotContext = null;
let accessibilityScanner = null;
let scannerModulePromise = null;
const toMessagePayload = value => {
  try {
    return structuredClone(value);
  } catch {
    const seen = new WeakSet();
    return JSON.parse(JSON.stringify(value, (_key, item) => {
      if (typeof item === 'function') return '[Function]';
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
      return item;
    }));
  }
};
const send = (type, payload, runId = currentRunId) =>
  parent.postMessage({ source: SOURCE, runId, type, payload: toMessagePayload(payload) }, '*');
const toErrorText = value => {
  const message = String(value?.message || value || 'Unknown preview error');
  const stack = typeof value?.stack === 'string' ? value.stack : '';
  return stack.includes(message) ? stack : [message, stack].filter(Boolean).join('\\n');
};
const toText = value => {
  if (value instanceof Error) return toErrorText(value);
  if (typeof value === 'string') return value;
  try {
    const seen = new WeakSet();
    return JSON.stringify(value, (_key, item) => {
      if (!item || typeof item !== 'object') return item;
      if (seen.has(item)) return '[Circular]';
      seen.add(item);
      return item;
    });
  } catch {
    return String(value);
  }
};
for (const level of ['log', 'info', 'warn', 'error']) {
  const original = console[level].bind(console);
  console[level] = (...values) => {
    send('console', { level, message: values.map(toText).join(' ').slice(0, 4000) });
    original(...values);
  };
}
addEventListener('error', event => send('error', {
  message: toErrorText(event.error || event.message)
}));
addEventListener('unhandledrejection', event => send('error', {
  message: toErrorText(event.reason)
}));

const disposeHotContext = async context => {
  if (!context) return;
  context.controller.abort();
  for (const callback of [...context.callbacks].reverse()) {
    try {
      await callback();
    } catch (error) {
      console.error('[Playground HMR] Dispose callback failed.', error);
    }
  }
};

globalThis.__aclPlaygroundReady = (async () => {
  const packageModule = await import(${JSON.stringify(runtimeUrl)});
  const devModule = await import(${JSON.stringify(devRuntimeUrl)});
  globalThis.AlpineComponentLoader = packageModule.default;
  globalThis.createLoader = packageModule.createLoader;
  const loader = globalThis.playgroundLoader || globalThis.AlpineComponentLoader;

  const summarizeAccessibility = result => ({
    scannedAt: result.scannedAt,
    duration: result.duration,
    componentCount: result.componentCount,
    violationCount: result.violationCount,
    errorCount: result.errorCount
  });

  const ensureAccessibilityScanner = async () => {
    if (accessibilityScanner) return accessibilityScanner;
    scannerModulePromise ||= import(${JSON.stringify(a11yScannerUrl)});
    const scannerModule = await scannerModulePromise;
    accessibilityScanner = scannerModule.mountAccessibilityScanner({
      root: document,
      concurrency: 4,
      button: {
        bottom: 16,
        right: 16
      }
    });
    return accessibilityScanner;
  };

  const findInlineDefinition = update => {
    const templates = [...document.querySelectorAll('template')].filter(template =>
      update.kind === 'component'
        ? template.getAttribute('acl-component') === update.name
        : template.id === update.name
    );
    if (templates.length !== 1)
      throw new Error('Inline template "' + update.name + '" is not uniquely available in the preview.');
    const template = templates[0];
    const definitions = loader.getRegisteredTags()
      .map(tagName => loader.getDefinition(tagName))
      .filter(definition =>
        update.kind === 'component'
          ? definition?.tagName === update.name && definition.source === template
          : definition?.source === template || definition?.source === '#' + update.name
      );
    if (!definitions.length)
      throw new Error('Inline template "' + update.name + '" is not an active ACL definition.');
    return { definitions, template };
  };

  const executeJavaScript = async (runId, source) => {
    currentRunId = runId;
    await disposeHotContext(activeHotContext);
    const context = {
      callbacks: [],
      controller: new AbortController()
    };
    activeHotContext = context;
    globalThis.playgroundHot = Object.freeze({
      signal: context.controller.signal,
      dispose(callback) {
        if (typeof callback !== 'function')
          throw new TypeError('playgroundHot.dispose() expects a function.');
        context.callbacks.push(callback);
      }
    });
    const moduleSource =
      'const Alpine = globalThis.Alpine;\\n' +
      'const AlpineComponentLoader = globalThis.AlpineComponentLoader;\\n' +
      'const createLoader = globalThis.createLoader;\\n' +
      'const playgroundHot = globalThis.playgroundHot;\\n' +
      'await (async () => {\\n' + source + '\\n})();';
    const moduleUrl = URL.createObjectURL(new Blob([moduleSource], { type: 'text/javascript' }));
    try {
      await import(moduleUrl);
      await ensureAccessibilityScanner();
    } catch (error) {
      await disposeHotContext(context);
      if (activeHotContext === context) activeHotContext = null;
      throw error;
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
  };

  globalThis.__aclPlayground = Object.freeze({
    async updateComponents(runId, updates) {
      currentRunId = runId;
      const targets = updates.map(findInlineDefinition);
      targets.forEach(({ template }, index) => {
        template.innerHTML = updates[index].html;
      });
      const sources = [...new Set(targets.flatMap(({ definitions }) =>
        definitions.map(definition => definition.source)
      ))];
      return devModule.reloadChangedTemplates(sources, loader);
    },
    updateCSS(runId, source) {
      currentRunId = runId;
      document.querySelector('[data-playground-css]').textContent = source;
    },
    async scanAccessibility(runId, open = false) {
      currentRunId = runId;
      const scanner = await ensureAccessibilityScanner();
      const result = open ? await scanner.open() : await scanner.scan();
      const summary = summarizeAccessibility(result);
      send('a11y', summary, runId);
      return summary;
    },
    executeJavaScript,
    complete(runId, mode, updatedSources, duration) {
      currentRunId = runId;
      send('metrics', {
        version: loader.version,
        registeredTags: loader.getRegisteredTags(),
        metrics: loader.getMetrics(),
        update: { mode, sources: updatedSources }
      });
      send('ready', {
        duration,
        mode,
        updatedSources
      });
    },
    reportError(runId, error) {
      currentRunId = runId;
      send('error', { message: toErrorText(error) });
    }
  });

  addEventListener('pagehide', () => {
    void disposeHotContext(activeHotContext);
    accessibilityScanner?.destroy();
    loader.dispose();
  }, { once: true });
})();
`;

// Parse component editor text without evaluating authored content
const parseComponentTemplates = (source) => {
    const container = document.createElement('div');
    container.innerHTML = source;
    const entries = new Map();
    // Inspect every authored top-level node
    for (const node of container.childNodes) {
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
        if (!(node instanceof HTMLTemplateElement))
            throw new Error('Components may contain only identified <template> elements.');
        const componentName = node.getAttribute('acl-component')?.trim(),
            templateId = node.id.trim(),
            kind = componentName ? 'component' : templateId ? 'id' : null,
            name = componentName || templateId,
            key = kind ? `${kind}:${name}` : null;
        if (!key) throw new Error('Every component template needs acl-component or id.');
        if (entries.has(key)) throw new Error(`Duplicate component template identity: ${name}.`);
        const attributes = [...node.attributes]
            .map(
                // Normalize one root attribute
                (attribute) => [attribute.name, attribute.value],
            )
            .sort(
                // Keep semantic attribute comparison independent of authoring order
                ([left], [right]) => left.localeCompare(right),
            );
        entries.set(key, {
            attributes: JSON.stringify(attributes),
            html: node.innerHTML,
            kind,
            name,
        });
    }
    if (!entries.size) throw new Error('Components must contain at least one template.');
    return entries;
};

// Require stable identities and contracts before preparing content-only patches
const createComponentUpdates = (previousSource, nextSource) => {
    const previous = parseComponentTemplates(previousSource),
        next = parseComponentTemplates(nextSource);
    if (previous.size !== next.size || [...previous.keys()].some((key) => !next.has(key)))
        throw new Error('Template additions, removals, and identity changes require a Page HTML run.');
    return [...next].flatMap(([key, entry]) => {
        const prior = previous.get(key);
        if (prior.attributes !== entry.attributes)
            throw new Error(`Template contract changes for "${entry.name}" require a Page HTML run.`);
        return prior.html === entry.html
            ? []
            : [
                  {
                      html: entry.html,
                      kind: entry.kind,
                      name: entry.name,
                  },
              ];
    });
};

// Snapshot all editors immediately before an update
const snapshotSources = () =>
    Object.fromEntries(
        sourceKeys.map(
            // Read one editor value
            (key) => [key, editors[key].value],
        ),
    );

// Install a fresh document for the initial preview, reset, or Page HTML execution
const bootPreview = async (runId, sources, startedAt) => {
    previewReady = false;
    preview.srcdoc =
        '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ACL preview</title></head><body></body></html>';
    await once(preview, 'load');
    if (runId !== activeRun) return;

    const previewDocument = preview.contentDocument,
        previewStyle = previewDocument.createElement('style');
    previewStyle.dataset.playgroundCss = '';
    previewStyle.textContent = sources.css;
    previewDocument.head.append(previewStyle);
    previewDocument.body.innerHTML = `${sources.page}\n${sources.components}`;
    await loadAlpine(previewDocument);
    if (runId !== activeRun) return;

    const runnerUrl = URL.createObjectURL(new Blob([createRunnerSource()], { type: 'text/javascript' })),
        runnerScript = previewDocument.createElement('script');
    runnerScript.type = 'module';
    runnerScript.src = runnerUrl;
    const loaded = Promise.race([
        once(runnerScript, 'load'),
        once(runnerScript, 'error').then(
            // Convert script loading failure into the shared update path
            () => {
                throw new Error('The persistent preview runner could not load.');
            },
        ),
    ]);
    previewDocument.body.append(runnerScript);
    // Release the temporary bootstrap URL after its module settles
    try {
        await loaded;
        await preview.contentWindow.__aclPlaygroundReady;
    } finally {
        URL.revokeObjectURL(runnerUrl);
    }
    if (runId !== activeRun) return;

    appliedSources = {
        ...sources,
        javascript: appliedSources?.javascript || '',
    };
    ['page', 'components', 'css'].forEach((key) => pendingSources.delete(key));
    previewReady = true;
    // Preserve the stable preview even when authored JavaScript fails
    try {
        await preview.contentWindow.__aclPlayground.executeJavaScript(runId, sources.javascript);
    } catch (error) {
        pendingSources.add('javascript');
        throw error;
    }
    appliedSources.javascript = sources.javascript;
    pendingSources.clear();
    preview.contentWindow.__aclPlayground.complete(runId, 'full', sourceKeys, performance.now() - startedAt);
};

// Apply dirty sources inside the active realm, with Page HTML taking precedence
const applyIncrementalUpdate = async (runId, sources, keys, startedAt) => {
    const runner = preview.contentWindow.__aclPlayground,
        updatedSources = sourceKeys.filter(
            // Retain the canonical editor order in metrics
            (key) => keys.has(key),
        );
    if (keys.has('components')) {
        const updates = createComponentUpdates(appliedSources.components, sources.components);
        await runner.updateComponents(runId, updates);
        appliedSources.components = sources.components;
        pendingSources.delete('components');
    }
    if (keys.has('css')) {
        runner.updateCSS(runId, sources.css);
        appliedSources.css = sources.css;
        pendingSources.delete('css');
    }
    if (keys.has('javascript')) {
        await runner.executeJavaScript(runId, sources.javascript);
        appliedSources.javascript = sources.javascript;
        pendingSources.delete('javascript');
    }
    runner.complete(runId, 'hmr', updatedSources, performance.now() - startedAt);
};

// Serialize preview work so rapid edits cannot apply out of order
const performPreviewRun = async (forcedKey = null, forceFull = false) => {
    clearTimeout(autoRunTimer);
    const runId = ++runSequence,
        sources = snapshotSources(),
        keys = new Set(pendingSources),
        startedAt = performance.now();
    if (forcedKey) keys.add(forcedKey);
    if (!previewReady) keys.add('page');
    activeRun = runId;
    logs = [];
    renderLogs();
    playgroundStore.metricsText = 'Collecting runtime metrics…';
    playgroundStore.runLabel = `Update ${runId}`;
    showStatus('running', `${keys.has('page') || forceFull ? 'Rendering' : 'Updating'} preview ${runId}…`);
    // Route full and incremental work through one visible error boundary
    try {
        if (forceFull || keys.has('page')) await bootPreview(runId, sources, startedAt);
        else await applyIncrementalUpdate(runId, sources, keys, startedAt);
    } catch (error) {
        if (keys.has('javascript')) pendingSources.add('javascript');
        const runner = previewReady ? preview.contentWindow.__aclPlayground : null;
        if (runner) runner.reportError(runId, error);
        else {
            showStatus('error', `Update ${runId} failed.`);
            logs.push({
                level: 'error',
                message: String(error?.stack || error?.message || error).slice(0, 4000),
            });
            renderLogs();
        }
    }
};

// Enqueue one explicit or automatic preview update
const runPreview = ({ forcedKey = null, forceFull = false } = {}) => {
    executionQueue = executionQueue.then(
        // Keep every requested edit in authoring order
        () => performPreviewRun(forcedKey, forceFull),
    );
    return executionQueue;
};

// Debounce edits while retaining explicit source-specific execution
const schedulePreview = () => {
    clearTimeout(autoRunTimer);
    if (!playgroundStore.autoRun) return;
    autoRunTimer = setTimeout(
        // Apply the settled dirty sources
        () => void runPreview(),
        AUTO_RUN_DELAY,
    );
};

// Apply one complete source set to the editor surface
const applySources = (sources) => {
    sourceKeys.forEach((key) => {
        editors[key].value = sources[key];
        updateEditorCount(key);
    });
};

const savedState = readSavedState();
applySources(savedState?.sources || cloneDefaultSources());
playgroundStore.autoRun = savedState?.autoRun !== false;

document.querySelectorAll('[data-editor-tab]').forEach((tab) => {
    // Retain native tab-list key navigation around Alpine-owned selection state
    tab.addEventListener('keydown', (event) => {
        // Support the standard horizontal tab-list keys
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const tabs = [...document.querySelectorAll('[data-editor-tab]')],
            current = tabs.indexOf(tab),
            next =
                event.key === 'Home'
                    ? 0
                    : event.key === 'End'
                      ? tabs.length - 1
                      : (current + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
        activateEditor(tabs[next].dataset.editorTab);
        tabs[next].focus({
            preventScroll: true,
        });
    });
});

sourceKeys.forEach((key) => {
    // Bind one source editor to persistence and execution controls
    editors[key].addEventListener('input', () => {
        // Save and schedule the latest authored source
        pendingSources.add(key);
        updateEditorCount(key);
        saveState();
        schedulePreview();
    });
    editors[key].addEventListener('keydown', (event) => {
        // Insert two spaces without moving focus away from the editor
        if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            const start = editors[key].selectionStart,
                end = editors[key].selectionEnd;
            editors[key].setRangeText('  ', start, end, 'end');
            editors[key].dispatchEvent(new Event('input', { bubbles: true }));
        }
    });
});

document.addEventListener('keydown', (event) => {
    // Run the preview from the shared keyboard shortcut
    if (event.key !== 'Enter' || (!event.ctrlKey && !event.metaKey)) return;
    event.preventDefault();
    void runPreview({ forcedKey: activeEditorKey });
});

document.addEventListener('playground:editor', (event) => {
    // Apply an ACL-composed editor selection while retaining focus on its tab
    const key = String(event.detail?.key || '');
    if (sourceKeys.includes(key)) activateEditor(key);
});

document.addEventListener('playground:run', () => {
    // Execute the active source from the ACL workbench control
    void runPreview({ forcedKey: activeEditorKey });
});

document.addEventListener('playground:auto-run', () => {
    // Persist and apply the auto-run preference
    saveState();
    if (playgroundStore.autoRun) schedulePreview();
    else clearTimeout(autoRunTimer);
});

document.addEventListener('playground:reset', () => {
    // Confirm before replacing every locally authored source
    if (!confirm('Reset all four editors to the Northstar dashboard sample?')) return;
    applySources(cloneDefaultSources());
    playgroundStore.autoRun = true;
    saveState();
    activateEditor('page');
    pendingSources.clear();
    void runPreview({
        forcedKey: 'page',
        forceFull: true,
    });
});

document.addEventListener('playground:clear-console', () => {
    // Clear only the parent-side bounded log view
    logs = [];
    renderLogs();
});

// Strip scanner-owned element references before retaining or crossing document boundaries
const summarizeAccessibility = (result) => ({
    componentCount: Number(result?.componentCount || 0),
    duration: Number(result?.duration || 0),
    errorCount: Number(result?.errorCount || 0),
    scannedAt: String(result?.scannedAt || new Date().toISOString()),
    violationCount: Number(result?.violationCount || 0),
});

// Keep a failed audit scope visible without discarding a successful sibling result
const failedAccessibilitySummary = (error) => ({
    componentCount: 0,
    duration: 0,
    error: String(error?.message || error || 'Unknown accessibility scanner error.'),
    errorCount: 1,
    scannedAt: new Date().toISOString(),
    violationCount: 0,
});

// Mark the preview half of an earlier combined result as outdated after any successful render
const markPreviewAuditStale = () => {
    if (!playgroundStore.audit.preview) return;
    playgroundStore.audit.previewStale = true;
    playgroundStore.audit.state = 'stale';
    playgroundStore.audit.message = 'Preview changed · run the audit again.';
};

// Run both document-scoped scanners as one deduplicated workbench operation
const runAccessibilityAudit = () => {
    if (auditPromise) return auditPromise;
    const auditRun = activeRun,
        runner = previewReady ? preview.contentWindow.__aclPlayground : null;
    playgroundStore.audit.running = true;
    playgroundStore.audit.state = 'running';
    playgroundStore.audit.message = 'Auditing workbench and preview…';
    auditPromise = Promise.all([
        workbenchScanner.scan().then(summarizeAccessibility).catch(failedAccessibilitySummary),
        runner
            ? runner.scanAccessibility(auditRun).then(summarizeAccessibility).catch(failedAccessibilitySummary)
            : Promise.resolve(failedAccessibilitySummary('Preview is not ready.')),
    ])
        .then(([workbenchResult, previewResult]) => {
            // Publish both scopes together so the summary never mixes revisions
            playgroundStore.audit.workbench = workbenchResult;
            playgroundStore.audit.preview = previewResult;
            playgroundStore.audit.workbenchStale = false;
            playgroundStore.audit.previewStale = activeRun !== auditRun;
            const failedScopes = Number(Boolean(workbenchResult.error)) + Number(Boolean(previewResult.error)),
                violations = workbenchResult.violationCount + previewResult.violationCount;
            playgroundStore.audit.state =
                failedScopes === 2 ? 'error' : failedScopes === 1 ? 'partial' : violations ? 'issues' : 'ready';
            playgroundStore.audit.message =
                failedScopes === 2
                    ? 'Accessibility audit failed in both documents.'
                    : failedScopes === 1
                      ? 'Audit complete with one unavailable scope.'
                      : `${violations} ${violations === 1 ? 'finding' : 'findings'} across both documents.`;
            return {
                preview: previewResult,
                workbench: workbenchResult,
            };
        })
        .finally(() => {
            // Re-enable the shared action after both scopes settle
            playgroundStore.audit.running = false;
            auditPromise = null;
        });
    return auditPromise;
};

document.addEventListener('playground:audit', () => {
    // Start the combined scanner from the ACL workbench action
    void runAccessibilityAudit();
});

document.addEventListener('playground:audit-open', (event) => {
    // Open one scanner's native detail dialog and refresh that scope's summary
    const scope = event.detail?.scope;
    if (scope === 'workbench') {
        void workbenchScanner.open().then(
            // Refresh the outer scope after its native scanner dialog opens
            (result) => {
                playgroundStore.audit.workbench = summarizeAccessibility(result);
                playgroundStore.audit.workbenchStale = false;
            },
        );
        return;
    }
    if (scope === 'preview' && previewReady) {
        const requestedRun = activeRun;
        void preview.contentWindow.__aclPlayground.scanAccessibility(requestedRun, true).then(
            // Accept the detailed preview result only while its iframe revision remains active
            (result) => {
                if (requestedRun !== activeRun) return;
                playgroundStore.audit.preview = summarizeAccessibility(result);
                playgroundStore.audit.previewStale = false;
            },
        );
    }
});

document.addEventListener('acl:dev-reload-end', () => {
    // Invalidate only the workbench scope after server-driven inline-template HMR
    if (!playgroundStore.audit.workbench) return;
    playgroundStore.audit.workbenchStale = true;
    playgroundStore.audit.state = 'stale';
    playgroundStore.audit.message = 'Workbench changed · run the audit again.';
});

window.addEventListener('message', (event) => {
    // Accept structured messages only from the active preview realm
    const message = event.data;
    if (
        event.source !== preview.contentWindow ||
        message?.source !== MESSAGE_SOURCE ||
        message.runId !== activeRun ||
        typeof message.type !== 'string'
    )
        return;
    if (message.type === 'console') {
        logs.push({
            level: String(message.payload?.level || 'log'),
            message: String(message.payload?.message || '').slice(0, 4000),
        });
        if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
        renderLogs();
        return;
    }
    if (message.type === 'metrics') {
        playgroundStore.metricsText = JSON.stringify(message.payload, null, 2);
        return;
    }
    if (message.type === 'a11y') {
        playgroundStore.audit.preview = summarizeAccessibility(message.payload);
        playgroundStore.audit.previewStale = false;
        return;
    }
    if (message.type === 'error') {
        showStatus('error', `Update ${activeRun} failed.`);
        logs.push({
            level: 'error',
            message: String(message.payload?.message || 'Unknown preview error').slice(0, 4000),
        });
        if (logs.length > MAX_LOGS) logs = logs.slice(-MAX_LOGS);
        renderLogs();
        return;
    }
    if (message.type === 'ready') {
        const duration = Number(message.payload?.duration || 0),
            mode = message.payload?.mode === 'hmr' ? 'HMR' : 'Full render';
        markPreviewAuditStale();
        showStatus('ready', `Ready · ${mode} · ${duration.toFixed(0)}ms`);
    }
});

// Keep the desktop split keyboard and pointer adjustable without affecting the mobile stack
const setEditorShare = (value) => {
    const share = Math.min(70, Math.max(35, Number(value) || 50));
    workbench.style.setProperty('--editor-share', `${share}%`);
    splitter.setAttribute('aria-valuenow', String(Math.round(share)));
};

splitter.addEventListener('keydown', (event) => {
    // Resize the desktop editor split with bounded keyboard steps
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const current = Number(splitter.getAttribute('aria-valuenow'));
    setEditorShare(
        event.key === 'Home' ? 35 : event.key === 'End' ? 70 : current + (event.key === 'ArrowRight' ? 2 : -2),
    );
});

splitter.addEventListener('pointerdown', (event) => {
    // Capture the active pointer until the resize gesture ends
    splitter.setPointerCapture(event.pointerId);
});
splitter.addEventListener('pointermove', (event) => {
    // Convert the pointer position into a bounded editor percentage
    if (!splitter.hasPointerCapture(event.pointerId)) return;
    const bounds = workbench.getBoundingClientRect();
    setEditorShare(((event.clientX - bounds.left) / bounds.width) * 100);
});
splitter.addEventListener('pointerup', (event) => {
    // Release the completed resize gesture
    if (splitter.hasPointerCapture(event.pointerId)) splitter.releasePointerCapture(event.pointerId);
});

window.addEventListener(
    'pagehide',
    () => {
        // Release the outer workbench's development tools and loader lifecycle
        workbenchScanner.destroy();
        AlpineComponentLoader.dispose();
    },
    { once: true },
);

void runPreview({
    forcedKey: 'page',
    forceFull: true,
});
