import { createHash } from 'node:crypto';
import { readFile, readdir, stat } from 'node:fs/promises';
import { basename, dirname, extname, relative, resolve, sep } from 'node:path';
import { normalizeManifest } from '../dist/runtime/registry.js';
import { validateCustomElementName } from '../dist/runtime/config.js';
import { inspectComponentTemplate } from './template-inspector.mjs';
import { writeProjectFile } from './file-writer.mjs';

export { writeProjectFile } from './file-writer.mjs';

const toPosixPath = (value) => {
        // Run the to posix path operation
        return value.split(sep).join('/');
    },
    diagnostic = (code, message, { file = null, tag = null, severity = 'error', line = null, column = null } = {}) => {
        // Run the diagnostic operation
        return {
            code,
            severity,
            file,
            tag,
            line,
            column,
            message,
        };
    };

const pathExists = async (path) => {
    // Run the path exists operation
    try {
        return await stat(path);
    } catch (error) {
        if (error?.code === 'ENOENT') return null;
        throw error;
    }
};

const walkHtmlFiles = async (directory) => {
    // Walk html files
    const files = [];
    // Process each entry
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        if (entry.name.startsWith('.')) continue;
        const path = resolve(directory, entry.name);
        if (entry.isDirectory()) files.push(...(await walkHtmlFiles(path)));
        else if (entry.isFile() && ['.html', '.htm'].includes(extname(entry.name).toLowerCase())) files.push(path);
    }
    return files.sort();
};

// Run this operation
const componentTagFromPath = (path) => validateCustomElementName(basename(path, extname(path)).toLowerCase()),
    // Run this operation
    sidecarPathFor = (path) => path.replace(/\.(?:html?|HTML?)$/, '.acl.json'),
    // Run this operation
    hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value || {}, key);

// Run this operation
const normalizeStringList = (value, name, { customElements = false } = {}) => {
    if (!Array.isArray(value)) throw new TypeError(`${name} must be an array.`);
    // Run this operation
    const normalized = value.map((item) => {
        if (typeof item !== 'string' || !item.trim()) throw new TypeError(`${name} must contain non-empty strings.`);
        return customElements ? validateCustomElementName(item) : item.trim();
    });
    if (new Set(normalized).size !== normalized.length) throw new TypeError(`${name} must not contain duplicates.`);
    return normalized;
};

// Validate one component-local metadata document without allowing generated fields
export const normalizeComponentSidecar = (sidecar, tagName = null) => {
    if (!sidecar || typeof sidecar !== 'object' || Array.isArray(sidecar) || sidecar.version !== 1)
        throw new TypeError('Component metadata requires an object with version: 1.');
    const allowed = new Set(['$schema', 'version', 'dependencies', 'groups', 'options', 'metadata']),
        // Run this operation
        unknown = Object.keys(sidecar).filter((key) => !allowed.has(key));
    if (unknown.length) throw new TypeError(`Component metadata contains unsupported key "${unknown[0]}".`);
    if (hasOwn(sidecar, 'dependencies'))
        normalizeStringList(sidecar.dependencies, 'Component metadata dependencies', { customElements: true });
    if (hasOwn(sidecar, 'groups')) normalizeStringList(sidecar.groups, 'Component metadata groups');
    if (hasOwn(sidecar, 'options')) {
        if (!sidecar.options || typeof sidecar.options !== 'object' || Array.isArray(sidecar.options))
            throw new TypeError('Component metadata options must be an object.');
        if (hasOwn(sidecar.options, 'templateRevision'))
            throw new TypeError('Component metadata cannot declare generated option "templateRevision".');
    }
    if (hasOwn(sidecar, 'metadata')) {
        normalizeManifest({
            version: 1,
            components: {
                [tagName || 'metadata-check']: {
                    source: 'metadata-check.html',
                    metadata: sidecar.metadata,
                },
            },
        });
    }
    return sidecar;
};

