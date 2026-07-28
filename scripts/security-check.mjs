import { readFile, readdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';

// Define source patterns that cannot appear in publishable runtime code
const roots = ['src', 'server', 'bin'].map((directory) => resolve(directory)),
    forbidden = [
        {
            pattern: /\beval\s*\(/,
            label: 'eval()',
        },
        {
            pattern: /\bnew\s+Function\s*\(/,
            label: 'dynamic Function constructor',
        },
        {
            pattern: /\.innerHTML\s*=(?!=)/,
            label: 'innerHTML assignment',
        },
        {
            pattern: /\.outerHTML\s*=(?!=)/,
            label: 'outerHTML assignment',
        },
        {
            pattern: /\binsertAdjacentHTML\s*\(/,
            label: 'insertAdjacentHTML()',
        },
        {
            pattern: /\bdocument\.write(?:ln)?\s*\(/,
            label: 'document.write()',
        },
        {
            pattern: /sourceMappingURL=data:/,
            label: 'embedded source map',
        },
    ];

// Recursively enumerate JavaScript sources for static inspection
const walk = async (directory) => {
    // Walk
    const paths = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) paths.push(...(await walk(path)));
        else if (entry.isFile() && ['.js', '.mjs'].includes(extname(path))) paths.push(path);
    }
    return paths;
};

let failed = false;
// Apply every forbidden-pattern rule to every publishable runtime and server source file
for (const root of roots) {
    // Run this operation
    for (const path of await walk(root)) {
        const source = await readFile(path, 'utf8');
        // Process each rule
        for (const rule of forbidden) {
            if (rule.pattern.test(source)) {
                process.stderr.write(`${path}: forbidden ${rule.label}\n`);
                failed = true;
            }
        }
    }
}

// Require production-safe defaults in the primary loader entry point
const core = await readFile(resolve('src/index.js'), 'utf8');
if (!/executeScripts:\s*false/.test(core) || !/sanitize:\s*true/.test(core)) {
    process.stderr.write('src/index.js: production-safe defaults are missing.\n');
    failed = true;
}
// Runtime code must not construct dynamic functions from declarative input
const dynamicFunctionSites = [...core.matchAll(/\bnew\s+Function\s*\(/g)].length;
if (dynamicFunctionSites !== 0) {
    process.stderr.write('src/index.js: dynamic expression evaluation is forbidden.\n');
    failed = true;
}

const rendering = await readFile(resolve('src/runtime/rendering.js'), 'utf8'),
    ssr = await readFile(resolve('server/ssr.mjs'), 'utf8');
if (
    !/isExecutableUrl/.test(rendering) ||
    !/srcset/.test(rendering) ||
    !/trustedTypesPolicy/.test(rendering) ||
    !/ACL_TRUSTED_TYPES_REQUIRED/.test(rendering)
) {
    process.stderr.write('src/runtime/rendering.js: hardened URL and Trusted Types policy invariants are missing.\n');
    failed = true;
}
if (!/isExecutableUrl/.test(ssr) || !/sanitizeTree/.test(ssr)) {
    process.stderr.write('server/ssr.mjs: SSR sanitizer parity invariants are missing.\n');
    failed = true;
}

// Return a nonzero process status when any security invariant fails
if (failed) process.exitCode = 1;
else process.stdout.write('Static security invariants passed.\n');
