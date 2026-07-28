#!/usr/bin/env node

import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const usage = `Usage:
  alpine-component-loader serve [directory | index.html] [options]
  alpine-component-loader create <directory> [options]
  alpine-component-loader skeleton <url | directory | index.html> [options]
  alpine-component-loader audit <route-or-url> [options]
  alpine-component-loader init <tag> [options]
  alpine-component-loader validate [manifest | directory] [options]
  alpine-component-loader manifest [directory] [options]
  alpine-component-loader routes [target] [options]
  alpine-component-loader watch [options]
  alpine-component-loader offline <manifest> [options]
  alpine-component-loader types <manifest> [options]
  alpine-component-loader schema [options]

Serve options:
  --root <directory>  Directory to serve (default: invocation directory)
  --host <host>       Host to bind (default: 127.0.0.1)
  --port <port>       Port to bind (default: 4173)

Skeleton options:
  --root <directory>       Base directory for a local target
  --route <path>           Route to capture (repeatable)
  --out-dir <directory>    Generated artifact directory (default: skeletons)
  --mode <mode>            css (default), manifest, or both
  --include <tags>         Comma-separated component tags to include
  --exclude <tags>         Comma-separated component tags to exclude
  --timeout <ms>           Navigation/readiness timeout (default: 15000)
  --mobile <width>x<height> Mobile viewport (default: 390x844)
  --desktop <width>x<height> Desktop viewport (default: 1440x900)
  --breakpoint <px>        Mobile media-query boundary (default: 768)
  --allow-partial          Write successful captures when others fail
  --force                  Allow replacing non-generated output files

Audit options:
  --root <directory>       Local application root (default: invocation directory)
  --route <path-or-url>    Additional route to audit (repeatable)
  --format <format>        console (default), json, junit, or sarif
  --out <file>             Write the selected report format to a file
  --no-axe                 Run only ACL's built-in accessibility rules
  --timeout <ms>           Navigation timeout (default: 15000)
  --baseline <file>        Compare against an accessibility baseline
  --suppressions <file>    Apply expiring accessibility suppressions
  --update-baseline        Replace the baseline with current findings

Route options:
  --manifest <file>        Source component manifest
  --route <path>           Route to crawl (repeatable)
  --out-dir <directory>    Route shard output directory
  --target <url-or-file>   Application target used for discovery
  --timeout <ms>           Route navigation timeout (default: 15000)
  --dry-run                Compute route artifacts without writing
  --json                   Print machine-readable command results
  --force                  Replace existing generated route artifacts

Watch options:
  --task <name>            Task to run on changes (repeatable)
  --include-expensive      Enable configured browser-backed tasks
  --debounce <ms>          Change debounce interval (default: 100)
  --poll-interval <ms>     Safety scan interval; 0 disables scans (default: 5000)

Project options:
  --template <name>        Starter template: vanilla (default) or vite
  --dir <directory>        Component output directory for init (default: components)
  --manifest <file>        Add an initialized component to a manifest
  --shadow                 Scaffold a Shadow DOM manifest definition
  --out <file>             Manifest output path (default: acl-manifest.json)
  --update                 Safely merge generated fields into an existing manifest
  --prune                  Remove missing components while updating a manifest
  --infer <mode>           Manifest inference: safe (default), report, or off
  --dry-run                Validate and print planned output without writing
  --json                   Print machine-readable command results
  --force                  Allow replacing existing generated files

Offline options:
  --group <name>           Include a named manifest group (repeatable)
  --asset <path-or-url>    Include a static file, directory, or URL (repeatable)
  --minify-js              Publish local explicit JavaScript assets as virtual .min.js URLs
  --out-dir <directory>    Output directory (default: offline)
  --base-url <path>        Browser base URL for relative assets (default: /)
  --namespace <name>       Generated cache namespace (default: default)
  --config <file>          Opt-in activation, navigation, and runtime route policy
  --project-config <file>  ACL project configuration (offline command)
Contract options:
  --out <file>             Primary declaration/schema output file
  --kind <kind>            Schema kind: manifest (default), component, or offline
  --custom-elements-out <file> Custom Elements Manifest output for types
  --dry-run                Validate and print planned output without writing
  --json                   Print machine-readable command results
  --force                  Allow replacing existing generated files
  -h, --help          Show this help
`;

// Read either a separate or equals-delimited command-line option value
const readFlagValue = (args, index, name) => {
    const argument = args[index],
        equalsIndex = argument.indexOf('=');
    if (equalsIndex >= 0) {
        const value = argument.slice(equalsIndex + 1);
        if (!value) throw new TypeError(`${name} requires a value.`);
        return {
            consumed: 0,
            value,
        };
    }
    const value = args[index + 1];
    if (!value || value.startsWith('-')) throw new TypeError(`${name} requires a value.`);
    return {
        consumed: 1,
        value,
    };
};

