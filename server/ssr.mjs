import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { readFile, realpath, stat } from 'node:fs/promises';
import { isIP } from 'node:net';
import { relative, resolve, sep } from 'node:path';
import { normalizeManifest } from '../dist/runtime/registry.js';
import { isExecutableUrl } from '../dist/runtime/rendering.js';
import { loadOptionalDependency } from './optional-dependency.mjs';

const { parseFragment, serialize, serializeOuter } = await loadOptionalDependency('parse5', 'server-side rendering');

const URL_ATTRIBUTES = new Set(['href', 'src', 'xlink:href', 'action', 'formaction', 'poster', 'data']),
    FORBIDDEN_ATTRIBUTES = new Set(['data-acl-ssr', 'data-acl-revision', 'shadowrootmode', 'shadowrootserializable']),
    textEncoder = new TextEncoder();

const privateAddress = (rawAddress) => {
    // Run the private address operation
    const address = String(rawAddress)
            .toLowerCase()
            .replace(/^\[|\]$/g, '')
            .split('%')[0],
        mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
    if (mapped) return privateAddress(mapped);
    if (
        address === '::1' ||
        address === '::' ||
        address.startsWith('fc') ||
        address.startsWith('fd') ||
        address.startsWith('ff') ||
        /^fe[89ab]/.test(address)
    )
        return true;
    if (!address.includes('.')) return false;
    const parts = address.split('.').map(Number);
    return (
        parts[0] === 10 ||
        parts[0] === 127 ||
        parts[0] === 0 ||
        (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
        (parts[0] === 169 && parts[1] === 254) ||
        (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
        (parts[0] === 192 && parts[1] === 168) ||
        (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) ||
        parts[0] >= 224
    );
};

const validateRemoteUrl = async (url, { allowPrivate = false } = {}) => {
    // Reject unsafe remote schemes credentials hosts and resolved addresses
    if (url.protocol !== 'https:') throw new TypeError(`[ACL SSR] Remote template sources require HTTPS: ${url}`);
    if (!allowPrivate && (url.username || url.password))
        throw new TypeError('[ACL SSR] Template source URLs cannot contain credentials.');
    if (allowPrivate) return;
    const addresses = isIP(url.hostname)
        ? [{ address: url.hostname }]
        : await lookup(url.hostname, {
              all: true,
              verbatim: true,
          });
    if (
        !addresses.length ||
        addresses.some(
            // Check the current item
            (entry) => privateAddress(entry.address),
        )
    )
        throw new TypeError(`[ACL SSR] Template source resolved to a non-public address: ${url.hostname}`);
};

const readResponseText = async (response, maxBytes, label = 'Template') => {
    // Read a streamed response without exceeding the configured byte limit
    const declared = Number(response.headers.get('content-length'));
    if (Number.isFinite(declared) && declared > maxBytes)
        throw new TypeError(`[ACL SSR] ${label} exceeds ${maxBytes} bytes.`);
    const reader = response.body?.getReader();
    if (!reader) {
        const text = await response.text();
        if (textEncoder.encode(text).byteLength > maxBytes)
            throw new TypeError(`[ACL SSR] ${label} exceeds ${maxBytes} bytes.`);
        return text;
    }
    const chunks = [];
    let length = 0;
    // Continue until the operation completes
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
            await reader.cancel();
            throw new TypeError(`[ACL SSR] ${label} exceeds ${maxBytes} bytes.`);
        }
        chunks.push(value);
    }
    const joined = new Uint8Array(length);
    let offset = 0;
    chunks.forEach((chunk) => {
        // Process the current item
        joined.set(chunk, offset);
        offset += chunk.byteLength;
    });
    return new TextDecoder().decode(joined);
};

