import { readFile, writeFile, rm } from 'node:fs/promises';
import { format, resolveConfig } from 'prettier';
import {
    optionConstraints,
    optionDefaults,
    optionDeclarations,
    dataDeclarations,
    descriptors,
} from './option-descriptors.mjs';

// Serialize infinity explicitly while keeping generated browser data dependency-free
const literal = (value) =>
        JSON.stringify(value, (_, item) => (item === Infinity ? '__ACL_INFINITY__' : item), 4).replaceAll(
            '"__ACL_INFINITY__"',
            'Infinity',
        ),
    constraints = descriptors
        .filter((item) => item.validate || item.allowed)
        .map((item) => ({
            name: item.group ? `data.${item.group}` : item.setting,
            rule: item.validate,
            allowed: item.allowed ? [...item.allowed] : undefined,
        }));
// Resolve the queued operation and release its resources
constraints.push(...optionConstraints.filter((item) => !constraints.some(({ name }) => name === item.name)));
const dataConstraints = constraints.filter(
        // Keep the existing descriptor validation order for data and persistence
        ({ name }) => name.startsWith('data.') || name === 'persistVersion',
    ),
    configConstraints = constraints.filter(
        // Emit the remaining global checks directly
        ({ name }) => !name.startsWith('data.') && name !== 'persistVersion',
    ),
    rules = {
        nonNegative: 'a non-negative finite number',
        nonNegativeInfinity: 'a non-negative number or Infinity',
        positiveInteger: 'a positive integer',
        unitInterval: 'between 0 and 1',
        bytes: 'a positive integer or Infinity',
    },
    // Emit diagnostic suffix support only where the data validator uses it
    helpers = (suffix) => `
// Validate numeric options
const checkOptionNumber = (value, name, rule${suffix ? ", suffix = ''" : ''}) => {
    if (value == null) return;
    const number = Number(value),
        valid = (number === Infinity && (rule === 1 || rule === 4)) ||
            (rule === 2 || rule === 4
                ? Number.isInteger(number) && number >= 1
                : Number.isFinite(number) && number >= 0 && (rule !== 3 || number <= 1));
    if (!valid)
            throw new TypeError('[ACL] ' + name + ' must be ' + ${literal(Object.values(rules))}[rule || 0]${suffix ? ' + suffix' : ''});
};`,
    // Resolve the queued operation and release its resources
    checks = (items, data = false) =>
        items
            // Resolve the queued operation and release its resources
            .map(({ name, rule, allowed }) => {
                const value = name.startsWith('data.') ? `data?.${name.slice(5)}` : `settings.${name}`;
                return allowed
                    ? `checkOptionValue(${value}, '${name}', ${literal(allowed)}${data ? ', suffix' : ''});`
                    : `checkOptionNumber(${value}, '${name}'${data || rule !== 'nonNegative' ? ', ' + Object.keys(rules).indexOf(rule) : ''}${data ? ', suffix' : ''});`;
            })
            .join('\n'),
    source = (exported) => `// BEGIN GENERATED OPTIONS
// Generated from option descriptors by scripts/generate-options.mjs

// Allocate fresh literal defaults
${exported}const createDefaults = (${exported ? 'dataDefaults' : ''}) => (${
        exported
            ? literal({
                  ...optionDefaults,
                  data: '__ACL_DATA_DEFAULTS__',
              }).replace('"__ACL_DATA_DEFAULTS__"', '{ ...dataDefaults }')
            : literal(optionDefaults)
    });

${helpers(Boolean(exported))}

// Validate allowed option values
const checkOptionValue = (value, name, allowed${exported ? ", suffix = ''" : ''}) => {
    if (value != null && !allowed.includes(value))
        throw new TypeError('[ACL] Unsupported ' + name + ' value "' + value + '"'${exported ? ' + suffix' : ''});
};

${
    exported
        ? `// Validate data options