// Run this operation
const loadComponentSidecar = async (file, tagName) => {
    const path = sidecarPathFor(file);
    if (!(await pathExists(path))) return null;
    const value = normalizeComponentSidecar(JSON.parse(await readFile(path, 'utf8')), tagName);
    return {
        path,
        value,
    };
};

// Run this operation
const createManifestRecords = async ({ directory, outFile, inference = 'safe' }) => {
    const files = await walkHtmlFiles(directory),
        records = await Promise.all(
            // Run this operation
            files.map(async (file) => {
                const tag = componentTagFromPath(file);
                return {
                    file,
                    tag,
                    source: await readFile(file, 'utf8'),
                    sidecar: await loadComponentSidecar(file, tag),
                };
            }),
        );
    // Run this operation
    if (new Set(records.map((record) => record.tag)).size !== records.length)
        throw new TypeError('Component filenames must produce unique custom-element names.');
    // Run this operation
    const knownTags = records.map((record) => record.tag),
        outputDirectory = dirname(outFile);
    // Run this operation
    for (const record of records) {
        const inspected = inspectComponentTemplate(record.source, { knownTags });
        // Run this operation
        record.inferredDependencies = inspected.dependencies.filter((tag) => tag !== record.tag);
        record.inference = inspected;
        record.inferenceMode = inference;
        record.sourcePath = toPosixPath(relative(outputDirectory, record.file));
        record.revision = `sha256-${createHash('sha256').update(record.source).digest('base64url')}`;
    }
    return records;
};

// Run this operation
const manifestFromRecords = (records, { basePath = null } = {}) => {
    const components = {},
        groups = {};
    // Run this operation
    for (const record of records) {
        const sidecar = record.sidecar?.value,
            declaredDependencies = sidecar?.dependencies || [],
            dependencies = [...new Set([...record.inferredDependencies, ...declaredDependencies])],
            inferredOptions =
                record.inferenceMode === 'safe'
                    ? {
                          ...(record.inference.externalCss.length ? { externalCss: record.inference.externalCss } : {}),
                          ...(record.inference.externalScripts.length
                              ? { externalScripts: record.inference.externalScripts }
                              : {}),
                      }
                    : {},
            inferredMetadata =
                record.inferenceMode === 'safe' && record.inference.slots.length
                    ? {
                          slots: Object.fromEntries(
                              record.inference.slots.map(
                                  // Run this operation
                                  (name) => [name, {}],
                              ),
                          ),
                      }
                    : null,
            authoredMetadata = sidecar && hasOwn(sidecar, 'metadata') ? sidecar.metadata : null,
            metadata =
                inferredMetadata || authoredMetadata
                    ? {
                          ...(inferredMetadata || {}),
                          ...(authoredMetadata || {}),
                          ...(inferredMetadata?.slots || authoredMetadata?.slots
                              ? {
                                    slots: {
                                        ...(inferredMetadata?.slots || {}),
                                        ...(authoredMetadata?.slots || {}),
                                    },
                                }
                              : {}),
                      }
                    : null;
        components[record.tag] = {
            source: record.sourcePath,
            dependencies,
            options: {
                ...inferredOptions,
                ...(sidecar?.options || {}),
                templateRevision: record.revision,
            },
            ...(metadata ? { metadata } : {}),
        };
        // Run this operation
        for (const group of sidecar?.groups || []) (groups[group] ||= []).push(record.tag);
    }
    return {
        version: 1,
        ...(basePath ? { basePath } : {}),
        components,
        groups,
    };
};

// Build a stable version-one manifest from component template files
export const createComponentManifest = async ({ directory, outFile, basePath = null, inference = 'safe' } = {}) => {
    return manifestFromRecords(
        await createManifestRecords({
            // Resolve paths relative to the generated manifest
            directory,
            outFile,
            inference,
        }),
        { basePath },
    );
};

