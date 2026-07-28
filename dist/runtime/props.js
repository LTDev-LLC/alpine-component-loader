// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const moduleSuffix = new URL(import.meta.url).pathname.endsWith('.min.js') ? '.min.js' : '.js', importLocalModule = (specifier)=>import(/* @vite-ignore */ specifier.replace(/\.js$/, moduleSuffix)), { parseJson } = await importLocalModule('./values.js');
const typeMap = {
    String,
    Number,
    Boolean,
    Array,
    Object
};
// Resolve constructor or string type declarations to a supported runtime constructor
export const normalizeType = (value)=>{
    if (typeof value === 'string') {
        if (!typeMap[value]) throw new TypeError(`[ACL] Unsupported prop type "${value}".`);
        return typeMap[value];
    }
    return value || String;
};
// Recursively normalize nested object-schema definitions
const normalizeSchema = (schema)=>{
    if (!schema || typeof schema !== 'object') return schema;
    return Object.fromEntries(Object.entries(schema).map(([key, value])=>{
        // Transform the current item
        if (value && typeof value === 'object' && !Array.isArray(value)) {
            return [
                key,
                {
                    ...value,
                    type: normalizeType(value.type),
                    schema: normalizeSchema(value.schema)
                }
            ];
        }
        return [
            key,
            normalizeType(value)
        ];
    }));
};
// Normalize shorthand and descriptor-style public prop definitions
export const normalizePropDefinition = (value)=>{
    if (value && typeof value === 'object' && !Array.isArray(value) && value.type) {
        return {
            ...value,
            type: normalizeType(value.type),
            schema: normalizeSchema(value.schema)
        };
    }
    return normalizeType(value);
};
// Return the first path-aware nested schema violation, or null when the value is valid
export const validateSchemaShape = (value, schema, path = '')=>{
    if (!schema || typeof schema !== 'object') return null;
    // Process each entry
    for (const [key, rawDefinition] of Object.entries(schema)){
        // Expand shorthand constructors so all validation below uses one descriptor shape
        const definition = rawDefinition && typeof rawDefinition === 'object' && !Array.isArray(rawDefinition) ? rawDefinition : {
            type: rawDefinition
        }, expectedType = normalizeType(definition.type), nestedValue = value?.[key], nestedPath = path ? `${path}.${key}` : key;
        if (nestedValue == null) {
            if (definition.required) return `Missing required field "${nestedPath}".`;
            continue;
        }
        if (expectedType === String && typeof nestedValue !== 'string') return `Field "${nestedPath}" must be a string.`;
        if (expectedType === Number && typeof nestedValue !== 'number') return `Field "${nestedPath}" must be a number.`;
        if (expectedType === Boolean && typeof nestedValue !== 'boolean') return `Field "${nestedPath}" must be a boolean.`;
        if (expectedType === Array && !Array.isArray(nestedValue)) return `Field "${nestedPath}" must be an array.`;
        if (expectedType === Object && (typeof nestedValue !== 'object' || Array.isArray(nestedValue))) return `Field "${nestedPath}" must be an object.`;
        if (definition.schema && expectedType === Object) {
            const nestedError = validateSchemaShape(nestedValue, definition.schema, nestedPath);
            if (nestedError) return nestedError;
        }
    }
    return null;
};
// Parse declarative prop JSON and normalize each resulting definition
export const parsePropDefinitions = (value)=>{
    const invalid = Symbol('invalid-props'), parsed = typeof value === 'string' ? parseJson(value, invalid) : value || {};
    if (parsed === invalid || !parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new TypeError('[ACL] Prop definitions must be a JSON object.');
    return Object.fromEntries(Object.entries(parsed).map(// Transform the current item
    ([key, prop])=>[
            key,
            normalizePropDefinition(prop)
        ]));
};
