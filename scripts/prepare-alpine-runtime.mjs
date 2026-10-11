import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readAlpineRuntime, repositoryRoot } from './alpine-runtime.mjs';

// Keep browser examples self-contained without adding a runtime version-module request
export const alpineReferenceFiles = [
    'README.md',
    'docs/core.md',
    'docs/polyfills.md',
    'examples/a11y/index.html',
    'examples/feature-lab/index.html',
    'examples/offline/index.html',
    'examples/playground/index.html',
    'examples/playground/playground.js',
    'examples/feature-lab/demos/frame.js',
    'examples/offline/README.md',
    'examples/playground/README.md',
    'starters/vanilla/index.html',
    'starters/vite/package.json',
];

// Refresh maintained Alpine references while preserving unrelated authored content
export const prepareAlpineRuntime = async (root = repositoryRoot) => {
    const runtime = await readAlpineRuntime(root),
        changed = [];
    // Rewrite only Alpine CDN pins and the starter's Alpine dependency
    for (const file of alpineReferenceFiles) {
        const path = resolve(root, file),
            source = await readFile(path, 'utf8');
        let output = source.replace(
            /https:\/\/cdn\.jsdelivr\.net\/npm\/alpinejs@[^/\s"'`]+\/dist\//g,
            `https://cdn.jsdelivr.net/npm/alpinejs@${runtime.version}/dist/`,
        );
        if (file === 'starters/vite/package.json') {
            const packageJson = JSON.parse(output);
            packageJson.dependencies.alpinejs = runtime.version;
            output = `${JSON.stringify(packageJson, null, 4)}\n`;
        }
        if (output === source) continue;
        await writeFile(path, output);
        changed.push(file);
    }
    return {
        ...runtime,
        changed,
    };
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
    const result = await prepareAlpineRuntime();
    process.stdout.write(`Prepared Alpine ${result.version} references (${result.changed.length} updated files).\n`);
}