// Run this operation
const createManifestDiff = (before, after, path = '') => {
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    if (
        before &&
        after &&
        typeof before === 'object' &&
        typeof after === 'object' &&
        !Array.isArray(before) &&
        !Array.isArray(after)
    ) {
        // Run this operation
        return [...new Set([...Object.keys(before), ...Object.keys(after)])].flatMap((key) =>
            createManifestDiff(before[key], after[key], path ? `${path}.${key}` : key),
        );
    }
    return [
        {
            path,
            kind: before === undefined ? 'added' : after === undefined ? 'removed' : 'changed',
            ...(before === undefined ? {} : { before }),
            ...(after === undefined ? {} : { after }),
        },
    ];
};

// Run this operation
const mergeGeneratedManifest = (existing, generated, records, { prune = false } = {}) => {
    normalizeManifest(existing);
    const components = {},
        warnings = [],
        // Run this operation
        discovered = new Set(records.map((record) => record.tag));
    // Run this operation
    for (const record of records) {
        const generatedEntry = generated.components[record.tag],
            rawExisting = existing.components?.[record.tag],
            previous = typeof rawExisting === 'string' ? { source: rawExisting } : rawExisting || {},
            sidecar = record.sidecar?.value,
            dependencies =
                sidecar && hasOwn(sidecar, 'dependencies')
                    ? generatedEntry.dependencies
                    : [...new Set([...generatedEntry.dependencies, ...(previous.dependencies || [])])],
            options =
                sidecar && hasOwn(sidecar, 'options')
                    ? generatedEntry.options
                    : {
                          ...(generatedEntry.options || {}),
                          ...(previous.options || {}),
                          templateRevision: generatedEntry.options.templateRevision,
                      },
            metadata =
                sidecar && hasOwn(sidecar, 'metadata')
                    ? sidecar.metadata
                    : generatedEntry.metadata || previous.metadata
                      ? {
                            ...(generatedEntry.metadata || {}),
                            ...(previous.metadata || {}),
                            ...(generatedEntry.metadata?.slots || previous.metadata?.slots
                                ? {
                                      slots: {
                                          ...(generatedEntry.metadata?.slots || {}),
                                          ...(previous.metadata?.slots || {}),
                                      },
                                  }
                                : {}),
                        }
                      : null;
        components[record.tag] = {
            source: generatedEntry.source,
            dependencies,
            options,
            ...(metadata == null ? {} : { metadata }),
        };
    }
    // Run this operation
    for (const [tag, entry] of Object.entries(existing.components || {})) {
        if (discovered.has(tag)) continue;
        if (prune) continue;
        components[tag] = entry;
        warnings.push(`Preserved <${tag}> because no matching template was found; use --prune to remove it.`);
    }

    // Run this operation
    const groups = Object.fromEntries(Object.entries(existing.groups || {}).map(([name, tags]) => [name, [...tags]]));
    // Run this operation
    for (const record of records) {
        const sidecar = record.sidecar?.value;
        if (!sidecar || !hasOwn(sidecar, 'groups')) continue;
        // Run this operation
        for (const tags of Object.values(groups)) {
            const index = tags.indexOf(record.tag);
            if (index >= 0) tags.splice(index, 1);
        }
        // Run this operation
        for (const group of sidecar.groups) {
            const tags = (groups[group] ||= []);
            if (!tags.includes(record.tag)) tags.push(record.tag);
        }
    }
    if (prune) {
        // Run this operation
        for (const [name, tags] of Object.entries(groups)) {
            // Run this operation
            groups[name] = tags.filter((tag) => components[tag]);
            if (!groups[name].length) delete groups[name];
        }
    }
    return {
        manifest: {
            ...existing,
            version: 1,
            components,
            groups,
        },
        warnings,
    };
};

