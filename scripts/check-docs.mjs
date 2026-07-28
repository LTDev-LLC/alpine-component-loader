import { access, readFile, readdir } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { createDocumentationContracts, findMissingDocumentation } from './docs-contract.mjs';

const projectRoot = resolve('.');

const walk = async (directory) => {
    // Walk
    const files = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory() && entry.name === 'node_modules') continue;
        if (entry.isDirectory()) files.push(...(await walk(path)));
        else if (entry.isFile() && extname(path) === '.md') files.push(path);
    }
    return files;
};

const slug = (value) => {
    // Run the slug operation
    return value
        .toLowerCase()
        .trim()
        .replace(/<[^>]+>/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-');
};

const files = [
        resolve('README.md'),
        resolve('MIGRATION.md'),
        resolve('SECURITY.md'),
        ...(await walk(resolve('docs'))),
        ...(await walk(resolve('examples'))),
        ...(await walk(resolve('starters'))),
    ],
    anchors = new Map(),
    errors = [];
// Process each file
for (const file of files) {
    const source = await readFile(file, 'utf8'),
        seen = new Map(),
        values = new Set();
    // Process each match
    for (const match of source.matchAll(/^#{1,6}\s+(.+)$/gm)) {
        const base = slug(match[1]),
            count = seen.get(base) || 0;
        values.add(count ? `${base}-${count}` : base);
        seen.set(base, count + 1);
    }
    anchors.set(file, values);
}

// Derive the required public documentation surface from declaration sources and package entries
const declarationRoot = resolve('scripts/type-templates'),
    declarations = Object.fromEntries(
        await Promise.all(
            (await readdir(declarationRoot))
                .filter(
                    // Select declaration templates
                    (name) => name.endsWith('.d.ts'),
                )
                .map(async (name) => [name, await readFile(join(declarationRoot, name), 'utf8')]),
        ),
    ),
    packageJson = JSON.parse(await readFile(resolve('package.json'), 'utf8')),
    documents = Object.fromEntries(
        await Promise.all(
            [...new Set(files.map((file) => relative(projectRoot, file)))].map(async (file) => [
                file,
                await readFile(resolve(file), 'utf8'),
            ]),
        ),
    ),
    missingDocumentation = findMissingDocumentation(
        createDocumentationContracts({
            declarations,
            packageJson,
        }),
        documents,
    );

missingDocumentation.forEach(
    // Report each uncovered public contract in its designated reference
    ({ group, document, member }) => {
        errors.push(`${document}: undocumented ${group} member \`${member}\``);
    },
);

// Process each file
for (const file of files) {
    const source = await readFile(file, 'utf8');
    // Process each match
    for (const match of source.matchAll(/(?<!!)\[[^\]]+\]\(([^)]+)\)/g)) {
        const target = match[1].trim().replace(/^<|>$/g, '');
        if (!target || /^(?:https?:|mailto:)/i.test(target)) continue;
        const [rawPath, rawHash = ''] = target.split('#'),
            path = rawPath ? resolve(dirname(file), decodeURIComponent(rawPath)) : file;
        // Guard the operation against runtime failures
        try {
            await access(path);
        } catch {
            errors.push(`${relative(projectRoot, file)}: missing link target ${target}`);
            continue;
        }
        if (rawHash && extname(path).toLowerCase() === '.md') {
            const expected = decodeURIComponent(rawHash).toLowerCase(),
                available =
                    anchors.get(path) ||
                    new Set(
                        [...String(await readFile(path, 'utf8')).matchAll(/^#{1,6}\s+(.+)$/gm)].map(
                            // Transform the current item
                            (item) => slug(item[1]),
                        ),
                    );
            if (!available.has(expected))
                errors.push(
                    `${relative(projectRoot, file)}: missing anchor #${rawHash} in ${relative(projectRoot, path)}`,
                );
        }
    }
}

if (errors.length) {
    process.stderr.write(`${errors.join('\n')}\n`);
    process.exitCode = 1;
} else {
    process.stdout.write(`Documentation links passed (${files.length} Markdown files).\n`);
}
