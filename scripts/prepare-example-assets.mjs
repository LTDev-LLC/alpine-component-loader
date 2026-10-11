import { minifyJavaScript } from '../server/javascript-minifier.mjs';
import { cp, mkdir, writeFile, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { generateModulePreloads } from '../server/module-preloads.mjs';
import { prepareAlpineRuntime } from './prepare-alpine-runtime.mjs';
import { prepareExampleControls } from './prepare-example-controls.mjs';

await prepareAlpineRuntime();
await prepareExampleControls();

// Copy the exact pinned third-party suite without renaming its relative bundle dependencies
const vendor = resolve('examples/feature-lab/demos/vendor/webcomponents');
await mkdir(vendor, { recursive: true });
// Preserve each loader-selected bundle and the upstream license in the self-hosted example
for (const file of ['webcomponents-loader.js', 'webcomponents-bundle.js', 'bundles', 'LICENSE.md'])
    await cp(resolve('node_modules/@webcomponents/webcomponentsjs', file), resolve(vendor, file), { recursive: true });

// Generate reproducible tooling output without shipping a parser to the browser
const manifest = {
        version: 1,
        components: {
            'preload-basic': { source: '#plain' },
            'preload-visible': {
                source: '#visible',
                options: { hydrate: 'visible' },
                dependencies: ['preload-basic'],
            },
        },
        groups: { visible: ['preload-visible'] },
    },
    variants = {};
// Keep the selectors and generated URLs available to the interactive inspector
for (const [name, selection] of Object.entries({
    basic: { tags: ['preload-basic'] },
    visible: { groups: ['visible'] },
    transforms: {
        tags: ['preload-basic'],
        features: ['styles', 'slots', 'scripts'],
    },
}))
    variants[name] = await generateModulePreloads({
        manifest,
        entryUrl: '/dist/core.min.js',
        ...selection,
    });
await writeFile(
    resolve('examples/feature-lab/demos/preloads.json'),
    JSON.stringify(
        {
            manifest,
            variants,
        },
        null,
        4,
    ) + '\n',
);

// Keep vendor filenames intact while publishing the authored offline application as minified JavaScript
await writeFile(
    resolve('examples/offline/app.min.js'),
    await minifyJavaScript(await readFile(resolve('examples/offline/app.js'), 'utf8')),
);

// Keep the demo document inside the offline worker's scope while sharing its implementations
await writeFile(
    resolve('examples/offline/demo.html'),
    (await readFile(resolve('examples/feature-lab/demos/frame.html'), 'utf8'))
        .replace('./frame.css', '/examples/feature-lab/demos/frame.css')
        .replace('./frame.js', '/examples/feature-lab/demos/frame.js'),
);