// Validate generated manifests through the same runtime normalization contract
export const generateComponentManifest = async ({
    directory,
    outFile,
    force = false,
    dryRun = false,
    update = false,
    prune = false,
    inference = 'safe',
} = {}) => {
    if (prune && !update) throw new TypeError('Manifest pruning requires --update.');
    if (!['safe', 'report', 'off'].includes(inference))
        throw new TypeError('Manifest inference must be safe, report, or off.');
    const records = await createManifestRecords({
            // Resolve all source paths before merging authored state
            directory,
            outFile,
            inference,
        }),
        generated = manifestFromRecords(records);
    let manifest = generated,
        warnings = [],
        previous = null;
    if (update && (await pathExists(outFile))) {
        previous = JSON.parse(await readFile(outFile, 'utf8'));
        ({ manifest, warnings } = mergeGeneratedManifest(previous, generated, records, { prune }));
    }
    normalizeManifest(manifest);
    const content = `${JSON.stringify(manifest, null, 2)}\n`;
    if (!dryRun) await writeProjectFile(outFile, content, { force: force || update });
    return {
        command: 'manifest',
        files: dryRun ? [] : [outFile],
        manifest,
        content,
        changes: createManifestDiff(previous, manifest),
        warnings,
        diagnostics:
            inference === 'off'
                ? []
                : records.flatMap((record) => {
                      const findings = [];
                      if (record.inference.suggestions.props.length)
                          findings.push({
                              code: 'ACL_INFERRED_PROPS',
                              severity: 'info',
                              file: record.file,
                              tag: record.tag,
                              values: record.inference.suggestions.props,
                              message: `Possible props: ${record.inference.suggestions.props.join(', ')}`,
                          });
                      if (record.inference.suggestions.events.length)
                          findings.push({
                              code: 'ACL_INFERRED_EVENTS',
                              severity: 'info',
                              file: record.file,
                              tag: record.tag,
                              values: record.inference.suggestions.events,
                              message: `Possible emitted events: ${record.inference.suggestions.events.join(', ')}`,
                          });
                      if (record.inference.suggestions.data.length)
                          findings.push({
                              code: 'ACL_INFERRED_DATA',
                              severity: 'info',
                              file: record.file,
                              tag: record.tag,
                              values: record.inference.suggestions.data,
                              message: `Declarative data settings: ${record.inference.suggestions.data.join(', ')}`,
                          });
                      return findings;
                  }),
        inference,
        update,
        prune,
        dryRun,
    };
};

// Scaffold one component and optionally add it to an existing version-one manifest
export const initializeComponent = async ({
    tag,
    directory,
    manifestFile = null,
    shadow = false,
    force = false,
    dryRun = false,
} = {}) => {
    const normalizedTag = validateCustomElementName(tag),
        componentFile = resolve(directory, `${normalizedTag}.html`),
        metadataFile = sidecarPathFor(componentFile),
        source = `<section x-data="{ props: $el.$props }">\n    <h2>${normalizedTag}</h2>\n</section>\n`,
        sidecar = {
            version: 1,
            ...(shadow ? { options: { shadow: true } } : {}),
        },
        revision = `sha256-${createHash('sha256').update(source).digest('base64url')}`,
        writes = [
            {
                path: componentFile,
                content: source,
                force,
            },
            {
                path: metadataFile,
                content: `${JSON.stringify(sidecar, null, 2)}\n`,
                force,
            },
        ];
    let manifest = null;
    if (manifestFile) {
        const existing = await pathExists(manifestFile);
        manifest = existing
            ? JSON.parse(await readFile(manifestFile, 'utf8'))
            : {
                  version: 1,
                  components: {},
                  groups: {},
              };
        normalizeManifest(manifest);
        if (
            Object.keys(manifest.components).some(
                // Check the current item
                (name) => name.toLowerCase() === normalizedTag,
            ) &&
            !force
        )
            throw new TypeError(`Manifest already contains <${normalizedTag}>.`);
        manifest.components[normalizedTag] = {
            source: toPosixPath(relative(dirname(manifestFile), componentFile)),
            dependencies: [],
            options: {
                ...(shadow ? { shadow: true } : {}),
                templateRevision: revision,
            },
        };
        normalizeManifest(manifest);
        writes.push({
            path: manifestFile,
            content: `${JSON.stringify(manifest, null, 2)}\n`,
            force: true,
        });
    }
    if (!dryRun) {
        // Process each write
        for (const write of writes) await writeProjectFile(write.path, write.content, { force: write.force });
    }
    return {
        command: 'init',
        tag: normalizedTag,
        files: dryRun
            ? []
            : writes.map(
                  // Transform the current item
                  (write) => write.path,
              ),
        source,
        manifest,
        dryRun,
    };
};

