# Security and Trusted Types

Component templates cross a rendering boundary and must be treated as content, not trusted executable code. Sanitization is enabled by default in both the browser and static SSR renderer.

This boundary applies equally to fetched URLs, selector-backed DOM templates,
`template[x-acl]`/`template[acl-component]` declarations, and JavaScript inline
definitions:

```js
AlpineComponentLoader.define('safe-inline-card', {
    template: '<article><h2>Hello</h2><slot></slot></article>',
});
```

The JavaScript string is parsed into inert detached content using the effective
Trusted Types policy. Avoiding a network request does not make it trusted; the
normal sanitizer and `executeScripts` policy still run when an instance renders.

## Default sanitization

The built-in browser sanitizer walks ordinary descendants and nested `<template>` content. It removes:

- HTML and SVG `<script>` elements.
- Inline event-handler attributes such as `onclick`.
- `<base>` and refresh `<meta http-equiv="refresh">` elements.
- `srcdoc`.
- Executable `javascript:`, `vbscript:`, and executable HTML/SVG data URLs.
- Unsafe candidates in `srcset`.

It checks navigation, media, form, object, and SVG URL attributes including `href`, `src`, `xlink:href`, `action`, `formaction`, `poster`, and `data`.

Alpine directives, ordinary `data-*` and ARIA attributes, styles, SVG, and custom elements remain available:

```html
<article x-data="{ open: false }">
    <button type="button" @click="open = !open" :aria-expanded="open">Details</button>
    <p x-show="open">Safe Alpine behavior remains declarative.</p>
</article>
```

URL checks normalize control characters, whitespace, casing, and parser-decoded entities before checking protocols. Obfuscated executable URLs are rejected rather than passed to application policy.

## Add a URL allowlist

Use `security.urlPolicy` to reject URLs beyond the built-in rules:

```js
AlpineComponentLoader.config({
    security: {
        urlPolicy(value, { element, attribute, tagName }) {
            const url = new URL(value, location.origin);
            const allowedOrigin = url.origin === location.origin || url.origin === 'https://cdn.example.com';

            if (!allowedOrigin) {
                console.warn(`Blocked ${attribute} on ${element.localName} in <${tagName}>`);
            }
            return allowedOrigin;
        },
    },
});
```

Returning `false` or throwing removes the URL attribute. A custom policy cannot restore a URL rejected by the built-in executable-protocol policy. Account for relative URLs by resolving against an explicit trusted base as shown above.

## Trusted Types

Under a Trusted Types Content Security Policy, create an application-owned policy and give it to the loader:

```js
const policy = trustedTypes.createPolicy('acl', {
    createHTML(html) {
        return html;
    },
});

AlpineComponentLoader.config({
    security: { trustedTypesPolicy: policy },
});
```

The policy output is supplied to the HTML parsing sink. Sanitization still runs after parsing; a policy does not replace the loader's sanitizer.

If the browser enforces Trusted Types and parsing a string without a configured policy throws, the loader reports an `ACLLoadError` with code `ACL_TRUSTED_TYPES_REQUIRED` and phase `sanitize`.

Applications should create and review the policy themselves. Do not let template data choose a policy name or implementation.

The `security` object has two public fields: `trustedTypesPolicy` supplies the
application-owned HTML policy, and `urlPolicy` performs the additional URL
allowlist check after ACL's executable-protocol rejection.

## Custom sanitizer

