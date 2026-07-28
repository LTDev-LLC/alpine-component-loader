import { parse } from '@swc/core';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';

const roots = ['src', 'server', 'scripts', 'bin', 'examples', 'tests'],
    files = ['playwright.config.js'],
    functionTypes = new Set([
        'ArrowFunctionExpression',
        'FunctionExpression',
        'FunctionDeclaration',
        'ClassMethod',
        'Constructor',
        'MethodProperty',
    ]),
    complexStatementTypes = new Set([
        'TryStatement',
        'SwitchStatement',
        'ForStatement',
        'ForInStatement',
        'ForOfStatement',
        'WhileStatement',
        'DoWhileStatement',
    ]),
    failures = [];

// Collect authored JavaScript while excluding generated and ignored example artifacts
const walk = async (directory) => {
    // Visit every authored file below the current directory
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (path === 'examples/acl-next') continue;
        if (entry.isDirectory()) await walk(path);
        else if (['.js', '.mjs'].includes(extname(path)) && path !== 'examples/offline/acl-sw.js') files.push(path);
    }
};

// Convert a byte offset to its one-based source line
const lineNumber = (source, index) => source.subarray(0, index).toString().split('\n').length;

// Report one style violation with its source location
const fail = (file, source, index, message) => failures.push(`${file}:${lineNumber(source, index)} ${message}`);

// Check whether the nearest preceding non-empty line contains a line comment
const hasPreviousComment = (source, index) => {
    const start = source.lastIndexOf(10, Math.max(0, index - 1)) + 1,
        lines = source.subarray(0, start).toString().split('\n');
    // Skip blank lines between a declaration and its purpose comment
    while (lines.length && !lines.at(-1).trim()) lines.pop();
    return lines.at(-1)?.includes('//') || lines.at(-1)?.includes('*/') || false;
};

// Resolve the declaration that owns a function expression
const functionAnchor = (node, ancestors) => {
    const declaration = ancestors.findLast(
            // Find the closest variable declaration around the function
            (ancestor) => ancestor.type === 'VariableDeclaration' && ancestor.span,
        ),
        property = ancestors.findLast(
            // Find the closest object property around the function
            (ancestor) => ancestor.type === 'KeyValueProperty' && ancestor.span,
        );
    return declaration || property || node;
};

// Check for a line comment before the first executable statement in a function body
const hasLeadingBodyComment = (source, body) => {
    if (!body?.span) return false;
    const start = body.span.start - 1,
        firstStatement = body.type === 'BlockStatement' ? body.stmts?.[0] : null,
        end = firstStatement?.span?.start ? firstStatement.span.start - 1 : Math.min(body.span.end - 1, start + 500);
    return source.subarray(start, end).toString().includes('//');
};

// Check whether a function has a nearby single-line purpose comment
const hasFunctionComment = (source, node, ancestors) => {
    const start = node.span.start - 1,
        anchor = functionAnchor(node, ancestors),
        body = node.function?.body || node.body,
        prefix = body?.span ? source.subarray(start, body.span.start - 1).toString() : '';
    return (
        hasPreviousComment(source, anchor.span.start - 1) ||
        hasPreviousComment(source, start) ||
        prefix.includes('//') ||
        hasLeadingBodyComment(source, body)
    );
};