const sanitizeTree = (parent, security = {}, context = {}) => {
    // Remove executable markup and URLs from a parsed server-side fragment
    const children = parent.childNodes || parent.content?.childNodes || [];
    // Iterate over the indexed values
    for (let index = children.length - 1; index >= 0; index--) {
        const node = children[index];
        if (!node.tagName) continue;
        const tag = node.tagName.toLowerCase(),
            attrs = Object.fromEntries(
                (node.attrs || []).map(
                    // Transform the current item
                    (attr) => [attr.name.toLowerCase(), attr.value],
                ),
            );
        if (
            tag === 'script' ||
            tag === 'base' ||
            (tag === 'meta' && attrs['http-equiv']?.trim().toLowerCase() === 'refresh')
        ) {
            children.splice(index, 1);
            continue;
        }
        node.attrs = (node.attrs || []).filter((attr) => {
            // Select matching items
            const name = attr.name.toLowerCase();
            if (name.startsWith('on') || name === 'srcdoc') return false;
            const values =
                name === 'srcset'
                    ? attr.value
                          .split(',')
                          .map(
                              // Transform the current item
                              (value) => value.trim().split(/\s+/)[0],
                          )
                          .filter(Boolean)
                    : URL_ATTRIBUTES.has(name)
                      ? [attr.value]
                      : [];
            if (values.some(isExecutableUrl)) return false;
            if (values.length && typeof security.urlPolicy === 'function') {
                // Guard the sanitize tree operation against runtime failures
                try {
                    if (
                        values.some(
                            // Check the current item
                            (value) =>
                                security.urlPolicy(value, {
                                    ...context,
                                    element: tag,
                                    attribute: name,
                                }) === false,
                        )
                    )
                        return false;
                } catch {
                    return false;
                }
            }
            return true;
        });
        sanitizeTree(node, security, context);
        if (node.content) sanitizeTree(node.content, security, context);
    }
    return parent;
};

export const sanitizeSSRHtml = (html, security = {}, context = {}) => {
    // Sanitize html
    return serialize(sanitizeTree(parseFragment(String(html || '')), security, context));
};

