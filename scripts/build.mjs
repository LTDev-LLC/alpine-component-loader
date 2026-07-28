import { transform } from '@swc/core';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Resolve build paths and compiler settings once for every source artifact
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..'),
    sourceRoot = join(projectRoot, 'src'),
    outputRoot = join(projectRoot, 'dist'),
    packageJson = JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf8')),
    packageVersion = String(packageJson.version || '').trim(),
    versionIdentifier = '__ACL_BUILD_VERSION__',
    licenseHeader =
        '// @license AlpineComponentLoader\n' +
        '// Copyright (c) LTDev LLC\n' +
        '// Licensed under the MIT license in the repository root\n';

if (!packageVersion) throw new TypeError('package.json must contain a non-empty version string.');

// Recursively collect JavaScript source files in stable directory order
const walk = async (directory) => {
    // Walk
    const entries = await readdir(directory, { withFileTypes: true }),
        files = [];
    // Process each entry
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await walk(path)));
        else if (entry.isFile() && extname(entry.name) === '.js') files.push(path);
    }
    return files;
};

// Stamp the package version and compile one source module to readable ES2022
const compile = async (sourcePath, outputPath) => {
    // Compile
    let source = await readFile(sourcePath, 'utf8');
    if (!source.startsWith(licenseHeader))
        throw new Error(`Missing AlpineComponentLoader license header in ${relative(sourceRoot, sourcePath)}.`);
    source = source.slice(licenseHeader.length);
    // Replace the development-safe identifier only in its owning facade and runtime config modules
    if (['index.js', join('runtime', 'config.js')].includes(relative(sourceRoot, sourcePath))) {
        const occurrences = source.split(versionIdentifier).length - 1;
        if (occurrences !== 2)
            throw new Error(
                `Expected two ${versionIdentifier} references in ${relative(sourceRoot, sourcePath)}; found ${occurrences}.`,
            );
        source = source.replaceAll(versionIdentifier, JSON.stringify(packageVersion));
    }
    const result = await transform(source, {
            filename: sourcePath,
            sourceMaps: false,
            isModule: true,
            jsc: {
                target: 'es2022',
                parser: { syntax: 'ecmascript' },
            },
            module: { type: 'es6' },
        }),
        code = `${licenseHeader}\n${result.code}`;
    if (code.includes(versionIdentifier))
        throw new Error(`Unresolved ${versionIdentifier} in ${relative(sourceRoot, sourcePath)}.`);
    await mkdir(dirname(outputPath), { recursive: true });
    await writeFile(outputPath, code);
};

// Replace the previous output tree so removed source modules cannot survive a build
await rm(outputRoot, {
    recursive: true,
    force: true,
});

// Preserve the source directory layout while compiling every module concurrently
const builds = (await walk(sourceRoot)).map(
    // Transform the current item
    (sourcePath) => [sourcePath, join(outputRoot, relative(sourceRoot, sourcePath))],
);

await Promise.all(
    builds.map(
        // Transform the current item
        ([sourcePath, outputPath]) => compile(sourcePath, outputPath),
    ),
);

process.stdout.write(
    `Built ${builds.length} readable JavaScript artifacts for alpine-component-loader ${packageVersion} (ES2022).\n`,
);
