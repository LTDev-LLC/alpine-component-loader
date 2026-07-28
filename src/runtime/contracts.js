// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const CONTRACT_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'object', 'array', 'null', 'unknown']),
    CONTRACT_KEYS = new Set(['type', 'properties', 'items', 'required', 'enum', 'nullable']);

export const normalizeContractSchema = (schema, path = 'detail', seen = new WeakSet(), depth = 0) => {
    // Normalize contract schema
    if (!schema || typeof schema !== 'object' || Array.isArray(schema))
        throw new TypeError(`[ACL] Contract schema ${path} must be an object.`);
    if (depth > 20) throw new TypeError(`[ACL] Contract schema ${path} exceeds the maximum depth.`);
    if (seen.has(schema)) throw new TypeError(`[ACL] Contract schema ${path} cannot be recursive.`);
    seen.add(schema);
    const unknown = Object.keys(schema).filter(
        // Select matching items
        (key) => !CONTRACT_KEYS.has(key),
    );
    if (unknown.length) throw new TypeError(`[ACL] Contract schema ${path} contains unsupported key "${unknown[0]}".`);
    const type = schema.type || 'unknown';
    if (!CONTRACT_TYPES.has(type)) throw new TypeError(`[ACL] Contract schema ${path} has unsupported type "${type}".`);
    const normalized = { type };
    if (schema.nullable != null) normalized.nullable = Boolean(schema.nullable);
    if (schema.enum != null) {
        if (
            !Array.isArray(schema.enum) ||
            schema.enum.some(
                // Check the current item
                (value) => value != null && !['string', 'number', 'boolean'].includes(typeof value),
            )
        )
            throw new TypeError(`[ACL] Contract schema ${path}.enum must contain JSON primitive values.`);
        normalized.enum = [...schema.enum];
    }
    if (type === 'object') {
        if (
            schema.properties != null &&
            (!schema.properties || typeof schema.properties !== 'object' || Array.isArray(schema.properties))
        )
            throw new TypeError(`[ACL] Contract schema ${path}.properties must be an object.`);
        normalized.properties = Object.fromEntries(
            Object.entries(schema.properties || {}).map(
                // Transform the current item
                ([name, child]) => [
                    name,
                    normalizeContractSchema(child, `${path}.properties.${name}`, seen, depth + 1),
                ],
            ),
        );
        if (
            schema.required != null &&
            (!Array.isArray(schema.required) ||
                schema.required.some(
                    // Check the current item
                    (name) => typeof name !== 'string' || !(name in normalized.properties),
                ))
        )
            throw new TypeError(`[ACL] Contract schema ${path}.required must reference declared properties.`);
        normalized.required = [...new Set(schema.required || [])];
    } else if (schema.properties != null || schema.required != null) {
        throw new TypeError(`[ACL] Contract schema ${path} may use properties only with type "object".`);
    }
    if (type === 'array') {
        normalized.items = schema.items
            ? normalizeContractSchema(schema.items, `${path}.items`, seen, depth + 1)
            : { type: 'unknown' };
    } else if (schema.items != null) {
        throw new TypeError(`[ACL] Contract schema ${path} may use items only with type "array".`);
    }
    seen.delete(schema);
    return normalized;
};

export const normalizeComponentMetadata = (metadata, tagName = 'component') => {
    // Normalize component metadata
    if (metadata == null) return null;
    if (typeof metadata !== 'object' || Array.isArray(metadata))
        throw new TypeError(`[ACL] Manifest metadata for <${tagName}> must be an object.`);
    const unsupported = Object.keys(metadata).filter(
        // Select matching items
        (key) => !['description', 'events', 'slots'].includes(key),
    );
    if (unsupported.length)
        throw new TypeError(`[ACL] Manifest metadata for <${tagName}> contains unsupported key "${unsupported[0]}".`);
    const output = {};
    if (metadata.description != null) {
        if (typeof metadata.description !== 'string')
            throw new TypeError(`[ACL] Manifest metadata description for <${tagName}> must be a string.`);
        output.description = metadata.description;
    }
    if (metadata.events != null) {
        if (typeof metadata.events !== 'object' || Array.isArray(metadata.events))
            throw new TypeError(`[ACL] Manifest metadata events for <${tagName}> must be an object.`);
        output.events = Object.fromEntries(
            Object.entries(metadata.events).map(([name, event]) => {
                // Transform the current item
                if (!/^[A-Za-z][\w:.-]*$/.test(name) || !event || typeof event !== 'object' || Array.isArray(event))
                    throw new TypeError(`[ACL] Invalid event metadata "${name}" for <${tagName}>.`);
                const unsupportedEvent = Object.keys(event).filter(
                    // Select matching items
                    (key) => !['description', 'detail'].includes(key),
                );
                if (unsupportedEvent.length || (event.description != null && typeof event.description !== 'string'))
                    throw new TypeError(`[ACL] Invalid event metadata "${name}" for <${tagName}>.`);
                return [
                    name,
                    {
                        ...(event.description == null ? {} : { description: event.description }),
                        ...(event.detail == null
                            ? {}
                            : { detail: normalizeContractSchema(event.detail, `metadata.events.${name}.detail`) }),
                    },
                ];
            }),
        );
    }
    if (metadata.slots != null) {
        if (typeof metadata.slots !== 'object' || Array.isArray(metadata.slots))
            throw new TypeError(`[ACL] Manifest metadata slots for <${tagName}> must be an object.`);
        output.slots = Object.fromEntries(
            Object.entries(metadata.slots).map(([name, slot]) => {
                // Transform the current item
                if (
                    !/^(?:[A-Za-z][\w.-]*|default)$/.test(name) ||
                    !slot ||
                    typeof slot !== 'object' ||
                    Array.isArray(slot)
                )
                    throw new TypeError(`[ACL] Invalid slot metadata "${name}" for <${tagName}>.`);
                const unsupportedSlot = Object.keys(slot).filter(
                    // Select matching items
                    (key) => key !== 'description',
                );
                if (unsupportedSlot.length || (slot.description != null && typeof slot.description !== 'string'))
                    throw new TypeError(`[ACL] Invalid slot metadata "${name}" for <${tagName}>.`);
                return [name, slot.description == null ? {} : { description: slot.description }];
            }),
        );
    }
    return output;
};
