import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { normalizeManifest } from '../dist/runtime/registry.js';
import { writeProjectFile } from './file-writer.mjs';

const typeName = (tag) => {
        // Run the type name operation
        return `${tag
            .split(/[^a-z0-9]+/i)
            .filter(Boolean)
            .map(
                // Transform the current item
                (part) => part[0].toUpperCase() + part.slice(1),
            )
            .join('')}Element`;
    },
    literal = (value) => {
        // Run the literal operation
        return value === null ? 'null' : JSON.stringify(value);
    },
    serializedType = (value) => {
        // Run the serialized type operation
        return (
            {
                String: 'string',
                Number: 'number',
                Boolean: 'boolean',
                Array: 'unknown[]',
                Object: 'Record<string, unknown>',
                string: 'string',
                number: 'number',
                integer: 'number',
                boolean: 'boolean',
                array: 'unknown[]',
                object: 'Record<string, unknown>',
            }[value] || 'unknown'
        );
    };

const SUPPORTED_PROP_TYPES = new Set([
    'String',
    'Number',
    'Boolean',
    'Array',
    'Object',
    'string',
    'number',
    'integer',
    'boolean',
    'array',
    'object',
]);

const validateGeneratorContracts = (normalized) => {
    // Validate generator contracts
    normalized.components.forEach((component) => {
        // Process the current item
        Object.entries(component.options?.attributes || {}).forEach(([name, definition]) => {
            // Process the current item
            if (!/^[A-Za-z_][A-Za-z0-9_.:-]*$/.test(name))
                throw new TypeError(
                    `[ACL] Cannot generate contracts for invalid prop name "${name}" on <${component.tagName}>.`,
                );
            const configured =
                    definition && typeof definition === 'object' && !Array.isArray(definition)
                        ? definition.type
                        : definition,
                type = typeof configured === 'string' ? configured : configured?.name;
            if (!SUPPORTED_PROP_TYPES.has(type))
                throw new TypeError(
                    `[ACL] Cannot generate contracts for unsupported prop type "${String(type)}" on <${component.tagName}>.`,
                );
        });
    });
    return normalized;
};