const parseViewport = (value, name) => {
    // Parse viewport
    const match = /^(\d+)x(\d+)$/i.exec(value),
        width = Number(match?.[1]),
        height = Number(match?.[2]);
    if (!match || width <= 0 || height <= 0)
        throw new TypeError(`${name} must use WIDTHxHEIGHT with positive integers.`);
    return {
        width,
        height,
    };
};

const parseTagList = (value) => {
    // Parse tag list
    return value
        .split(',')
        .map(
            // Transform the current item
            (tag) => tag.trim().toLowerCase(),
        )
        .filter(Boolean);
};

// Parse and validate CLI commands without starting network or browser resources
const parseCLIArgumentsInternal = (
    argv,
    invocationDirectory = process.env.INIT_CWD || process.cwd(),
    { allowConfigured = false } = {},
) => {
    const args = [...argv];
    if (args.length === 0 || args[0] === '-h' || args[0] === '--help') return { help: true };
    const command = args.shift();
    if (
        ![
            'serve',
            'create',
            'skeleton',
            'audit',
            'init',
            'validate',
            'manifest',
            'routes',
            'watch',
            'offline',
            'types',
            'schema',
        ].includes(command)
    )
        throw new TypeError(`Unknown command: ${command}`);

    if (command === 'watch') {
        const tasks = [];
        let includeExpensive = false,
            debounce = 100,
            pollInterval = 5000;
        // Process for
        for (let position = 0; position < args.length; position++) {
            const argument = args[position],
                valueOption = ['--task', '--debounce', '--poll-interval'].find(
                    // Run this operation
                    (name) => argument === name || argument.startsWith(`${name}=`),
                );
            if (argument === '-h' || argument === '--help')
                return {
                    // Configure this value
                    command,
                    help: true,
                };
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--task') tasks.push(result.value);
                else if (valueOption === '--debounce') debounce = Number(result.value);
                else pollInterval = Number(result.value);
            } else if (argument === '--include-expensive') includeExpensive = true;
            else throw new TypeError(`Unknown option: ${argument}`);
        }
        if (!Number.isInteger(debounce) || debounce < 0)
            throw new TypeError('--debounce must be a non-negative integer.');
        if (!Number.isInteger(pollInterval) || pollInterval < 0)
            throw new TypeError('--poll-interval must be a non-negative integer.');
        return {
            command,
            help: false,
            tasks,
            includeExpensive,
            debounce,
            pollInterval,
        };
    }

    if (command === 'routes') {
        let manifestFile = null,
            outDir = null,
            target = null,
            timeout = 15_000,
            force = false,
            dryRun = false,
            json = false;
        const routes = [];
        // Process for
        for (let position = 0; position < args.length; position++) {
            const argument = args[position],
                valueOption = ['--manifest', '--route', '--out-dir', '--target', '--timeout'].find(
                    // Run this operation
                    (name) => argument === name || argument.startsWith(`${name}=`),
                );
            if (argument === '-h' || argument === '--help')
                return {
                    // Configure this value
                    command,
                    help: true,
                };
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--manifest') manifestFile = resolve(invocationDirectory, result.value);
                else if (valueOption === '--route') routes.push(result.value);
                else if (valueOption === '--out-dir') outDir = resolve(invocationDirectory, result.value);
                else if (valueOption === '--target') target = result.value;
                else timeout = Number(result.value);
            } else if (argument === '--force') force = true;
            else if (argument === '--dry-run') dryRun = true;
            else if (argument === '--json') json = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (target) throw new TypeError(`Only one route target may be provided: ${argument}`);
            else target = argument;
        }
        if (!Number.isInteger(timeout) || timeout <= 0) throw new TypeError('--timeout must be a positive integer.');
        return {
            command,
            help: false,
            manifestFile,
            outDir,
            target,
            routes,
            timeout,
            force,
            dryRun,
            json,
        };
    }

    if (command === 'create') {
        let directory = null,
            template = 'vanilla',
            force = false,
            dryRun = false,
            json = false;
        // Run this operation
        for (let position = 0; position < args.length; position++) {
            const argument = args[position];
            if (argument === '-h' || argument === '--help')
                return {
                    // Return the selected command with help enabled
                    command,
                    help: true,
                };
            if (argument === '--template' || argument.startsWith('--template=')) {
                const result = readFlagValue(args, position, '--template');
                template = result.value;
                position += result.consumed;
            } else if (argument === '--force') force = true;
            else if (argument === '--dry-run') dryRun = true;
            else if (argument === '--json') json = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (directory) throw new TypeError(`Only one starter directory may be provided: ${argument}`);
            else directory = resolve(invocationDirectory, argument);
        }
        if (!directory) throw new TypeError('The create command requires an output directory.');
        if (!['vanilla', 'vite'].includes(template)) throw new TypeError(`Unsupported starter template "${template}".`);
        return {
            // Return normalized starter options
            command,
            help: false,
            directory,
            template,
            force,
            dryRun,
            json,
        };
    }

    if (command === 'audit') {
        let root = invocationDirectory,
            outFile = null,
            format = 'console',
            timeout = 15_000,
            axe = true,
            target = null,
            baselineFile = null,
            suppressionsFile = null,
            updateBaseline = false;
        const routes = [];
        // Run this operation
        for (let position = 0; position < args.length; position++) {
            const argument = args[position],
                valueOption = [
                    '--root',
                    '--route',
                    '--format',
                    '--out',
                    '--timeout',
                    '--baseline',
                    '--suppressions',
                ].find(
                    // Run this operation
                    (name) => argument === name || argument.startsWith(`${name}=`),
                );
            if (argument === '-h' || argument === '--help')
                return {
                    // Return the selected command with help enabled
                    command,
                    help: true,
                };
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--root') root = resolve(invocationDirectory, result.value);
                else if (valueOption === '--route') routes.push(result.value);
                else if (valueOption === '--format') format = result.value.toLowerCase();
                else if (valueOption === '--out') outFile = resolve(invocationDirectory, result.value);
                else if (valueOption === '--baseline') baselineFile = resolve(invocationDirectory, result.value);
                else if (valueOption === '--suppressions')
                    suppressionsFile = resolve(invocationDirectory, result.value);
                else timeout = Number(result.value);
            } else if (argument === '--no-axe') axe = false;
            else if (argument === '--update-baseline') updateBaseline = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (target) throw new TypeError(`Only one audit target may be provided: ${argument}`);
            else target = argument;
        }
        if (!target && !routes.length && !allowConfigured)
            throw new TypeError('The audit command requires a route or URL.');
        if (!['console', 'json', 'junit', 'sarif'].includes(format))
            throw new TypeError(`Unsupported audit format "${format}".`);
        if (!Number.isInteger(timeout) || timeout <= 0) throw new TypeError('--timeout must be a positive integer.');
        const result = {
            command,
            help: false,
            root,
            routes: [...(target ? [target] : []), ...routes],
            format,
            outFile,
            axe,
            timeout,
        };
        // Process forof
        for (const [name, value, explicit] of [
            [
                'baselineFile',
                baselineFile,
                args.some((argument) => argument === '--baseline' || argument.startsWith('--baseline=')),
            ],
            [
                'suppressionsFile',
                suppressionsFile,
                args.some((argument) => argument === '--suppressions' || argument.startsWith('--suppressions=')),
            ],
            ['updateBaseline', updateBaseline, args.includes('--update-baseline')],
        ])
            Object.defineProperty(result, name, {
                value,
                enumerable: explicit,
                writable: true,
                configurable: true,
            });
        return result;
    }

    if (command === 'types' || command === 'schema') {
        let manifestFile = null,
            outFile = resolve(
                invocationDirectory,
                command === 'types' ? 'acl-components.d.ts' : 'acl-manifest.schema.json',
            ),
            customElementsFile = resolve(invocationDirectory, 'custom-elements.json'),
            kind = 'manifest',
            explicitOut = false,
            force = false,
            dryRun = false,
            json = false;
        // Iterate over the indexed values
        for (let position = 0; position < args.length; position++) {
            const argument = args[position],
                valueOption = ['--out', '--custom-elements-out', '--kind'].find(
                    // Find the matching item
                    (name) => argument === name || argument.startsWith(`${name}=`),
                );
            if (argument === '-h' || argument === '--help')
                return {
                    command,
                    help: true,
                };
            if (valueOption) {
                if (command === 'schema' && valueOption === '--custom-elements-out')
                    throw new TypeError('--custom-elements-out is available only for the types command.');
                if (command === 'types' && valueOption === '--kind')
                    throw new TypeError('--kind is available only for the schema command.');
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--out') {
                    outFile = resolve(invocationDirectory, result.value);
                    explicitOut = true;
                } else if (valueOption === '--kind') kind = result.value;
                else customElementsFile = resolve(invocationDirectory, result.value);
            } else if (argument === '--force') force = true;
            else if (argument === '--dry-run') dryRun = true;
            else if (argument === '--json') json = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (manifestFile) throw new TypeError(`Only one ${command} manifest may be provided: ${argument}`);
            else manifestFile = resolve(invocationDirectory, argument);
        }
        if (command === 'types' && !manifestFile && !allowConfigured)
            throw new TypeError('The types command requires a manifest file.');
        if (command === 'schema' && manifestFile)
            throw new TypeError('The schema command does not accept a positional manifest.');
        if (command === 'schema' && !['manifest', 'component', 'offline'].includes(kind))
            throw new TypeError(`Unsupported schema kind "${kind}".`);
        if (command === 'schema' && !explicitOut)
            outFile = resolve(invocationDirectory, `acl-${kind === 'component' ? 'component' : kind}.schema.json`);
        return {
            command,
            help: false,
            manifestFile,
            outFile,
            customElementsFile,
            ...(command === 'schema' ? { kind } : {}),
            force,
            dryRun,
            json,
        };
    }

    if (command === 'offline') {
        let manifestFile = null,
            outDir = resolve(invocationDirectory, 'offline'),
            baseUrl = '/',
            namespace = 'default',
            configFile = null,
            minifyJavaScriptAssets = false,
            force = false,
            dryRun = false,
            json = false;
        const groups = [],
            assets = [];
        // Iterate over the indexed values
        for (let position = 0; position < args.length; position++) {
            const argument = args[position];
            if (argument === '-h' || argument === '--help')
                return {
                    command,
                    help: true,
                };
            const valueOption = ['--group', '--asset', '--out-dir', '--base-url', '--namespace', '--config'].find(
                // Find the matching item
                (name) => argument === name || argument.startsWith(`${name}=`),
            );
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--group') groups.push(result.value);
                else if (valueOption === '--asset') assets.push(result.value);
                else if (valueOption === '--out-dir') outDir = resolve(invocationDirectory, result.value);
                else if (valueOption === '--base-url') baseUrl = result.value;
                else if (valueOption === '--namespace') namespace = result.value;
                else configFile = resolve(invocationDirectory, result.value);
                continue;
            }
            if (argument === '--minify-js') minifyJavaScriptAssets = true;
            else if (argument === '--force') force = true;
            else if (argument === '--dry-run') dryRun = true;
            else if (argument === '--json') json = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (manifestFile) throw new TypeError(`Only one offline manifest may be provided: ${argument}`);
            else manifestFile = resolve(invocationDirectory, argument);
        }
        if (!manifestFile && !allowConfigured) throw new TypeError('The offline command requires a manifest file.');
        return {
            command,
            help: false,
            manifestFile,
            outDir,
            groups,
            assets,
            baseUrl,
            namespace,
            configFile,
            minifyJavaScriptAssets,
            force,
            dryRun,
            json,
        };
    }

    if (['init', 'validate', 'manifest'].includes(command)) {
        let target = null,
            directory = resolve(invocationDirectory, 'components'),
            manifestFile = null,
            outFile = resolve(invocationDirectory, 'acl-manifest.json'),
            shadow = false,
            update = false,
            prune = false,
            force = false,
            dryRun = false,
            json = false,
            inference = 'safe';
        // Iterate over the indexed values
        for (let position = 0; position < args.length; position++) {
            const argument = args[position];
            if (argument === '-h' || argument === '--help')
                return {
                    command,
                    help: true,
                };
            const valueOption = ['--dir', '--manifest', '--out', '--infer'].find(
                // Find the matching item
                (name) => argument === name || argument.startsWith(`${name}=`),
            );
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--dir') directory = resolve(invocationDirectory, result.value);
                else if (valueOption === '--manifest') manifestFile = resolve(invocationDirectory, result.value);
                else if (valueOption === '--out') outFile = resolve(invocationDirectory, result.value);
                else inference = result.value.toLowerCase();
                continue;
            }
            if (argument === '--shadow' && command === 'init') shadow = true;
            else if (argument === '--update' && command === 'manifest') update = true;
            else if (argument === '--prune' && command === 'manifest') prune = true;
            else if (argument === '--force' && command !== 'validate') force = true;
            else if (argument === '--dry-run' && command !== 'validate') dryRun = true;
            else if (argument === '--json') json = true;
            else if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            else if (target != null) throw new TypeError(`Only one ${command} target may be provided: ${argument}`);
            else target = argument;
        }
        if (command === 'init') {
            if (!target) throw new TypeError('The init command requires a custom-element tag.');
            return {
                command,
                help: false,
                tag: target,
                directory,
                manifestFile,
                shadow,
                force,
                dryRun,
                json,
            };
        }
        if (command === 'manifest') {
            if (target) directory = resolve(invocationDirectory, target);
            if (prune && !update) throw new TypeError('--prune requires --update.');
            if (!['safe', 'report', 'off'].includes(inference))
                throw new TypeError('--infer must be safe, report, or off.');
            const result = {
                command,
                help: false,
                directory,
                outFile,
                force,
                update,
                prune,
                dryRun,
                json,
            };
            Object.defineProperty(result, 'inference', {
                value: inference,
                enumerable: inference !== 'safe',
            });
            return result;
        }
        return {
            command,
            help: false,
            target: resolve(invocationDirectory, target || '.'),
            json,
        };
    }

    if (command === 'skeleton') {
        let root = invocationDirectory,
            target = null,
            outDir = null,
            timeout = 15_000,
            mode = 'css',
            breakpoint = 768,
            allowPartial = false,
            force = false;
        const routes = [],
            include = [],
            exclude = [],
            viewports = {
                mobile: {
                    width: 390,
                    height: 844,
                },
                desktop: {
                    width: 1440,
                    height: 900,
                },
            };
        // Iterate over the indexed values
        for (let position = 0; position < args.length; position++) {
            const argument = args[position];
            if (argument === '-h' || argument === '--help')
                return {
                    command,
                    help: true,
                };
            const valueOption = [
                '--root',
                '--route',
                '--out-dir',
                '--mode',
                '--include',
                '--exclude',
                '--timeout',
                '--mobile',
                '--desktop',
                '--breakpoint',
            ].find(
                // Find the matching item
                (name) => argument === name || argument.startsWith(`${name}=`),
            );
            if (valueOption) {
                const result = readFlagValue(args, position, valueOption);
                position += result.consumed;
                if (valueOption === '--root') root = resolve(invocationDirectory, result.value);
                else if (valueOption === '--route') routes.push(result.value);
                else if (valueOption === '--out-dir') outDir = resolve(invocationDirectory, result.value);
                else if (valueOption === '--mode') {
                    mode = result.value.toLowerCase();
                    if (!['css', 'manifest', 'both'].includes(mode))
                        throw new TypeError(`Unsupported skeleton mode: ${result.value}`);
                } else if (valueOption === '--include') include.push(...parseTagList(result.value));
                else if (valueOption === '--exclude') exclude.push(...parseTagList(result.value));
                else if (valueOption === '--mobile') viewports.mobile = parseViewport(result.value, '--mobile');
                else if (valueOption === '--desktop') viewports.desktop = parseViewport(result.value, '--desktop');
                else if (valueOption === '--timeout') {
                    timeout = Number(result.value);
                    if (!Number.isInteger(timeout) || timeout <= 0)
                        throw new TypeError('--timeout must be a positive integer.');
                } else {
                    breakpoint = Number(result.value);
                    if (!Number.isInteger(breakpoint) || breakpoint <= 0)
                        throw new TypeError('--breakpoint must be a positive integer.');
                }
                continue;
            }
            if (argument === '--allow-partial') {
                allowPartial = true;
                continue;
            }
            if (argument === '--force') {
                force = true;
                continue;
            }
            if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
            if (target != null) throw new TypeError(`Only one skeleton target may be provided: ${argument}`);
            target = argument;
        }
        if (!target && !allowConfigured)
            throw new TypeError('The skeleton command requires a URL, directory, or HTML target.');
        return {
            command,
            help: false,
            root,
            target,
            outDir,
            routes,
            include: [...new Set(include)],
            exclude: [...new Set(exclude)],
            timeout,
            viewports,
            breakpoint,
            mode,
            allowPartial,
            force,
        };
    }

    let host = '127.0.0.1',
        port = 4173,
        root = invocationDirectory,
        target = null;
    // Consume options in source order while allowing one positional serve target
    for (let position = 0; position < args.length; position++) {
        const argument = args[position];
        if (argument === '-h' || argument === '--help') return { help: true };
        if (argument === '--host' || argument.startsWith('--host=')) {
            const result = readFlagValue(args, position, '--host');
            host = result.value;
            position += result.consumed;
            continue;
        }
        if (argument === '--port' || argument.startsWith('--port=')) {
            const result = readFlagValue(args, position, '--port');
            port = Number(result.value);
            if (!Number.isInteger(port) || port < 0 || port > 65535)
                throw new TypeError(`Invalid port: ${result.value}`);
            position += result.consumed;
            continue;
        }
        if (argument === '--root' || argument.startsWith('--root=')) {
            const result = readFlagValue(args, position, '--root');
            root = resolve(invocationDirectory, result.value);
            position += result.consumed;
            continue;
        }
        if (argument.startsWith('-')) throw new TypeError(`Unknown option: ${argument}`);
        if (target != null) throw new TypeError(`Only one serve path may be provided: ${argument}`);
        target = argument;
    }
    return {
        command,
        help: false,
        host,
        port,
        root,
        target,
    };
};

