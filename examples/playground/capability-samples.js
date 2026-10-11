// Provide complete editable projects without changing the default dashboard or saved drafts
const base = {
    page: '<main><h1>Minimal ACL application</h1><sample-card></sample-card></main>',
    components: '<template id="sample-template"><p>Explicit component ready</p></template>',
    css: 'body { font: 16px/1.5 system-ui; padding: 1rem; }',
    javascript:
        "await AlpineComponentLoader.define('sample-card', '#sample-template');\nawait AlpineComponentLoader.start();",
};
export default {
    core: {
        entry: 'core',
        sources: base,
    },
    transformations: {
        entry: 'core',
        sources: {
            ...base,
            page: '<main><h1>Optional styles and slots</h1><sample-card><p>Projected consumer content</p></sample-card></main>',
            components:
                '<template id="sample-template"><style>p { color: rgb(37, 99, 235); }</style><slot><p>Fallback slot</p></slot></template>',
        },
    },
    scheduled: {
        entry: 'core',
        sources: {
            ...base,
            page: '<main><h1>Scheduled component group</h1><div id="group"></div></main>',
            javascript:
                "AlpineComponentLoader.config({ hydrationScheduler: { budgetMs: 8, maxTasksPerTurn: 4 } });\nawait AlpineComponentLoader.define('sample-card', '#sample-template');\nawait AlpineComponentLoader.start();\nconst ready = [];\nfor (let i = 0; i < 100; i++) {\n  const host = document.createElement('sample-card');\n  ready.push(new Promise(resolve => host.addEventListener('loaded', resolve, { once: true })));\n  document.querySelector('#group').append(host);\n}\nawait Promise.all(ready);\nconsole.info('100 components initialized');",
        },
    },
    isolated: {
        entry: 'default',
        sources: {
            ...base,
            page: '<main><h1>Two isolated loader owners</h1><first-sample></first-sample><second-sample></second-sample></main>',
            javascript:
                "const first = createLoader({ config: { autoStart: false } });\nconst second = createLoader({ config: { autoStart: false } });\nawait first.define('first-sample', '#sample-template');\nawait second.define('second-sample', '#sample-template');\nawait Promise.all([first.start(), second.start()]);\nplaygroundHot.dispose(() => first.dispose({ clearPersistentCaches: false }));\nplaygroundHot.dispose(() => second.dispose({ clearPersistentCaches: false }));\nconsole.info('Separate configurations:', first.globalConfig !== second.globalConfig);",
        },
    },
};