const contractType = (schema) => {
    // Run the contract type operation
    if (!schema || schema.type === 'unknown') return 'unknown';
    let output;
    if (schema.enum?.length) output = schema.enum.map(literal).join(' | ');
    else if (schema.type === 'object') {
        const required = new Set(schema.required || []),
            properties = Object.entries(schema.properties || {}).map(
                // Transform the current item
                ([name, child]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${contractType(child)};`,
            );
        output = `{ ${properties.join(' ')} }`;
    } else if (schema.type === 'array') output = `Array<${contractType(schema.items)}>`;
    else if (schema.type === 'null') output = 'null';
    else output = serializedType(schema.type);
    return schema.nullable && !output.includes('null') ? `${output} | null` : output;
};

const propContract = (definition) => {
    // Run the prop contract operation
    const config =
            definition && typeof definition === 'object' && !Array.isArray(definition)
                ? definition
                : { type: definition },
        base = serializedType(typeof config.type === 'string' ? config.type : config.type?.name);
    if (Array.isArray(config.options) && config.options.length)
        return config.options.map(literal).join(' | ') + (config.nullable ? ' | null' : '');
    return base + (config.nullable ? ' | null' : '');
};

export const renderComponentDeclarations = (manifest) => {
    // Render component declarations
    const normalized = validateGeneratorContracts(normalizeManifest(manifest)),
        blocks = normalized.components.map((component) => {
            // Transform the current item
            const name = typeName(component.tagName),
                propsName = `${name}Props`,
                eventsName = `${name}EventMap`,
                attributes = component.options?.attributes || {},
                events = component.metadata?.events || {},
                props = Object.entries(attributes).map(([prop, definition]) => {
                    // Transform the current item
                    const config = definition && typeof definition === 'object' ? definition : {};
                    return `    ${JSON.stringify(prop)}${config.required ? '' : '?'}: ${propContract(definition)};`;
                }),
                eventLines = Object.entries(events).map(
                    // Transform the current item
                    ([event, metadata]) =>
                        `    ${JSON.stringify(event)}: CustomEvent<${contractType(metadata.detail)}>;`,
                );
            return (
                `export interface ${propsName} extends ACLProps {\n${props.join('\n')}\n}\n\n` +
                `export interface ${eventsName} {\n${eventLines.join('\n')}\n}\n\n` +
                `export interface ${name} extends HTMLElement {\n    $props: ${propsName};\n${Object.entries(attributes)
                    .map(
                        // Transform the current item
                        ([prop, definition]) => `    ${JSON.stringify(prop)}: ${propContract(definition)};`,
                    )
                    .join('\n')}\n` +
                `    addEventListener<K extends keyof ${eventsName}>(type: K, listener: (this: ${name}, event: ${eventsName}[K]) => void, options?: boolean | AddEventListenerOptions): void;\n}`
            );
        }),
        tagMap = normalized.components
            .map(
                // Transform the current item
                (component) => `        ${JSON.stringify(component.tagName)}: ${typeName(component.tagName)};`,
            )
            .join('\n');
    return `// Generated by alpine-component-loader types.\nimport type { ACLProps } from 'alpine-component-loader';\n\n${blocks.join('\n\n')}\n\ndeclare global {\n    interface HTMLElementTagNameMap {\n${tagMap}\n    }\n}\n\nexport {};\n`;
};

export const renderCustomElementsManifest = (manifest) => {
    // Render custom elements manifest
    const normalized = validateGeneratorContracts(normalizeManifest(manifest));
    return {
        schemaVersion: '2.1.0',
        readme: '',
        modules: [
            {
                kind: 'javascript-module',
                path: 'acl-components',
                declarations: normalized.components.map(
                    // Transform the current item
                    (component) => ({
                        kind: 'class',
                        customElement: true,
                        name: typeName(component.tagName),
                        tagName: component.tagName,
                        ...(component.metadata?.description ? { description: component.metadata.description } : {}),
                        members: Object.entries(component.options?.attributes || {}).map(
                            // Transform the current item
                            ([name, definition]) => ({
                                kind: 'field',
                                name,
                                attribute: name,
                                type: { text: propContract(definition) },
                            }),
                        ),
                        attributes: Object.entries(component.options?.attributes || {}).map(
                            // Transform the current item
                            ([name, definition]) => ({
                                name,
                                fieldName: name,
                                type: { text: propContract(definition) },
                            }),
                        ),
                        events: Object.entries(component.metadata?.events || {}).map(
                            // Transform the current item
                            ([name, event]) => ({
                                name,
                                type: { text: `CustomEvent<${contractType(event.detail)}>` },
                                ...(event.description ? { description: event.description } : {}),
                            }),
                        ),
                        slots: Object.entries(component.metadata?.slots || {}).map(
                            // Transform the current item
                            ([name, slot]) => ({
                                name: name === 'default' ? '' : name,
                                ...(slot.description ? { description: slot.description } : {}),
                            }),
                        ),
                    }),
                ),
            },
        ],
    };
};

export const ACL_MANIFEST_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Alpine Component Loader manifest v1',
    type: 'object',
    additionalProperties: false,
    required: ['version', 'components'],
    properties: {
        $schema: { type: 'string' },
        version: { const: 1 },
        basePath: { type: 'string' },
        groups: {
            type: 'object',
            additionalProperties: {
                type: 'array',
                items: { type: 'string' },
                uniqueItems: true,
            },
        },
        components: {
            type: 'object',
            additionalProperties: {
                oneOf: [
                    { type: 'string' },
                    {
                        type: 'object',
                        required: ['source'],
                        properties: {
                            source: { type: 'string' },
                            dependencies: {
                                type: 'array',
                                items: { type: 'string' },
                                uniqueItems: true,
                            },
                            options: { type: 'object' },
                            metadata: {
                                type: 'object',
                                additionalProperties: false,
                                properties: {
                                    description: { type: 'string' },
                                    events: {
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'object',
                                            additionalProperties: false,
                                            properties: {
                                                description: { type: 'string' },
                                                detail: { $ref: '#/$defs/contractSchema' },
                                            },
                                        },
                                    },
                                    slots: {
                                        type: 'object',
                                        additionalProperties: {
                                            type: 'object',
                                            additionalProperties: false,
                                            properties: { description: { type: 'string' } },
                                        },
                                    },
                                },
                            },
                        },
                        additionalProperties: false,
                    },
                ],
            },
        },
    },
    $defs: {
        contractSchema: {
            type: 'object',
            additionalProperties: false,
            properties: {
                type: { enum: ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null', 'unknown'] },
                properties: {
                    type: 'object',
                    additionalProperties: { $ref: '#/$defs/contractSchema' },
                },
                items: { $ref: '#/$defs/contractSchema' },
                required: {
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
                enum: {
                    type: 'array',
                    items: { type: ['string', 'number', 'boolean', 'null'] },
                },
                nullable: { type: 'boolean' },
            },
        },
    },
};

export const ACL_COMPONENT_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Alpine Component Loader component metadata v1',
    type: 'object',
    additionalProperties: false,
    required: ['version'],
    properties: {
        $schema: { type: 'string' },
        version: { const: 1 },
        dependencies: {
            type: 'array',
            items: { type: 'string' },
            uniqueItems: true,
        },
        groups: {
            type: 'array',
            items: {
                // Require useful non-empty group labels
                type: 'string',
                minLength: 1,
            },
            uniqueItems: true,
        },
        options: {
            type: 'object',
            not: { required: ['templateRevision'] },
        },
        metadata: ACL_MANIFEST_SCHEMA.properties.components.additionalProperties.oneOf[1].properties.metadata,
    },
    $defs: ACL_MANIFEST_SCHEMA.$defs,
};

export const ACL_OFFLINE_CONFIG_SCHEMA = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    title: 'Alpine Component Loader offline configuration v1',
    type: 'object',
    additionalProperties: false,
    required: ['version'],
    properties: {
        $schema: { type: 'string' },
        version: { const: 1 },
        activation: { enum: ['immediate', 'prompt'] },
        navigation: {
            type: 'object',
            additionalProperties: false,
            required: ['fallback'],
            properties: {
                fallback: { type: 'string' },
                allow: {
                    type: 'array',
                    items: { type: 'string' },
                    uniqueItems: true,
                },
                strategy: { enum: ['cache-first', 'network-first'] },
            },
        },
        runtimeRoutes: {
            type: 'array',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['path', 'strategy'],
                properties: {
                    path: { type: 'string' },
                    origin: { type: 'string' },
                    strategy: {
                        enum: ['cache-first', 'network-first', 'stale-while-revalidate', 'network-only'],
                    },
                    cacheName: { type: 'string' },
                    maxEntries: {
                        // Bound route cache cardinality
                        type: 'integer',
                        minimum: 0,
                    },
                    maxAgeSeconds: {
                        // Bound route cache age
                        type: 'number',
                        minimum: 0,
                    },
                },
            },
        },
    },
};

