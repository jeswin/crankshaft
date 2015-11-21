//Make sure dir ends with a trailing slash
const ensureLeadingSlash = function(dir) {
    return /^\//.test(dir) ? dir : "/" + dir;
};


//Make sure dir ends with a trailing slash
const ensureTrailingSlash = function(dir) {
    return /\/$/.test(dir) ? dir : dir + "/";
};

const resolveDirPath = function() {
    const result = path.resolve.apply(path, arguments);
    return ensureTrailingSlash(result);
};

export default {
    ensureLeadingSlash,
    ensureTrailingSlash,
    resolveDirPath
};