// Extract project configuration without changing command-specific meanings such as offline --config
export const parseCLIArguments = (
    argv,
    invocationDirectory = process.env.INIT_CWD || process.cwd(),
    parserOptions = {},
) => {
    const args = [...argv],
        command = args[0],
        projectFlag = command === 'offline' ? '--project-config' : '--config';
    let projectConfigFile = null;
    // Process for
    for (let position = 1; position < args.length; position++) {
        const argument = args[position];
        if (argument !== projectFlag && !argument.startsWith(`${projectFlag}=`)) continue;
        const result = readFlagValue(args, position, projectFlag);
        projectConfigFile = resolve(invocationDirectory, result.value);
        args.splice(position, result.consumed + 1);
        position--;
    }
    const result = parseCLIArgumentsInternal(args, invocationDirectory, parserOptions);
    if (projectConfigFile)
        Object.defineProperty(result, 'projectConfigFile', {
            value: projectConfigFile,
            enumerable: true,
        });
    Object.defineProperty(result, 'invocationDirectory', {
        value: invocationDirectory,
        enumerable: false,
    });
    Object.defineProperty(result, 'rawArguments', {
        value: [...argv],
        enumerable: false,
    });
    return result;
};

export const applyProjectConfiguration = // Run this operation
    async (options) => {
        const commands = new Set([
            'serve',
            'create',
            'skeleton',
            'audit',
            'init',
            'validate',
            'manifest',
            'routes',
            'watch',
            'offline',
            'types',
            'schema',
        ]);
        if (!commands.has(options.command)) return options;
        const { loadProjectConfig } = await import('../server/project-config.mjs');
        // Load the normalized project configuration after activating its command module
        const { config } = await loadProjectConfig({
            configFile: options.projectConfigFile,
            invocationDirectory: options.invocationDirectory || process.cwd(),
            optional: true,
        });

        const next = {
            // Configure this value
            ...options,
            projectConfig: config,
        };
        if (options.command === 'manifest') {
            const defaultDirectory = resolve(options.invocationDirectory || process.cwd(), 'components');
            if (options.directory === defaultDirectory && config.components?.directory)
                next.directory = config.components.directory;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out' || argument.startsWith('--out='),
                )
            )
                next.outFile = config.components?.manifest || options.outFile;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--infer' || argument.startsWith('--infer='),
                )
            )
                next.inference = config.components?.inference || options.inference;
        } else if (options.command === 'types') {
            next.manifestFile = options.manifestFile || config.components?.manifest;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out' || argument.startsWith('--out='),
                )
            )
                next.outFile = config.contracts?.types || options.outFile;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--custom-elements-out' || argument.startsWith('--custom-elements-out='),
                )
            )
                next.customElementsFile = config.contracts?.customElements || options.customElementsFile;
        } else if (options.command === 'audit') {
            next.baselineFile = options.baselineFile || config.audit?.baseline;
            next.suppressionsFile = options.suppressionsFile || config.audit?.suppressions;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--root' || argument.startsWith('--root='),
                )
            )
                next.root = config.audit?.root || options.root;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--route' || argument.startsWith('--route='),
                )
            )
                next.routes = options.routes.length ? options.routes : config.audit?.routes || options.routes;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out' || argument.startsWith('--out='),
                )
            )
                next.outFile = config.audit?.out || config.audit?.outFile || options.outFile;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--format' || argument.startsWith('--format='),
                )
            )
                next.format = config.audit?.format || options.format;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--timeout' || argument.startsWith('--timeout='),
                )
            )
                next.timeout = config.audit?.timeout || options.timeout;
            if (!next.routes.length)
                throw new TypeError('The audit command requires configured routes or a route argument.');
        } else if (options.command === 'routes') {
            next.manifestFile = options.manifestFile || config.routes?.manifest || config.components?.manifest;
            next.outDir = options.outDir || config.routes?.outDir;
            next.target = options.target || config.routes?.target;
            next.entries = options.routes.length
                ? options.routes.map(
                      // Run this operation
                      (path) => ({
                          // Configure this value
                          key: path,
                          path,
                          discover: true,
                      }),
                  )
                : config.routes?.entries || [];
            next.root = config.root;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--timeout' || argument.startsWith('--timeout='),
                )
            )
                next.timeout = config.routes?.timeout || options.timeout;
            next.browserType = config.routes?.browserType;
        } else if (options.command === 'watch') {
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--debounce' || argument.startsWith('--debounce='),
                )
            )
                next.debounce = config.watch?.debounce ?? options.debounce;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--poll-interval' || argument.startsWith('--poll-interval='),
                )
            )
                next.pollInterval = config.watch?.pollInterval ?? options.pollInterval;
        } else if (options.command === 'skeleton') {
            next.target = options.target || config.skeleton?.target;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--root' || argument.startsWith('--root='),
                )
            )
                next.root = config.skeleton?.root || options.root;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out-dir' || argument.startsWith('--out-dir='),
                )
            )
                next.outDir = config.skeleton?.outDir || options.outDir;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--timeout' || argument.startsWith('--timeout='),
                )
            )
                next.timeout = config.skeleton?.timeout || options.timeout;
            if (!next.target)
                throw new TypeError('The skeleton command requires a configured URL, directory, or HTML target.');
        } else if (options.command === 'offline') {
            next.manifestFile = options.manifestFile || config.offline?.manifest || config.components?.manifest;
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out-dir' || argument.startsWith('--out-dir='),
                )
            )
                next.outDir = config.offline?.outDir || options.outDir;
            if (!next.manifestFile)
                throw new TypeError('The offline command requires a configured component manifest or argument.');
        } else if (options.command === 'schema') {
            const field =
                options.kind === 'component'
                    ? 'componentSchema'
                    : options.kind === 'offline'
                      ? 'offlineSchema'
                      : 'manifestSchema';
            if (
                !options.rawArguments?.some(
                    // Run this operation
                    (argument) => argument === '--out' || argument.startsWith('--out='),
                )
            )
                next.outFile = config.contracts?.[field] || options.outFile;
        } else if (options.command === 'init') {
            const defaultDirectory = resolve(options.invocationDirectory || process.cwd(), 'components');
            if (options.directory === defaultDirectory && config.components?.directory)
                next.directory = config.components.directory;
            next.manifestFile = options.manifestFile || config.components?.manifest;
        } else if (options.command === 'serve') {
            if (!options.target && config.root) next.root = config.root;
        }
        if (options.command === 'types' && !next.manifestFile)
            throw new TypeError('The types command requires a configured component manifest or argument.');
        return next;
    };