A custom sanitizer receives a detached `DocumentFragment` plus component context. It may mutate and return that fragment, return another node, or return an HTML string:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    async sanitize(fragment, { el, props, tagName }) {
        fragment.querySelectorAll('[data-private]').forEach(node => node.remove());
        fragment.querySelectorAll('a[target="_blank"]').forEach(link => {
            link.rel = 'noopener noreferrer';
        });

        auditSanitizedFragment(fragment, { el, props, tagName });
        return fragment;
    },
});
```

Selecting a custom sanitizer replaces the built-in browser sanitizer for that definition. It must independently remove scripts, inline handlers, `srcdoc`, refresh/base elements, and executable URLs if those protections are still required. Returning a string reparses it with the configured Trusted Types policy but does not automatically apply the built-in sanitizer afterward.

Prefer composing a well-reviewed sanitizer at the application boundary rather than adding ad hoc allow rules to individual components.

The browser sanitizer context exposes the host `el`, rendered `root`, current
`props`, and component `tagName`. URL-policy calls add the candidate `element`
and `attribute`. Treat these values as read-only diagnostic context; mutate the
detached fragment passed to the sanitizer instead of mutating the live host
during sanitization.

## Sanitization and script execution are separate

`sanitize` and `executeScripts` are independent controls:

- With default sanitization, scripts are removed before rendering.
- With `executeScripts: false` (the default), any script left by a custom sanitizer is also removed.
- A script executes only when it survives the selected sanitizer and `executeScripts: true` recreates it in the rendered root.

```js
AlpineComponentLoader.define('trusted-vendor-widget', '/trusted/widget.html', {
    sanitize: false,
    executeScripts: true,
});
```

The example above is an explicit high-trust opt-out. Do not use it for user-authored, remote, tenant-controlled, or otherwise untrusted templates. Prefer modules loaded by application code, Alpine data registrations, and `externalScripts` descriptors over scripts embedded in template markup.

## CSP-compatible components

Keep behavior in application modules and templates declarative:

```js
Alpine.data('profileCard', () => ({
    open: false,
    toggle() {
        this.open = !this.open;
    },
}));
```

```html
<article x-data="profileCard">
    <button type="button" @click="toggle">Toggle</button>
    <p x-show="open">Profile details</p>
</article>
```

Use the Alpine CSP build when the application's policy requires it. Supply nonces and integrity metadata through application script/style delivery or supported external asset descriptors. Avoid `unsafe-inline`, executable template URLs, and dynamic code construction.

The loader does not add telemetry or bypass the page's CSP. A strict CSP remains an important second boundary around templates, imported modules, remote assets, and API connections.

## SSR and hydration parity

The static SSR renderer applies the same executable-markup boundaries to component templates and supplied slot HTML. It removes scripts, inline handlers, `<base>`, refresh metadata, `srcdoc`, and executable URLs before emitting markup.

```js
const renderer = createSSRRenderer({
    manifest,
    root,
    security: {
        urlPolicy(value) {
            return value.startsWith('/') || value.startsWith('https://cdn.example.com/');
        },
    },
});
```

The browser sanitizes an adopted SSR shadow tree again before Alpine initialization. This protects the client boundary even if server-rendered HTML passes through middleware or storage before hydration.

The server URL-policy context contains serializable element and attribute names rather than browser `Element` objects. Keep shared policies dependent on URL, tag name, element name, and attribute name rather than browser-only APIs.

## Repository security automation

Maintainers can reproduce the fast authored-source checks locally:

```bash
npm run security:static
npm run security:audit
npx playwright test tests/sanitizer-parity.spec.js --project=chromium
```

The static check scans `src/`, `server/`, and `bin/` for prohibited dynamic-code and unsafe parsing patterns. The seeded fast-check corpus compares security-relevant browser and SSR sanitizer output across scripts, event handlers, executable URLs, SVG, nested templates, unusual quoting, and malformed markup.

GitHub Actions runs the authored-source checks above and executes the full
cross-browser validation on protected pushes. CodeQL and dependency review run
when GitHub Advanced Security is enabled and the repository variable
`ACL_GHAS_ENABLED` is set to `true`; otherwise, their workflows report the
unavailable service without failing unrelated validation. Report suspected
vulnerabilities privately through the root [security policy](../SECURITY.md),
not a public issue.

## Failure handling

Sanitizer and Trusted Types failures are reported through `acl:error`:

```js
addEventListener('acl:error', event => {
    if (event.detail.phase === 'sanitize') {
        reportTemplateSecurityFailure(event.detail.error);
    }
});
```

Do not include raw template content, credentials, headers, or user data in security logs. ACL observability and debugger exports already redact credential-like fields and sensitive URL queries.

## Security checklist

- Keep `sanitize: true` and `executeScripts: false` for ordinary components.
- Treat remote template hosts and custom resolvers as part of the trusted computing base.
- Use HTTPS and integrity metadata for third-party assets where practical.
- Add an application URL allowlist when templates do not need arbitrary navigation or media origins.
- Use a strict CSP and Trusted Types policy appropriate to the application.
- Regenerate and verify SSR template revisions after trusted template changes.
- Test nested `<template>` content, SVG attributes, `srcset`, slots, and fallback/loading templates.

For server-specific path and network controls see [Static SSR and hydration](ssr.md). For redaction behavior see [Observability](observability.md).
