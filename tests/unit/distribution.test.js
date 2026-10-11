import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative, resolve } from 'node:path';
import test from 'node:test';
import { parse } from '@swc/core';

// Inventory all JavaScript artifacts independently of the generated module graph
const javascriptFiles = async (root, directory = root) => {
    const paths = [];
    // Preserve nested module paths when comparing the source and delivery families
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) paths.push(...(await javascriptFiles(root, path)));
        else if (entry.isFile() && entry.name.endsWith('.js')) paths.push(relative(root, path));
    }
    return paths.sort();
};

test('distribution ships complete readable and prebuilt minified native ESM families', async () => {
    // Require every source module at both physical identities, including optional capabilities
    const sources = await javascriptFiles(resolve('src')),
        artifacts = await javascriptFiles(resolve('dist')),
        graph = JSON.parse(await readFile(resolve('dist/module-graph.json'), 'utf8')),
        version = JSON.parse(await readFile(resolve('package.json'), 'utf8')).version;
    assert.deepEqual(
        artifacts,
        [
            ...sources,
            ...sources.map(
                // Include each nested module's physical minified counterpart
                (path) => path.replace(/\.js$/, '.min.js'),
            ),
        ].sort(),
    );
    assert.deepEqual(Object.keys(graph.nodes).sort(), sources);
    // Check published bytes rather than a generated HTTP response or an in-memory substitute
    for (const path of sources) {
        const readable = await readFile(resolve('dist', path), 'utf8'),
            minified = await readFile(resolve('dist', path.replace(/\.js$/, '.min.js')), 'utf8');
        assert.ok(Buffer.byteLength(minified) < Buffer.byteLength(readable), `${path} was not minified`);
        assert.match(minified, /@license AlpineComponentLoader/);
        assert.match(minified, /Copyright \(c\) LouisT/);
        assert.match(minified, /Licensed under the MIT license/);
        assert.doesNotMatch(minified, /__ACL_BUILD_VERSION__|sourceMappingURL/);
        const ast = await parse(minified, {
            syntax: 'ecmascript',
            isModule: true,
        });
        assert.equal(ast.type, 'Module', path);
        if (['index.js', 'core.js', 'runtime/config.js'].includes(path))
            assert.ok(minified.includes(JSON.stringify(version)), `${path} has no stamped version`);
    }
});

test('prebuilt minified facades preserve public exports and synchronous configuration', async () => {
    // Import the committed output directly without a development server or CDN transformation
    for (const entry of ['index', 'core']) {
        const readable = await import(`../../dist/${entry}.js`),
            minified = await import(`../../dist/${entry}.min.js`);
        assert.deepEqual(Object.keys(minified).sort(), Object.keys(readable).sort());
        assert.equal(minified.default.version, readable.default.version);
        assert.deepEqual(minified.default.globalConfig, readable.default.globalConfig);
        assert.throws(
            // Configuration validation must stay synchronous in minified delivery
            () => minified.default.config({ templateTimeout: -1 }),
            TypeError,
        );
    }
});