export const generateContractArtifacts = async ({
    manifestFile,
    outFile,
    customElementsFile,
    force = false,
    dryRun = false,
} = {}) => {
    // Generate contract artifacts
    const manifest = JSON.parse(await readFile(manifestFile, 'utf8')),
        declarations = renderComponentDeclarations(manifest),
        customElements = `${JSON.stringify(renderCustomElementsManifest(manifest), null, 2)}\n`,
        resolvedOut = outFile || resolve(dirname(manifestFile), 'acl-components.d.ts'),
        resolvedCustom = customElementsFile || resolve(dirname(manifestFile), 'custom-elements.json'),
        writes = [
            {
                path: resolvedOut,
                content: declarations,
            },
            {
                path: resolvedCustom,
                content: customElements,
            },
        ];
    if (!dryRun)
        // Process each write
        for (const write of writes) await writeProjectFile(write.path, write.content, { force });
    return {
        command: 'types',
        files: dryRun
            ? []
            : writes.map(
                  // Transform the current item
                  (write) => write.path,
              ),
        declarations,
        customElements,
        dryRun,
    };
};

export const generateManifestSchema = async ({ outFile, force = false, dryRun = false, kind = 'manifest' } = {}) => {
    // Generate manifest schema
    const schemas = {
            manifest: ACL_MANIFEST_SCHEMA,
            component: ACL_COMPONENT_SCHEMA,
            offline: ACL_OFFLINE_CONFIG_SCHEMA,
        },
        schema = schemas[kind];
    if (!schema) throw new TypeError(`Unsupported schema kind "${kind}".`);
    const content = `${JSON.stringify(schema, null, 2)}\n`;
    if (!dryRun) await writeProjectFile(outFile, content, { force });
    return {
        command: 'schema',
        kind,
        files: dryRun ? [] : [outFile],
        content,
        schema,
        dryRun,
    };
};