// Resolve a positional directory or HTML file into normalized server options
export const resolveServeTarget = async (options) => {
    const { target, command: _command, ...serverOptions } = options;
    if (!target)
        return {
            ...serverOptions,
            index: 'index.html',
        };
    const targetPath = resolve(serverOptions.root, target);
    let targetInfo;
    // Guard the resolve serve target operation against runtime failures
    try {
        targetInfo = await stat(targetPath);
    } catch {
        throw new TypeError(`Serve path does not exist: ${target}`);
    }
    if (targetInfo.isDirectory())
        return {
            ...serverOptions,
            root: targetPath,
            index: 'index.html',
        };
    if (targetInfo.isFile())
        return {
            ...serverOptions,
            index: targetPath,
        };
    throw new TypeError(`Serve path must be a directory or .html file: ${target}`);
};

// Resolve a remote URL or reuse the contained local serve-target contract for capture
export const resolveSkeletonTarget = async (options) => {
    let parsedUrl = null;
    // Guard the resolve skeleton target operation against runtime failures
    try {
        parsedUrl = new URL(options.target);
    } catch {
        // Fall through to local path resolution
    }
    if (parsedUrl && ['http:', 'https:'].includes(parsedUrl.protocol)) {
        return {
            ...options,
            target: {
                type: 'url',
                url: parsedUrl.toString(),
            },
            outDir: options.outDir || resolve(options.root, 'skeletons'),
        };
    }

    const local = await resolveServeTarget({
        command: 'serve',
        help: false,
        host: '127.0.0.1',
        port: 0,
        root: options.root,
        target: options.target,
    });
    return {
        ...options,
        target: {
            type: 'local',
            root: local.root,
            index: local.index,
        },
        outDir: options.outDir || resolve(local.root, 'skeletons'),
    };
};

