// Build an actionable error for parser, SSR, and minifier features in lean installations
/**
 * @param {string} dependency
 * @param {string} feature
 * @param {unknown} [cause]
 * @returns {Error & { code: string, dependency: string, feature: string, install: string }}
 */
export const createOptionalDependencyError = (dependency, feature, cause = null) => {
    const error = /** @type {Error & { code: string, dependency: string, feature: string, install: string }} */ (
        new Error(
            `[ACL] ${feature} requires the optional dependency "${dependency}". Install it with "npm install ${dependency}" or reinstall without "--omit=optional".`,
            cause ? { cause } : undefined,
        )
    );
    error.code = 'ACL_OPTIONAL_DEPENDENCY_MISSING';
    error.dependency = dependency;
    error.feature = feature;
    error.install = `npm install ${dependency}`;
    return error;
};

/** @param {unknown} error */
const isMissingModule = (error) => {
    if (error == null || typeof error !== 'object' || !('code' in error)) return false;
    return (
        error.code === 'ERR_MODULE_NOT_FOUND' ||
        error.code === 'MODULE_NOT_FOUND' ||
        error.code === 'ERR_PACKAGE_PATH_NOT_EXPORTED'
    );
};

// Load one optional ESM tool and preserve non-resolution failures from the tool itself
/**
 * @param {string} dependency
 * @param {string} feature
 * @returns {Promise<any>}
 */
export const loadOptionalDependency = async (dependency, feature) => {
    // Preserve tool failures while translating missing-package failures
    try {
        return await import(dependency);
    } catch (error) {
        if (isMissingModule(error)) throw createOptionalDependencyError(dependency, feature, error);
        throw error;
    }
};

// Load a CommonJS-compatible optional tool from a synchronous feature boundary
/**
 * @param {NodeRequire} require
 * @param {string} dependency
 * @param {string} feature
 * @returns {any}
 */
export const requireOptionalDependency = (require, dependency, feature) => {
    // Preserve tool failures while translating missing-package failures
    try {
        return require(dependency);
    } catch (error) {
        if (isMissingModule(error)) throw createOptionalDependencyError(dependency, feature, error);
        throw error;
    }
};