// Check whether a declaration uses standard camel-cased function naming
const checkFunctionName = (file, source, node, ancestors) => {
    let name = '';
    if (node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression') name = node.identifier?.value || '';
    if (node.type === 'ClassMethod' || node.type === 'MethodProperty') name = node.key?.value || '';
    if (node.type === 'ArrowFunctionExpression') {
        const declarator = ancestors.findLast(
            // Find the variable name assigned to the arrow function
            (ancestor) => ancestor.type === 'VariableDeclarator' && ancestor.init === node,
        );
        name = declarator?.id?.type === 'Identifier' ? declarator.id.value : '';
    }
    if (name && !/^(?:[a-z_$][A-Za-z0-9_$]*|[A-Z][A-Za-z0-9_$]*)$/.test(name)) {
        fail(file, source, node.span.start - 1, `uses nonstandard function name ${JSON.stringify(name)}`);
    }
};

// Check one statement list for declaration grouping
const checkStatementList = (file, source, statements) => {
    if (!Array.isArray(statements)) return;
    // Compare each declaration with the statement before it
    for (let index = 1; index < statements.length; index += 1) {
        const left = statements[index - 1],
            right = statements[index];
        if (left?.type === 'ReturnStatement') {
            fail(file, source, right.span.start - 1, 'statement is unreachable after an unconditional return');
        }
        if (left?.type !== 'VariableDeclaration' || right?.type !== left.type || left.kind !== right.kind) continue;
        const between = source.subarray(left.span.end - 1, right.span.start - 1).toString();
        if (!between.includes('//') && !between.includes('\n\n')) {
            fail(file, source, right.span.start - 1, `should group adjacent ${right.kind} declarations`);
        }
    }
};

// Audit one parsed syntax tree recursively
const auditTree = (file, source, ast) => {
    const visit = (node, ancestors = []) => {
        // Inspect the current syntax node before visiting its children
        if (!node || typeof node !== 'object') return;
        if (functionTypes.has(node.type)) {
            if (!hasFunctionComment(source, node, ancestors)) {
                fail(file, source, node.span.start - 1, 'function needs a single-line purpose comment');
            }
            checkFunctionName(file, source, node, ancestors);
        }
        if (complexStatementTypes.has(node.type) && !hasPreviousComment(source, node.span.start - 1)) {
            fail(file, source, node.span.start - 1, `${node.type} needs a single-line purpose comment`);
        }
        if (node.type === 'ObjectExpression' && node.properties?.length > 1) {
            const text = source.subarray(node.span.start - 1, node.span.end - 1).toString();
            if (!text.includes('\n'))
                fail(file, source, node.span.start - 1, 'multi-property object must span multiple lines');
        }
        if ((node.type === 'ClassExpression' || node.type === 'ClassDeclaration') && Array.isArray(node.body)) {
            // Require one blank line between neighboring class members
            for (let index = 1; index < node.body.length; index += 1) {
                const left = node.body[index - 1],
                    right = node.body[index],
                    between = source.subarray(left.span.end - 1, right.span.start - 1).toString();
                if (!between.includes('\n\n')) {
                    fail(file, source, right.span.start - 1, 'class members need a blank line between functions');
                }
            }
        }
        checkStatementList(file, source, node.body);
        checkStatementList(file, source, node.stmts);
        const nextAncestors = [...ancestors, node];
        // Visit every child syntax node
        for (const [key, value] of Object.entries(node)) {
            if (key === 'span' || key === 'ctxt' || key === 'type') continue;
            if (Array.isArray(value)) {
                value.forEach(
                    // Audit each child in an array-valued syntax field
                    (child) => visit(child, nextAncestors),
                );
            } else if (value && typeof value === 'object') visit(value, nextAncestors);
        }
    };
    visit(ast);
};

await Promise.all(
    roots.map(
        // Collect files from each authored source root
        (root) => walk(root),
    ),
);

// Audit every authored JavaScript module
for (const file of [...new Set(files)].sort()) {
    const source = await readFile(file),
        lines = source.toString().split('\n');
    let inJSDoc = false;
    // Track JSDoc boundaries while enforcing ordinary comment shape
    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (trimmed.startsWith('/**')) inJSDoc = true;
        // Check comment shape without treating URL literals as comments
        const comment = line.match(/(?:^|\s)(\/\/.*)$/)?.[1];
        if (comment && /[.!?:;,}\])]$/.test(comment.trimEnd())) {
            failures.push(`${file}:${index + 1} line comments must not end in punctuation`);
        }
        if (!inJSDoc && /^\s*(?:\/\*|\*|\*\/)\s*/.test(line)) {
            failures.push(`${file}:${index + 1} comments must use single-line syntax`);
        }
        if (inJSDoc && trimmed.endsWith('*/')) inJSDoc = false;
    });
    const ast = await parse(source.toString(), {
        syntax: 'ecmascript',
        target: 'es2022',
    });
    auditTree(file, source, ast);
}

if (failures.length) {
    console.error(`JavaScript style check failed with ${failures.length} violation${failures.length === 1 ? '' : 's'}`);
    failures.forEach(
        // Print each violation on its own line for CI annotations
        (failure) => console.error(`- ${failure}`),
    );
    process.exitCode = 1;
} else {
    console.log(`JavaScript style check passed for ${new Set(files).size} authored files`);
}
