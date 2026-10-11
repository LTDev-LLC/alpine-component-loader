import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { resolveAlpineRuntime } from '../../scripts/alpine-runtime.mjs';
import { alpineReferenceFiles, prepareAlpineRuntime } from '../../scripts/prepare-alpine-runtime.mjs';

test('changing only the configured Alpine alias refreshes maintained browser and starter references', async (context) => {
    // Exercise two successive dependency updates without changing any version-bearing source file manually
    const root = await mkdtemp(join(tmpdir(), 'acl-alpine-pin-')),
        packagePath = resolve(root, 'package.json'),
        original =
            '<script src="https://cdn.jsdelivr.net/npm/alpinejs@3.15.12/dist/cdn.min.js"></script>\n' +
            'https://cdn.jsdelivr.net/npm/alpinejs@3/dist/module.esm.min.js\n' +
            'https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js\n';
    context.after(async () => {
        // Release the isolated generation fixture
        await rm(root, {
            recursive: true,
            force: true,
        });
    });
    // Seed every maintained delivery surface with stale references and unrelated application content
    for (const file of alpineReferenceFiles) {
        const path = resolve(root, file);
        await mkdir(dirname(path), { recursive: true });
        await writeFile(
            path,
            file === 'starters/vite/package.json'
                ? JSON.stringify({
                      dependencies: {
                          alpinejs: '^3.15.0',
                          'alpine-component-loader': 'github:LouisT/alpine-component-loader',
                      },
                  })
                : original,
        );
    }
    // Confirm package.json alone controls both upgrades and repeated reproducible generation
    for (const version of ['3.90.1', '3.91.2']) {
        await writeFile(
            packagePath,
            JSON.stringify({ devDependencies: { 'alpinejs-pinned': `npm:alpinejs@${version}` } }),
        );
        await prepareAlpineRuntime(root);
        // Inspect published references independently of the resolver's return value
        for (const file of alpineReferenceFiles) {
            const output = await readFile(resolve(root, file), 'utf8');
            if (file === 'starters/vite/package.json') {
                const dependencies = JSON.parse(output).dependencies;
                assert.equal(dependencies.alpinejs, version);
                assert.equal(dependencies['alpine-component-loader'], 'github:LouisT/alpine-component-loader');
            } else {
                assert.equal(output, original.replace(/alpinejs@(?:3\.15\.12|3)\//g, `alpinejs@${version}/`));
            }
        }
        assert.deepEqual((await prepareAlpineRuntime(root)).changed, []);
    }
});

test('build pins reject missing aliases, ranges, and tags instead of generating ambiguous CDN assets', () => {
    // Reject dependencies that cannot produce deterministic runtime and offline URLs
    for (const specification of [undefined, 'npm:alpinejs@latest', 'npm:alpinejs@^3.17.4', 'npm:other@3.17.4']) {
        assert.throws(
            // Require the authoritative alias to contain an exact Alpine version
            () => resolveAlpineRuntime({ devDependencies: { 'alpinejs-pinned': specification } }),
            /alpinejs-pinned.*exact-version/,
        );
    }
});
