# Runtime efficiency and distribution size

ACL keeps repeated component work bounded through parsed-template reuse, lazy capability loading, and explicit distribution-size gates.

JavaScript `{ template }` definitions, selector-backed templates, and
`template[x-acl]` declarations avoid a component-template request and do not
create persistent URL-template cache entries. They still use the normal
per-definition render path, including cloning parsed content and running the
configured sanitizer for each instance. Data requests and external assets
declared by such a component remain independent network operations.

## Runtime hot-path behavior

For each normalized component definition, the renderer retains the two most
recent parsed template strings. Repeated instances clone the cached
`DocumentFragment`; changed HMR content occupies a new entry and is parsed
again. A custom Trusted Types policy bypasses this parsed-fragment cache so the
policy still receives every instance. Built-in and custom sanitizers also
continue to run for every rendered instance.

Loader-owned collections for Light DOM slots, legacy scope IDs, polling,
hydration, event cleanup, and diagnostics are allocated only when their
features activate. Teardown accepts uninitialized state.

## Distribution size gates

`npm run check:size` measures gzip bytes for every public browser entry's actual
initial closure, its full dynamic transitive closure, and the shared module
graph. Checked-in values live in `scripts/size-baselines.json`. Each measurement
may grow by the larger of 64 bytes or 5%; diagnostics retain entry-owned and
shared byte breakdowns so a failure identifies where growth occurred.

Update these baselines only after intentional architecture or distribution
changes.
