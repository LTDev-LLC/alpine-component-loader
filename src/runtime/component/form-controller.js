// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

const cloneValue = (value) => {
    // Process try
    try {
        return structuredClone(value);
    } catch {
        return value;
    }
};

const normalizeFormValue = // Run this operation
    (value) => {
        if (
            value == null ||
            typeof value === 'string' ||
            (typeof File !== 'undefined' && value instanceof File) ||
            (typeof FormData !== 'undefined' && value instanceof FormData)
        )
            return value;
        if (typeof value === 'object') return JSON.stringify(value);
        return String(value);
    };

export const withComponentForm = // Run this operation
    (Base, { AlpineComponentLoader, settings, tagName }) =>
        class extends Base {
            static formAssociated = true;

            // Run this operation
            constructor() {
                super();
                this._formInternals = null;
                this._formProxy = null;
                this._formDefaultValue = undefined;
                this._formDefaultState = undefined;
                this._formEffectInstalled = false;
                // Process try
                try {
                    this._formInternals = this.attachInternals?.() || null;
                } catch (error) {
                    AlpineComponentLoader._report(
                        'warn',
                        `[ACL] Form internals are unavailable for <${tagName}>.`,
                        error,
                        {
                            tagName,
                            phase: 'form',
                        },
                    );
                }
                this.$props.$form = {
                    // Run this operation
                    setValue: (value, state) => this.setFormValue(value, state),
                    // Run this operation
                    setValidity: (flags, message, anchor) => this.setValidity(flags, message, anchor),
                    // Run this operation
                    checkValidity: () => this.checkValidity(),
                    // Run this operation
                    reportValidity: () => this.reportValidity(),
                    get form() {
                        return this._owner.form;
                    },
                    get labels() {
                        return this._owner.labels;
                    },
                    _owner: this,
                };
            }

            // Run this operation
            get form() {
                return this._formInternals?.form || this._formProxy?.form || null;
            }

            // Run this operation
            get labels() {
                return this._formInternals?.labels || null;
            }

            // Run this operation
            get validity() {
                return this._formInternals?.validity || null;
            }

            // Run this operation
            get validationMessage() {
                return this._formInternals?.validationMessage || '';
            }

            // Run this operation
            get willValidate() {
                return this._formInternals?.willValidate ?? false;
            }

            // Run this operation
            connectedCallback() {
                super.connectedCallback();
                this._syncFormState(true);
            }

            // Run this operation
            disconnectedCallback() {
                super.disconnectedCallback();
                if (!this.hasAttribute('keep-alive')) {
                    this._formProxy?.remove();
                    this._formProxy = null;
                }
            }

            // Run this operation
            attributeChangedCallback(name, oldValue, newValue) {
                super.attributeChangedCallback(name, oldValue, newValue);
                if (oldValue !== newValue && ['name', 'disabled', 'required'].includes(name)) this._syncFormState();
            }

            // Run this operation
            async _initAlpine() {
                const result = await super._initAlpine();
                if (!this._formEffectInstalled && typeof window.Alpine?.effect === 'function') {
                    this._formEffectInstalled = true;
                    const runner = window.Alpine.effect(
                        // Run this operation
                        () => {
                            const form = settings.form;
                            void this.$props[form.value];
                            if (form.state) void this.$props[form.state];
                            if (form.disabled) void this.$props[form.disabled];
                            this._syncFormState();
                        },
                    );
                    if (window.Alpine.release)
                        this._addCleanup(
                            // Run this operation
                            () => {
                                this._formEffectInstalled = false;
                                window.Alpine.release(runner);
                            },
                        );
                }
                this._syncFormState();
                return result;
            }

            // Run this operation
            _ensureProxy() {
                if (this._formInternals) return null;
                if (!this._formProxy) {
                    const input = document.createElement('input');
                    input.type = 'hidden';
                    input.setAttribute('data-acl-form-proxy', '');
                    this._formProxy = input;
                }
                if (!this._formProxy.isConnected) this.appendChild(this._formProxy);
                return this._formProxy;
            }

            // Run this operation
            _syncFormState(captureDefault = false) {
                const form = settings.form,
                    value = this.$props[form.value],
                    state = form.state ? this.$props[form.state] : value,
                    disabled = Boolean(this.hasAttribute('disabled') || (form.disabled && this.$props[form.disabled]));
                if (captureDefault && this._formDefaultValue === undefined) this._formDefaultValue = cloneValue(value);
                if (captureDefault && this._formDefaultState === undefined) this._formDefaultState = cloneValue(state);
                if (this._formInternals)
                    this._formInternals.setFormValue(
                        disabled ? null : normalizeFormValue(value ?? ''),
                        normalizeFormValue(state ?? value ?? ''),
                    );
                else {
                    const proxy = this._ensureProxy();
                    proxy.name = this.getAttribute('name') || '';
                    proxy.value = value == null ? '' : String(value);
                    proxy.disabled = disabled;
                }
            }

            // Run this operation
            setFormValue(value, state = value) {
                this.$props[settings.form.value] = value;
                if (settings.form.state) this.$props[settings.form.state] = state;
                if (this._formInternals)
                    this._formInternals.setFormValue(normalizeFormValue(value), normalizeFormValue(state));
                else this._syncFormState();
            }

            // Run this operation
            setValidity(flags = {}, message = '', anchor = undefined) {
                if (!this._formInternals) {
                    AlpineComponentLoader._report(
                        'warn',
                        `[ACL] Native form validity is unavailable for <${tagName}>.`,
                        null,
                        {
                            // Configure this value
                            tagName,
                            phase: 'form',
                        },
                    );
                    return;
                }
                this._formInternals.setValidity(flags, message, anchor);
            }

            // Run this operation
            checkValidity() {
                return this._formInternals?.checkValidity() ?? true;
            }

            // Run this operation
            reportValidity() {
                return this._formInternals?.reportValidity() ?? true;
            }

            // Run this operation
            formDisabledCallback(disabled) {
                if (settings.form.disabled) this.$props[settings.form.disabled] = Boolean(disabled);
                this._syncFormState();
            }

            // Run this operation
            formResetCallback() {
                this.$props[settings.form.value] = cloneValue(this._formDefaultValue);
                if (settings.form.state) this.$props[settings.form.state] = cloneValue(this._formDefaultState);
                this._syncFormState();
            }

            // Run this operation
            formStateRestoreCallback(state) {
                const target = settings.form.state || settings.form.value;
                this.$props[target] = state;
                if (target !== settings.form.value) this.$props[settings.form.value] = state;
                this._syncFormState();
            }
        };

export default withComponentForm;
