import { readFile, writeFile } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
// Emit common facade code without an additional runtime import
for (const [entry, extension] of [
    ['index', 'default'],
    ['core', 'core'],
]) {
    const file = new URL(`../src/${entry}.js`, import.meta.url);

    const previous = await readFile(file, 'utf8');

    const options = previous.match(/\/\/ BEGIN GENERATED OPTIONS[\s\S]*?\/\/ END GENERATED OPTIONS/)[0];

    const common = await readFile(new URL('./facade-template.js', import.meta.url), 'utf8');

    const extra = await readFile(new URL(`./facade-${extension}-template.js`, import.meta.url), 'utf8');
    await writeFile(
        file,
        await format(
            previous.slice(0, previous.indexOf('// BEGIN GENERATED OPTIONS')) +
                options +
                '\n\n// BEGIN GENERATED FACADE\n' +
                common +
                extra +
                '// END GENERATED FACADE\n',
            {
                ...(await resolveConfig(file.pathname)),
                parser: 'babel',
            },
        ),
    );
}
