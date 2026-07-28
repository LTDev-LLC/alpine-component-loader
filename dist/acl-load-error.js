// @license AlpineComponentLoader
// Copyright (c) LTDev LLC
// Licensed under the MIT license in the repository root

export class ACLLoadError extends Error {
    // Attach stable machine-readable metadata to component loading failures
    constructor(message, { code = 'ACL_UNKNOWN', phase = 'runtime', status = null, retryable = false, cause = null } = {}){
        super(message, cause ? {
            cause
        } : undefined);
        this.name = 'ACLLoadError';
        this.code = code;
        this.phase = phase;
        this.status = status;
        this.retryable = retryable;
        if (cause && !this.cause) this.cause = cause;
    }
}