// Start the development server and bind graceful process shutdown handlers
export const runCLI = async (argv = process.argv.slice(2)) => {
    let options = parseCLIArguments(argv, process.env.INIT_CWD || process.cwd(), {
        allowConfigured: true,
    });
    if (options.help) {
        process.stdout.write(usage);
        return null;
    }
    options = await applyProjectConfiguration(options);
    if (options.command === 'watch') {
        const { startProjectWatcher } = await import('../server/watch-coordinator.mjs'),
            watcher = await startProjectWatcher({
                config: options.projectConfig,
                tasks: options.tasks,
                includeExpensive: options.includeExpensive,
                debounce: options.debounce,
                pollInterval: options.pollInterval,
                // Run this operation
                onProgress: ({ task, status, error }) => {
                    if (status === 'error') process.stderr.write(`[ACL Watch] ${task}: ${error.message}\n`);
                    else if (status === 'complete') process.stdout.write(`[ACL Watch] ${task}: complete\n`);
                },
            });
        process.stdout.write(`[ACL Watch] Watching ${options.projectConfig.root}\n`);
        let stopping = false;
        const stop = // Run this operation
            async () => {
                if (stopping) return;
                stopping = true;
                await watcher.close();
            };
        process.once('SIGINT', stop);
        process.once('SIGTERM', stop);
        return watcher;
    }
    if (options.command === 'routes') {
        const { generateRouteManifests } = await import('../server/route-generator.mjs'),
            result = await generateRouteManifests(options);
        if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else {
            result.warnings.forEach((warning) => process.stdout.write(`[ACL Routes] Warning: ${warning}\n`));
            process.stdout.write(
                `[ACL Routes] ${result.dryRun ? 'Planned' : 'Created'} ${Object.keys(result.index.routes).length} route manifest(s).\n`,
            );
        }
        return result;
    }
    if (options.command === 'offline') {
        const { generateOfflineBundle } = await import('../server/offline-generator.mjs');
        // Execute the selected offline generator only after its scoped import
        const result = await generateOfflineBundle(options);
        if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else {
            process.stdout.write(
                `[ACL Offline] ${result.dryRun ? 'Planned' : 'Created'} ${result.manifest.entries.length} precache entries.\n`,
            );
            result.files.forEach(
                // Process the current item
                (path) => process.stdout.write(`[ACL Offline] File: ${path}\n`),
            );
        }
        return result;
    }
    if (options.command === 'create') {
        const { createStarterProject } = await import('../server/starter-generator.mjs'),
            result = await createStarterProject(options);
        if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else
            process.stdout.write(
                `[ACL Create] ${result.dryRun ? 'Planned' : 'Created'} ${result.template} starter with ${result.files.length} files in ${result.directory}.\n`,
            );
        return result;
    }
    if (options.command === 'types' || options.command === 'schema') {
        const { generateContractArtifacts, generateManifestSchema } = await import('../server/contract-generator.mjs');
        // Dispatch the selected contract generator after its scoped import
        const result =
            options.command === 'types'
                ? await generateContractArtifacts(options)
                : await generateManifestSchema(options);
        if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else {
            process.stdout.write(
                `[ACL ${options.command === 'types' ? 'Types' : 'Schema'}] ${result.dryRun ? 'Planned' : 'Created'} ${result.files.length || (options.command === 'types' ? 2 : 1)} artifact(s).\n`,
            );
            result.files.forEach(
                // Process the current item
                (path) =>
                    process.stdout.write(`[ACL ${options.command === 'types' ? 'Types' : 'Schema'}] File: ${path}\n`),
            );
        }
        return result;
    }
    if (options.command === 'init' || options.command === 'manifest' || options.command === 'validate') {
        const { generateComponentManifest, initializeComponent, validateProject } =
            await import('../server/project-tools.mjs');
        let result;
        if (options.command === 'init') result = await initializeComponent(options);
        else if (options.command === 'manifest') result = await generateComponentManifest(options);
        else
            result = {
                command: 'validate',
                ...(await validateProject(options.target)),
            };

        if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
        else if (options.command === 'validate') {
            result.diagnostics.forEach(
                // Process the current item
                (item) => process.stdout.write(`[${item.severity}] ${item.code}: ${item.message}\n`),
            );
            process.stdout.write(result.valid ? '[ACL Validate] Valid.\n' : '[ACL Validate] Validation failed.\n');
        } else {
            result.warnings?.forEach((warning) => process.stdout.write(`[ACL Manifest] Warning: ${warning}\n`));
            result.diagnostics?.forEach((item) =>
                process.stdout.write(`[ACL Manifest] ${item.code}: ${item.message}\n`),
            );
            if (result.update)
                result.changes.forEach((change) =>
                    process.stdout.write(`[ACL Manifest] ${change.kind}: ${change.path || '<root>'}\n`),
                );
            process.stdout.write(
                `[ACL ${options.command === 'init' ? 'Init' : 'Manifest'}] ${result.dryRun ? 'Planned' : 'Created'} ${result.files.length || 1} artifact${result.files.length === 1 ? '' : 's'}.\n`,
            );
            if (result.dryRun) process.stdout.write(result.content || result.source);
            result.files.forEach(
                // Process the current item
                (path) =>
                    process.stdout.write(`[ACL ${options.command === 'init' ? 'Init' : 'Manifest'}] File: ${path}\n`),
            );
        }
        if (options.command === 'validate' && !result.valid) process.exitCode = 1;
        return result;
    }
    if (options.command === 'skeleton') {
        process.stdout.write(`[ACL Skeleton] Resolving target: ${options.target}\n`);
        const { generateSkeletons } = await import('../server/skeleton-generator.mjs'),
            resolvedOptions = await resolveSkeletonTarget(options),
            result = await generateSkeletons(resolvedOptions, {
                // Run the on progress operation
                onProgress: (message) => process.stdout.write(`[ACL Skeleton] ${message}\n`),
            });
        process.stdout.write(
            `[ACL Skeleton] Generated ${result.components.length} ${result.mode} component skeleton${result.components.length === 1 ? '' : 's'}.\n`,
        );
        result.files.forEach(
            // Process the current item
            (path) => process.stdout.write(`[ACL Skeleton] File: ${path}\n`),
        );
        result.warnings.forEach(
            // Process the current item
            (warning) => process.stdout.write(`[ACL Skeleton] Warning: ${warning}\n`),
        );
        result.failures.forEach(
            // Process the current item
            (failure) => process.stdout.write(`[ACL Skeleton] Partial failure: ${failure}\n`),
        );
        return result;
    }
    if (options.command === 'audit') {
        const { runAccessibilityAudit } = await import('../server/audit-runner.mjs'),
            result = await runAccessibilityAudit(options);
        if (!options.outFile || options.format === 'console') process.stdout.write(result.output);
        if (options.outFile) process.stdout.write(`[ACL Audit] Report: ${options.outFile}\n`);
        if (result.report.failed) process.exitCode = 1;
        return result;
    }
    const { startACLDevServer } = await import('../server/dev-server.mjs'),
        app = await startACLDevServer(await resolveServeTarget(options));
    process.stdout.write(`[ACL Serve] ${app.url}\n`);
    process.stdout.write(`[ACL Serve] Root: ${app.root}\n`);
    process.stdout.write(`[ACL Serve] Index: ${app.indexPath}\n`);

    let stopping = false;
    // Close the active server at most once across multiple termination signals
    const stop = async () => {
        // Stop
        if (stopping) return;
        stopping = true;
        await app.close();
    };
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
    return app;
};

// Execute the CLI only when this module is the process entry point
const isDirectRun =
    process.argv[1] && (await realpath(resolve(process.argv[1]))) === (await realpath(fileURLToPath(import.meta.url)));
if (isDirectRun) {
    // Guard the operation against runtime failures
    try {
        await runCLI();
    } catch (error) {
        const command = process.argv[2],
            label = command ? command[0].toUpperCase() + command.slice(1) : 'CLI';
        process.stderr.write(`[ACL ${label}] ${error.message}\n`);
        process.exitCode = 1;
    }
}