const escapeAttribute = (value) => {
    // Run the escape attribute operation
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('"', '&quot;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
};

const attributeType = (definition) => {
    // Run the attribute type operation
    const value = definition && typeof definition === 'object' ? definition.type : definition;
    return typeof value === 'string' ? value : value?.name;
};

const serializeProp = (value, definition) => {
    // Serialize one typed prop for a safe host attribute
    const type = attributeType(definition);
    if (type === 'Boolean') return value ? '' : null;
    if (value == null) return null;
    if (type === 'Array' || type === 'Object' || typeof value === 'object')
        return JSON.stringify(value).replaceAll('<', '\\u003c');
    return String(value);
};

const renderAttributes = (attributes, props, definitions) => {
    // Validate merge and escape caller attributes with manifest props
    const output = new Map();
    // Process each entry
    for (const [name, value] of Object.entries(attributes || {})) {
        const normalized = name.toLowerCase();
        if (
            !/^[a-z_:][a-z0-9_.:-]*$/i.test(name) ||
            normalized.startsWith('on') ||
            FORBIDDEN_ATTRIBUTES.has(normalized)
        )
            throw new TypeError(`[ACL SSR] Refusing unsafe or reserved host attribute "${name}".`);
        if (value !== false && value != null) output.set(name, value === true ? '' : String(value));
    }
    // Process each entry
    for (const [name, value] of Object.entries(props || {})) {
        if (!(name in definitions)) throw new TypeError(`[ACL SSR] Unknown prop "${name}".`);
        const serialized = serializeProp(value, definitions[name]);
        if (serialized == null) output.delete(name);
        else output.set(name, serialized);
    }
    return [...output]
        .map(
            // Transform the current item
            ([name, value]) => ` ${name}${value === '' ? '' : `="${escapeAttribute(value)}"`}`,
        )
        .join('');
};

const renderSlots = (slots, security, context) => {
    // Sanitize and serialize default and named slot content
    if (typeof slots === 'string') return sanitizeSSRHtml(slots, security, context);
    return Object.entries(slots || {})
        .map(([name, html]) => {
            // Transform the current item
            const safe = sanitizeSSRHtml(Array.isArray(html) ? html.join('') : html, security, context);
            return name === 'default' ? safe : `<span slot="${escapeAttribute(name)}" data-acl-ssr-slot>${safe}</span>`;
        })
        .join('');
};

const renderLightTemplate = (source, slots, security, context) => {
    // Replace Light DOM slots with the same transparent anchors used by the browser renderer
    const values =
            typeof slots === 'string'
                ? { default: sanitizeSSRHtml(slots, security, context) }
                : Object.fromEntries(
                      Object.entries(slots || {}).map(([name, html]) => [
                          name,
                          sanitizeSSRHtml(Array.isArray(html) ? html.join('') : html, security, context),
                      ]),
                  ),
        fragment = parseFragment(sanitizeSSRHtml(source, security, context)),
        visit = (parent) => {
            // Replace slots at any structural depth including template contents
            // Run this operation
            for (let index = 0; index < (parent.childNodes || []).length; index++) {
                const node = parent.childNodes[index];
                if (node.tagName === 'slot') {
                    const name =
                            node.attrs?.find(
                                // Find the authored slot name
                                (attribute) => attribute.name === 'name',
                            )?.value || 'default',
                        content = name in values ? values[name] : (node.childNodes || []).map(serializeOuter).join(''),
                        replacement = parseFragment(
                            `<div style="display: contents" data-acl-slot="${escapeAttribute(name)}">${content}</div>`,
                        ).childNodes[0];
                    replacement.parentNode = parent;
                    parent.childNodes[index] = replacement;
                    continue;
                }
                visit(node);
                if (node.content) visit(node.content);
            }
        };
    visit(fragment);
    return serialize(fragment);
};

const serializeInitialData = (value, maxBytes) => {
    // Serialize caller-resolved data without allowing executable HTML boundaries
    let json;
    // Run this operation
    try {
        json = JSON.stringify(value);
    } catch (error) {
        throw new TypeError(`[ACL SSR] dataResolver returned non-serializable data: ${error.message}`);
    }
    if (json === undefined) throw new TypeError('[ACL SSR] dataResolver must return a JSON-serializable value.');
    const safe = json.replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029');
    if (textEncoder.encode(safe).byteLength > maxBytes)
        throw new TypeError(`[ACL SSR] Resolved component data exceeds ${maxBytes} bytes.`);
    return `<script type="application/json" data-acl-ssr-data>${safe}</script>`;
};

const ensureRevision = (text, revision) => {
    // Verify a declared SHA-256 template revision before rendering
    if (!revision?.startsWith('sha256-')) return;
    const actual = `sha256-${createHash('sha256').update(text).digest('base64url')}`;
    if (actual !== revision)
        throw new TypeError(`[ACL SSR] Template revision mismatch: expected ${revision}, received ${actual}.`);
};

const appendSearchParams = // Run this operation
    (params, value, prefix = '') => {
        // Process forof
        for (const [key, child] of Object.entries(value || {})) {
            const name = prefix ? `${prefix}[${key}]` : key;
            if (Array.isArray(child))
                child.forEach(
                    // Run this operation
                    (item) => params.append(name, String(item ?? '')),
                );
            else if (child && typeof child === 'object') appendSearchParams(params, child, name);
            else if (child != null) params.append(name, String(child));
        }
    };

const normalizeDataPolicy = // Run this operation
    (policy) => {
        if (policy == null) return null;
        if (!policy || typeof policy !== 'object' || Array.isArray(policy))
            throw new TypeError('[ACL SSR] dataPolicy must be an object.');
        if (!policy.baseUrl) throw new TypeError('[ACL SSR] dataPolicy.baseUrl is required.');
        const baseUrl = new URL(policy.baseUrl);
        if (!['http:', 'https:'].includes(baseUrl.protocol))
            throw new TypeError('[ACL SSR] dataPolicy.baseUrl must use HTTP or HTTPS.');
        const allowedOrigins = new Set(
            Array.from(
                policy.allowedOrigins || [], // Run this operation
                (origin) => new URL(origin).origin,
            ),
        );
        if (!allowedOrigins.size && typeof policy.authorize !== 'function')
            throw new TypeError('[ACL SSR] dataPolicy requires allowedOrigins or authorize().');
        const normalized = {
            timeout: 5_000,
            maxResponseBytes: 256 * 1024,
            maxRedirects: 3,
            allowUnsafeMethods: false,
            allowSensitiveHeaders: false,
            fetch: globalThis.fetch,
            ...policy,
            baseUrl,
            allowedOrigins,
        };
        if (!Number.isFinite(normalized.timeout) || normalized.timeout <= 0)
            throw new TypeError('[ACL SSR] dataPolicy.timeout must be a positive finite number.');
        if (!Number.isInteger(normalized.maxResponseBytes) || normalized.maxResponseBytes <= 0)
            throw new TypeError('[ACL SSR] dataPolicy.maxResponseBytes must be a positive integer.');
        if (!Number.isInteger(normalized.maxRedirects) || normalized.maxRedirects < 0)
            throw new TypeError('[ACL SSR] dataPolicy.maxRedirects must be a non-negative integer.');
        return normalized;
    };

const resolvePolicyData = // Run this operation
    async (policy, definition, context) => {
        const configured = definition.options?.data;
        if (!policy || !configured?.src) return undefined;
        const overrides =
                (await policy.resolve?.({
                    // Configure this value
                    ...context,
                    data: structuredClone(configured),
                })) || {},
            keys =
                overrides.keys ||
                (configured.keys && typeof configured.keys === 'object' && !Array.isArray(configured.keys)
                    ? configured.keys
                    : {}),
            params =
                overrides.params ||
                (configured.params && typeof configured.params === 'object' && !Array.isArray(configured.params)
                    ? configured.params
                    : {});
        let source = overrides.src || configured.src;
        // Process forof
        for (const [key, value] of Object.entries(keys))
            source = source.split(`:${key}`).join(encodeURIComponent(String(value)));
        let url = new URL(source, policy.baseUrl);
        appendSearchParams(url.searchParams, params);
        if (url.username || url.password)
            throw new TypeError('[ACL SSR] Data request URLs cannot contain credentials.');
        const configuredOptions =
                configured.options && typeof configured.options === 'object' ? structuredClone(configured.options) : {},
            suppliedOptions = overrides.options && typeof overrides.options === 'object' ? overrides.options : {},
            initialMethod = String(
                overrides.method || configured.method || suppliedOptions.method || configuredOptions.method || 'GET',
            ).toUpperCase(),
            options = {
                ...configuredOptions,
                ...suppliedOptions,
                method: initialMethod,
                headers: {
                    Accept: 'application/json',
                    ...(configuredOptions.headers || {}),
                    ...(suppliedOptions.headers || {}),
                },
            };
        // Process forof
        for (const unsafeOption of [
            'cache',
            'credentials',
            'integrity',
            'keepalive',
            'mode',
            'redirect',
            'referrer',
            'referrerPolicy',
            'signal',
        ])
            delete options[unsafeOption];
        let method = initialMethod;
        if (!['GET', 'HEAD'].includes(method) && !policy.allowUnsafeMethods)
            throw new TypeError(`[ACL SSR] Data policy rejected unsafe method ${method}.`);
        const headers = new Headers(options.headers);
        if (!policy.allowSensitiveHeaders) {
            headers.delete('authorization');
            headers.delete('cookie');
            headers.delete('proxy-authorization');
        }
        options.headers = headers;
        const body = overrides.body ?? configured.body ?? options.body;
        if (body != null && !['GET', 'HEAD'].includes(method)) {
            if (body && typeof body === 'object' && !(body instanceof ArrayBuffer) && !ArrayBuffer.isView(body)) {
                if (!headers.has('content-type')) headers.set('content-type', 'application/json');
                options.body = JSON.stringify(body);
            } else options.body = body;
        } else delete options.body;
        const authorized =
            policy.allowedOrigins.has(url.origin) ||
            (typeof policy.authorize === 'function' &&
                (await policy.authorize(
                    {
                        url: url.href,
                        method,
                        headers: Object.fromEntries(headers.entries()),
                    },
                    context,
                )) === true);
        if (!authorized) throw new TypeError(`[ACL SSR] Data policy rejected ${url.origin}.`);

        const fetchImpl = policy.fetch || globalThis.fetch;
        if (typeof fetchImpl !== 'function') throw new TypeError('[ACL SSR] dataPolicy requires fetch().');
        // Process for
        for (let redirects = 0; redirects <= policy.maxRedirects; redirects++) {
            await validateRemoteUrl(url);
            const controller = new AbortController(),
                timer = setTimeout(
                    // Run this operation
                    () => controller.abort('Data timeout'),
                    policy.timeout,
                );
            // Process try
            try {
                const response = await fetchImpl(url, {
                    // Configure this value
                    ...options,
                    redirect: 'manual',
                    signal: controller.signal,
                });
                if ([301, 302, 303, 307, 308].includes(response.status)) {
                    const location = response.headers.get('location');
                    await response.body?.cancel?.().catch(
                        // Run this operation
                        () => {},
                    );
                    if (!location || redirects === policy.maxRedirects)
                        throw new TypeError('[ACL SSR] Data redirect limit exceeded.');
                    url = new URL(location, url);
                    if (url.username || url.password)
                        throw new TypeError('[ACL SSR] Data redirect URLs cannot contain credentials.');
                    const redirectAuthorized =
                        policy.allowedOrigins.has(url.origin) ||
                        (typeof policy.authorize === 'function' &&
                            (await policy.authorize(
                                {
                                    // Configure this value
                                    url: url.href,
                                    method,
                                    redirect: true,
                                },
                                context,
                            )) === true);
                    if (!redirectAuthorized)
                        throw new TypeError(`[ACL SSR] Data policy rejected redirect to ${url.origin}.`);
                    if (response.status === 303 && method !== 'HEAD') {
                        method = 'GET';
                        options.method = 'GET';
                        delete options.body;
                    }
                    continue;
                }
                if (!response.ok) throw new TypeError(`[ACL SSR] Data request failed with HTTP ${response.status}.`);
                const contentType = (response.headers.get('content-type') || '').toLowerCase();
                if (!contentType.includes('application/json') && !/application\/[a-z0-9.+-]+\+json\b/.test(contentType))
                    throw new TypeError('[ACL SSR] Data request did not return JSON.');
                const text = await readResponseText(response, policy.maxResponseBytes, 'Data response');
                let parsed;
                // Process try
                try {
                    parsed = JSON.parse(text);
                } catch (error) {
                    throw new TypeError(`[ACL SSR] Data response contains invalid JSON: ${error.message}`);
                }
                return parsed;
            } finally {
                clearTimeout(timer);
            }
        }
        throw new TypeError('[ACL SSR] Data redirect limit exceeded.');
    };

export const createSSRRenderer = ({
    manifest,
    root,
    fetch: customFetch = null,
    resolver = null,
    timeout = 10_000,
    maxTemplateBytes = 1024 * 1024,
    maxDataBytes = 256 * 1024,
    maxRedirects = 5,
    security = {},
    dataResolver = null,
    dataPolicy = null,
    renderLightDom = false,
} = {}) => {
    // Create a static manifest renderer with bounded source caching
    if (dataResolver && dataPolicy)
        throw new TypeError('[ACL SSR] dataResolver and dataPolicy are mutually exclusive.');
    const normalizedDataPolicy = normalizeDataPolicy(dataPolicy),
        normalized = normalizeManifest(manifest),
        definitions = new Map(
            normalized.components.map(
                // Transform the current item
                (component) => [component.tagName, component],
            ),
        ),
        cache = new Map();
    let resolvedRootPromise = null;
    const getRoot = async () => {
        // Resolve the required local project root through symlinks once
        if (!root) throw new TypeError('[ACL SSR] createSSRRenderer() requires a project root for local sources.');
        return (resolvedRootPromise ||= realpath(resolve(root)));
    };

    const fetchRemote = async (initial) => {
        // Fetch a remote template through validated bounded redirects
        let url = new URL(initial);
        const fetchImpl = customFetch || globalThis.fetch;
        if (typeof fetchImpl !== 'function') throw new TypeError('[ACL SSR] HTTPS sources require fetch().');
        // Iterate over the indexed values
        for (let redirects = 0; redirects <= maxRedirects; redirects++) {
            await validateRemoteUrl(url, { allowPrivate: Boolean(customFetch || resolver) });
            const controller = new AbortController(),
                timer = setTimeout(() => {
                    // Abort remote template reads at the configured deadline
                    controller.abort('Template timeout');
                }, timeout);
            // Guard the fetch remote operation against runtime failures
            try {
                const response = await fetchImpl(url, {
                    redirect: 'manual',
                    signal: controller.signal,
                });
                if ([301, 302, 303, 307, 308].includes(response.status)) {
                    const location = response.headers.get('location');
                    await response.body?.cancel?.().catch(() => {
                        // Ignore response cancellation failures
                    });
                    if (!location || redirects === maxRedirects)
                        throw new TypeError('[ACL SSR] Template redirect limit exceeded.');
                    url = new URL(location, url);
                    continue;
                }
                if (!response.ok)
                    throw new TypeError(`[ACL SSR] Template request failed with HTTP ${response.status}.`);
                return await readResponseText(response, maxTemplateBytes);
            } finally {
                clearTimeout(timer);
            }
        }
        throw new TypeError('[ACL SSR] Template redirect limit exceeded.');
    };

    const loadTemplate = async (definition) => {
        // Load verify and cache one local or remote template source
        const source =
                typeof resolver === 'function' ? await resolver(definition.source, definition) : definition.source,
            key = `${source}::${definition.options?.templateRevision || ''}`;
        if (cache.has(key)) return cache.get(key);
        const task = (async () => {
            // Run the task operation
            let text;
            if (/^https:/i.test(source)) text = await fetchRemote(source);
            else {
                if (typeof source !== 'string' || source.startsWith('#') || /^[A-Za-z][A-Za-z\d+.-]*:/.test(source))
                    throw new TypeError(`[ACL SSR] Unsupported template source: ${source}`);
                const projectRoot = await getRoot(),
                    base = normalized.basePath || '',
                    candidate = resolve(projectRoot, base, source),
                    actual = await realpath(candidate),
                    rel = relative(projectRoot, actual);
                if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || resolve(actual) === projectRoot)
                    throw new TypeError(`[ACL SSR] Template source escapes or resolves to the project root: ${source}`);
                if (!(await stat(actual)).isFile())
                    throw new TypeError(`[ACL SSR] Template source is not a file: ${source}`);
                text = await readFile(actual, 'utf8');
                if (textEncoder.encode(text).byteLength > maxTemplateBytes)
                    throw new TypeError(`[ACL SSR] Template exceeds ${maxTemplateBytes} bytes.`);
            }
            ensureRevision(text, definition.options?.templateRevision);
            return text;
        })();
        cache.set(key, task);
        // Guard the load template operation against runtime failures
        try {
            return await task;
        } catch (error) {
            cache.delete(key);
            throw error;
        }
    };

    if (dataResolver != null && typeof dataResolver !== 'function')
        throw new TypeError('[ACL SSR] dataResolver must be a function or null.');
    if (!Number.isInteger(maxDataBytes) || maxDataBytes <= 0)
        throw new TypeError('[ACL SSR] maxDataBytes must be a positive integer.');

    const render = async (
        tagName,
        {
            props = {},
            attributes = {},
            slots = {},
            resolveData = true,
            lightDom = renderLightDom,
            hydrate = null,
            hydrateMedia = null,
        } = {},
    ) => {
        // Render one manifest component with sanitized declarative shadow markup
        const tag = String(tagName || '').toLowerCase(),
            definition = definitions.get(tag);
        if (!definition) throw new TypeError(`[ACL SSR] Unknown manifest component <${tag}>.`);
        const hydrationMode = hydrate || definition.options?.hydrate || 'eager',
            hydrationMedia = hydrateMedia || definition.options?.hydrateMedia || null;
        if (!['eager', 'visible', 'idle', 'interaction', 'media'].includes(hydrationMode))
            throw new TypeError(`[ACL SSR] Unsupported hydration mode "${hydrationMode}".`);
        if (hydrationMode === 'media' && !String(hydrationMedia || '').trim())
            throw new TypeError('[ACL SSR] Media hydration requires hydrateMedia.');
        const propDefinitions = definition.options?.attributes || {},
            hostAttributes = renderAttributes(attributes, props, propDefinitions),
            slotHtml = renderSlots(slots, security, { tagName: tag }),
            dataContext = {
                tagName: tag,
                props: structuredClone(props),
                attributes: structuredClone(attributes),
                slots: structuredClone(slots),
                definition: structuredClone(definition),
            },
            resolvedData =
                dataResolver && resolveData
                    ? await dataResolver({
                          ...dataContext,
                      })
                    : normalizedDataPolicy && resolveData
                      ? await resolvePolicyData(normalizedDataPolicy, definition, dataContext)
                      : undefined,
            dataHtml = resolvedData === undefined ? '' : serializeInitialData(resolvedData, maxDataBytes),
            hydrationAttributes =
                (hydrationMode === 'eager' ? '' : ` hydrate="${escapeAttribute(hydrationMode)}"`) +
                (hydrationMedia ? ` hydrate-media="${escapeAttribute(hydrationMedia)}"` : '');
        if (!definition.options?.shadow && !lightDom) return `<${tag}${hostAttributes}>${slotHtml}${dataHtml}</${tag}>`;
        const source = await loadTemplate(definition),
            safeTemplate = sanitizeSSRHtml(source, security, { tagName: tag }),
            revision = definition.options?.templateRevision || '';
        if (!definition.options?.shadow)
            return `<${tag}${hostAttributes}${hydrationAttributes} data-acl-ssr="1" data-acl-revision="${escapeAttribute(revision)}">${renderLightTemplate(source, slots, security, { tagName: tag })}${dataHtml}</${tag}>`;
        return `<${tag}${hostAttributes}${hydrationAttributes} data-acl-ssr="1" data-acl-revision="${escapeAttribute(revision)}"><template data-acl-ssr-shadow shadowrootmode="open" shadowrootserializable>${safeTemplate}</template>${slotHtml}${dataHtml}</${tag}>`;
    };

    return {
        render,
        // Render multiple independent requests concurrently
        renderMany: (requests) =>
            Promise.all(
                Array.from(
                    requests || [],
                    // Transform the current item
                    (request) => render(request.tagName, request),
                ),
            ),
        // Clear every cached template promise
        clearCache: () => cache.clear(),
    };
};

export default { createSSRRenderer };