// Report every discoverable template problem instead of failing on the first file
const validateTemplateFiles = async (directory) => {
    const diagnostics = [],
        files = await walkHtmlFiles(directory),
        tags = new Map();
    // Process each file
    for (const file of files) {
        // Guard the validate template files operation against runtime failures
        try {
            const tag = componentTagFromPath(file);
            if (tags.has(tag))
                diagnostics.push(
                    diagnostic('ACL_DUPLICATE_COMPONENT', `Duplicate component tag <${tag}>.`, {
                        file,
                        tag,
                    }),
                );
            else tags.set(tag, file);
        } catch (error) {
            diagnostics.push(diagnostic('ACL_INVALID_COMPONENT_NAME', error.message, { file }));
        }
        const source = await readFile(file, 'utf8'),
            inspected = inspectComponentTemplate(source);
        // Process each structurally parsed declarative JSON attribute
        for (const attribute of inspected.declarativeJson) {
            // Guard the validate template files operation against runtime failures
            try {
                JSON.parse(attribute.value);
            } catch {
                diagnostics.push(
                    diagnostic('ACL_INVALID_DECLARATIVE_JSON', `Invalid JSON in ${attribute.name}.`, {
                        file,
                        line: attribute.line,
                        column: attribute.column,
                    }),
                );
            }
        }
        const sidecarPath = sidecarPathFor(file);
        if (await pathExists(sidecarPath)) {
            // Guard sidecar parsing so directory validation can report every file
            try {
                normalizeComponentSidecar(JSON.parse(await readFile(sidecarPath, 'utf8')), componentTagFromPath(file));
            } catch (error) {
                diagnostics.push(diagnostic('ACL_INVALID_COMPONENT_METADATA', error.message, { file: sidecarPath }));
            }
        }
    }
    return diagnostics;
};

// Validate a manifest or a component directory without modifying project files
export const validateProject = async (target) => {
    const targetInfo = await pathExists(target);
    if (!targetInfo)
        return {
            valid: false,
            diagnostics: [diagnostic('ACL_TARGET_NOT_FOUND', `Target does not exist: ${target}`, { file: target })],
        };
    const diagnostics = [];
    if (targetInfo.isDirectory()) {
        diagnostics.push(...(await validateTemplateFiles(target)));
        const manifestFile = resolve(target, 'acl-manifest.json');
        if (await pathExists(manifestFile)) {
            const nested = await validateProject(manifestFile);
            diagnostics.push(...nested.diagnostics);
        }
    } else {
        // Guard the validate project operation against runtime failures
        try {
            const manifest = JSON.parse(await readFile(target, 'utf8'));
            normalizeManifest(manifest);
            // Process each entry
            for (const [tag, entry] of Object.entries(manifest.components)) {
                const definition = typeof entry === 'string' ? { source: entry } : entry;
                if (
                    typeof definition.source === 'string' &&
                    !/^(?:[A-Za-z][A-Za-z\d+.-]*:|\/|#)/.test(definition.source)
                ) {
                    const sourcePath = resolve(dirname(target), manifest.basePath || '', definition.source);
                    if (!(await pathExists(sourcePath)))
                        diagnostics.push(
                            diagnostic(
                                'ACL_SOURCE_NOT_FOUND',
                                `Source for <${tag}> does not exist: ${definition.source}`,
                                {
                                    file: target,
                                    tag,
                                },
                            ),
                        );
                }
            }
        } catch (error) {
            diagnostics.push(diagnostic('ACL_INVALID_MANIFEST', error.message, { file: target }));
        }
    }
    return {
        valid: diagnostics.every(
            // Check every item
            (item) => item.severity !== 'error',
        ),
        diagnostics,
    };
};
