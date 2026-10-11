// Read boolean attributes using explicit false and zero spellings as opt-outs
export const readBooleanAttribute = (element, name, fallback = false) => {
    if (!element?.hasAttribute?.(name)) return fallback === true;
    const value = element.getAttribute(name);
    return value !== 'false' && value !== '0';
};

// Read a finite numeric attribute while enforcing its descriptor lower bound
export const readNumberAttribute = (element, name, fallback, { min = 0, positive = false } = {}) => {
    const raw = element?.getAttribute?.(name);
    if (raw == null) return fallback;
    const value = Number(raw),
        lowerBound = positive ? Number.MIN_VALUE : min;
    return Number.isFinite(value) && value >= lowerBound ? value : fallback;
};
