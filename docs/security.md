# Security and Trusted Types

Templates are content crossing a rendering boundary. Browser and SSR sanitization is enabled by default.

The same boundary covers fetched, selector-backed, declarative, and JavaScript inline templates:

```js
AlpineComponentLoader.define('safe-inline-card', {
    template: '<article><h2>Hello</h2><slot></slot></article>',
});
```

Inline strings are parsed as detached content through the effective Trusted Types policy. Sanitization and
`executeScripts` rules still apply.

[`/core`](core.md) uses the same security contracts. The [polyfill entry](polyfills.md) injects upstream classic
scripts: its `trustedTypesPolicy.createScriptURL()` and `nonce` are separate from component parsing’s
`security.trustedTypesPolicy.createHTML()`. CSP must allow nested bundle scripts and ShadyCSS styles. ShadyCSS receives
sanitized content.

## Default sanitization

The browser sanitizer visits descendants and nested `<template>` content, removing:

- HTML and SVG `<script>` elements.
- Inline event-handler attributes such as `onclick`.
- `<base>` and refresh `<meta http-equiv="refresh">` elements.
- `srcdoc`.
- Executable `javascript:`, `vbscript:`, and executable HTML/SVG data URLs.
- Unsafe candidates in `srcset`.

URL checks cover navigation, media, forms, objects, and SVG attributes: `href`, `src`, `xlink:href`, `action`,
`formaction`, `poster`, and `data`.

Alpine directives, ordinary `data-*` and ARIA attributes, styles, SVG, and custom elements remain available:

```html
<article x-data="{ open: false }">
    <button type="button" @click="open = !open" :aria-expanded="open">Details</button>
    <p x-show="open">Safe Alpine behavior remains declarative.</p>
</article>
```

Checks normalize control characters, whitespace, casing, and decoded entities. Obfuscated executable URLs are rejected
before application policy.

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

`false` or an exception removes the attribute. Custom policy cannot restore executable URLs rejected by ACL. Resolve
relative URLs against a trusted base.

## Trusted Types

For Trusted Types CSP, supply an application-owned policy:

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

Policy output enters the HTML parsing sink; sanitization still follows.

Parsing blocked by Trusted Types without a configured policy reports `ACL_TRUSTED_TYPES_REQUIRED` with phase `sanitize`.

Create and review policies in application code; template data must not select their name or implementation.

The `security` fields are `trustedTypesPolicy` for HTML parsing and `urlPolicy` for URL restrictions after
executable-protocol checks.

## Custom sanitizer

Custom sanitizers receive a detached `DocumentFragment` and context. They may mutate/return it, return another node, or
return HTML:

```js
AlpineComponentLoader.define('profile-card', '/components/profile-card.html', {
    async sanitize(fragment, { el, props, tagName }) {
        fragment.querySelectorAll('[data-private]').forEach((node) => node.remove());
        fragment.querySelectorAll('a[target="_blank"]').forEach((link) => {
            link.rel = 'noopener noreferrer';
        });

        auditSanitizedFragment(fragment, { el, props, tagName });
        return fragment;
    },
});
```

A custom sanitizer replaces the built-in browser sanitizer for that definition. It owns script, handler, `srcdoc`,
refresh/base, and executable-URL removal. Returned HTML is reparsed through Trusted Types without a subsequent built-in
sanitization pass.

Use a reviewed sanitizer at the application boundary.

Context includes `el`, `root`, `props`, and `tagName`; URL policy also receives `element` and `attribute`. Treat context
as read-only and mutate the detached fragment, not the live host.

## Sanitization and script execution are separate

`sanitize` and `executeScripts` are independent controls:

- With default sanitization, scripts are removed before rendering.
- With `executeScripts: false` (the default), any script left by a custom sanitizer is also removed.
- A script executes only when it survives the selected sanitizer and `executeScripts: true` recreates it in the rendered
  root.

```js
AlpineComponentLoader.define('trusted-vendor-widget', '/trusted/widget.html', {
    sanitize: false,
    executeScripts: true,
});
```

This high-trust opt-out is unsafe for user-authored, remote, or tenant-controlled templates. Prefer application modules,
Alpine data registrations, and `externalScripts` over embedded scripts.

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

Use Alpine’s CSP build when required. Deliver nonces/integrity through application assets or supported descriptors.
Avoid `unsafe-inline`, executable template URLs, and dynamic code construction.

ACL respects page CSP. Strict CSP adds a boundary around templates, modules, assets, and API connections.

## SSR and hydration parity

SSR applies equivalent executable-markup checks to templates and slot HTML, removing scripts, handlers, base/refresh
elements, `srcdoc`, and executable URLs.

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

The browser sanitizes hydrated shadow content again before Alpine, including HTML changed by middleware or storage.

SSR URL policy receives serializable element/attribute names rather than DOM objects. Shared policies should use names
and URLs, not browser-only APIs.

## Repository security automation

Maintainers can reproduce the fast authored-source checks locally:

```bash
npm run security:static
npm run security:audit
npx playwright test tests/sanitizer-parity.spec.js --project=chromium
```

Static checks scan `src/`, `server/`, and `bin/` for dynamic code and unsafe parsing. Seeded property tests compare
browser/SSR sanitizer output for executable markup, SVG, nested templates, unusual quoting, and malformed HTML.

GitHub Actions runs source checks and cross-browser validation on protected pushes. CodeQL and dependency review require
Advanced Security and `ACL_GHAS_ENABLED=true`; otherwise they report unavailability. Report vulnerabilities privately
through the [security policy](../SECURITY.md).

## Failure handling

Sanitizer and Trusted Types failures are reported through `acl:error`:

```js
addEventListener('acl:error', (event) => {
    if (event.detail.phase === 'sanitize') {
        reportTemplateSecurityFailure(event.detail.error);
    }
});
```

Exclude templates, credentials, headers, and user data from logs. Observability/debugger exports redact credential-like
fields and sensitive queries.

## Security checklist

- Keep `sanitize: true` and `executeScripts: false` for ordinary components.
- Treat remote template hosts and custom resolvers as part of the trusted computing base.
- Use HTTPS and integrity metadata for third-party assets where practical.
- Add an application URL allowlist when templates do not need arbitrary navigation or media origins.
- Use a strict CSP and Trusted Types policy appropriate to the application.
- Regenerate and verify SSR template revisions after trusted template changes.
- Test nested `<template>` content, SVG attributes, `srcset`, slots, and fallback/loading templates.

For server-specific path and network controls see [Static SSR and hydration](ssr.md). For redaction behavior see
[Observability](observability.md).
