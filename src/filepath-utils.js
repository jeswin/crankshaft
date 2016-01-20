/* @flow */
import path from "path";

//Make sure dir ends with a trailing slash
const ensureLeadingSlash = function(dir: string) : string {
  return /^\//.test(dir) ? dir : "/" + dir;
};


//Make sure dir ends with a trailing slash
const ensureTrailingSlash = function(dir: string) : string {
  return /\/$/.test(dir) ? dir : dir + "/";
};

const resolveDirPath = function(...args: any) : string {
  const result = path.resolve.apply(path, arguments);
  return ensureTrailingSlash(result);
};

export {
  ensureLeadingSlash as ensureLeadingSlash,
  ensureTrailingSlash as ensureTrailingSlash,
  resolveDirPath as resolveDirPath
};