export const validateDataOptions = (settings, suffix = '') => {
    const data = settings.data;
    ${checks(dataConstraints, true)}
};`
        : ''
}

// Validate generated configuration
${exported}const validateOptions = settings => {
    ${exported ? '' : 'const data = settings.data;'}
    ${exported ? 'validateDataOptions(settings);' : checks(dataConstraints)}
    ${checks(configConstraints)}
    if (settings.hydrate === 'media' && !(typeof settings.hydrateMedia === 'string' && settings.hydrateMedia.trim())) throw new TypeError('[ACL] hydrateMedia is required when hydrate is media');
    const scheduler = settings.hydrationScheduler;
    if (scheduler !== undefined && scheduler !== false) {
        if (!scheduler || typeof scheduler !== 'object' || Array.isArray(scheduler)) throw new TypeError('[ACL] hydrationScheduler must be false or an options object');
        const { budgetMs = 8, maxTasksPerTurn = 4 } = scheduler;
        if (!Number.isFinite(budgetMs) || budgetMs <= 0 || !Number.isInteger(maxTasksPerTurn) || maxTasksPerTurn < 1) throw new TypeError('[ACL] Invalid hydrationScheduler budget');
    }
};
// END GENERATED OPTIONS
`;

const formatting = await resolveConfig(new URL('../src/index.js', import.meta.url));
// Embed generated configuration code into modules already present in each loading closure
for (const [path, exported] of [
    ['../src/index.js', ''],
    ['../src/core.js', ''],
    ['../src/runtime/config.js', 'export '],
]) {
    const file = new URL(path, import.meta.url);
    let contents = await readFile(file, 'utf8');
    if (contents.includes('// BEGIN GENERATED OPTIONS'))
        contents = contents.replace(
            /\/\/ BEGIN GENERATED OPTIONS[\s\S]*?\/\/ END GENERATED OPTIONS\n?/,
            source(exported),
        );
    else
        contents = contents.replace(
            /(\/\/ Licensed under the MIT license in the repository root\n)/,
            '$1\n' + source(exported),
        );
    await writeFile(
        file,
        await format(contents, {
            ...formatting,
            parser: 'babel',
        }),
    );
}
await rm(new URL('../src/generated-options.js', import.meta.url), { force: true });
// Regenerate option fields while preserving generic and callback declaration contracts
const file = new URL('./type-templates/index.d.ts', import.meta.url);
let declarations = await readFile(file, 'utf8');
// Generate consistent defaults and option contracts
for (const [name, fields] of [
    ['ACLComponentOptions', optionDeclarations],
    ['ACLDataOptions', dataDeclarations],
]) {
    const start = declarations.indexOf(`export interface ${name}`),
        open = declarations.indexOf('{', start),
        end = declarations.indexOf('\n}', open);
    declarations =
        declarations.slice(0, open + 1) +
        '\n' +
        Object.values(fields)
            // Generate consistent defaults and option contracts
            .map((value) => '    ' + value)
            .join('\n') +
        declarations.slice(end);
}
await writeFile(
    file,
    await format(declarations, {
        ...formatting,
        parser: 'typescript',
    }),
);
// Keep the defaults table machine-checkable and separate from authored prose
const rows = Object.entries(optionDefaults)
    .filter(([name]) => name !== 'data')
    .map(
        ([name, value]) => `| \`${name}\` | \`${typeof value === 'object' ? JSON.stringify(value) : String(value)}\` |`,
    );
rows.push(
    ...descriptors
        // Generate consistent defaults and option contracts
        .filter((item) => item.group)
        // Generate consistent defaults and option contracts
        .map((item) => `| \`data.${item.group}\` | \`${String(item.default)}\` |`),
);
const documentationFile = new URL('../docs/generated-option-defaults.md', import.meta.url);
await writeFile(
    documentationFile,
    await format(
        `# Generated option defaults\n\nGenerated from the authoritative option descriptors.\n\n| Option | Default |\n| --- | --- |\n${rows.join('\n')}\n`,
        {
            ...(await resolveConfig(documentationFile)),
            parser: 'markdown',
        },
    ),
);
