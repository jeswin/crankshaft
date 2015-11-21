/* @flow */
import fs from 'fs';
import path from 'path';
import promisify from 'nodefunc-promisify';
import Job from './job';

let readdir = promisify(fs.readdir.bind(fs));
let stat = promisify(fs.stat.bind(fs));


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

/*
    Conditions for exclusion are
    1. pattern isn't important AND
    2. excludedPattern tests resolvedPath AND
    3. excludedPattern.dir isn't set OR excludedPattern.dir is set but is longer than pattern.dir
*/
const getExcludeDirectoryPredicate = function(dir, root, pattern) {
    const resolvedPath = resolveDirPath(root, dir);
    return function(excludedPattern) {
        return !pattern.important && excludedPattern.regex.test(resolvedPath) && (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
    };
};


type WatchedFilesEntryType = {
    path: string,
    type: string,
    patterns: Array<PatternType>
};

type WatchedDirsEntryType = {
    path: string,
    type: string
};

export default class Watch extends Job {

    patterns: Array<Object>;
    fn: Function;
    name: string;
    deps: Array<string>;
    parent: JobQueue;
    watchedFiles: Array<WatchedFilesEntryType>;
    watchedDirs: Array<WatchedDirsEntryType>;
    watchIndex: Object;
    excludedPatterns: Array<PatternType>;
    excludedDirectories: Array<PatternType>;


    constructor(patterns: Array<string> | Array<PatternType>, fn: FnActionType, name: string, deps: Array<string>, parent: JobQueue) {
        super(fn, name, deps, parent);

        this.patterns = [];
        this.excludedPatterns = [];
        this.excludedDirectories = [];

        this.watchedDirs = [];
        this.watchedFiles = [];

        //This is an index with key as the watched file path and value as match information (watcher, patterns ..)
        this.watchIndex = {};

        patterns.forEach(function(pattern) {
            if (typeof pattern === "string") {
                const result = {};
                /*
                    Exclamation mark at he beginning is a special character.
                    1. "!!!hello" includes a file or directory named "!hello"
                    2. "!!*.js" marks *.js as an important include. (overrides excludes)
                    3. "!*.txt" means the watch should exclude all txt files.
                */
                if (/^!!!/.test(pattern)) {
                    pattern = pattern.substr(2);
                    result.file = path.basename(pattern);
                    result.dir = path.dirname(pattern);
                } else if (/^!!/.test(pattern)) {
                    pattern = pattern.substr(2);
                    result.file = path.basename(pattern);
                    result.dir = path.dirname(pattern);
                    result.important = true;
                } else if (/^!/.test(pattern)) {
                    pattern = pattern.substr(1);
                    if (/\/$/.test(pattern)) {
                        result.exclude = "dir";
                        result.dir = pattern;
                    } else {
                        result.exclude = "file";
                        result.file = path.basename(pattern);
                        result.dir = path.dirname(pattern);
                    }
                } else {
                    result.file = path.basename(pattern);
                    result.dir = path.dirname(pattern);
                }
                if (typeof result.important === "undefined" || result.important === null)
                    result.important =  false;

                pattern = result;
            }

            if (pattern.regex && typeof pattern.regex === "string") {
                pattern.regex = new RegExp(pattern.regex);
            }

            if (pattern.exclude) {
                switch(pattern.exclude) {
                    case "dir":
                        if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                            pattern.recurse = true;
                        }
                        if (pattern.recurse) {
                            if (!pattern.regex) {
                                pattern.regex = new RegExp(ensureLeadingSlash(ensureTrailingSlash(pattern.dir)).replace(/\//g, "\\/"));
                            }
                        } else {
                            if (!pattern.regex) {
                                pattern.regex = new RegExp("^" + resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/"));
                            }
                        }
                        this.excludedDirectories.push(pattern);
                        break;
                    case "file":
                        if (!pattern.regex) {
                            const excludeBaseDir = resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/");
                            pattern.regex = new RegExp(excludeBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                        }
                        this.excludedPatterns.push(pattern);
                        break;
                    default:
                        throw new Error("Exclude type must be 'dir' or 'file'");
                }
            } else {
                if (!pattern.regex) {
                    const patternBaseDir = resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/");
                    pattern.regex = new RegExp(patternBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                }
                if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                    pattern.recurse = true;
                }
                this.patterns.push(pattern);
            }

        }, this);
    }


    async getTasks() : Promise {
        const self = this;

        const directoryCache = {};

        const walk = async function(dir, recurse, pattern, excludedDirs) {
            let results = [{ path: dir, type: 'dir' }];

            let dirEntries;
            if (!directoryCache[dir]) {
                dirEntries = [];
                try {
                    const _paths = await readdir(dir);
                    for (let i = 0; i < _paths.length; i++) {
                        const _rootRelativePath = path.join(dir, _paths[i]);
                        const _info = await stat(_rootRelativePath);
                        dirEntries.push({ path: _paths[i], info: _info, rootRelativePath: _rootRelativePath });
                    }
                    directoryCache[dir] = dirEntries;
                }
                catch(ex) {
                    if (self.parent.build.options.suppressErrors === false) {
                        throw ex;
                    }
                }
            } else {
                dirEntries = directoryCache[dir];
            }

            for (let j = 0; j < dirEntries.length; j++) {
                const entry = dirEntries[j];
                if (entry.info.isDirectory()) {
                    const dirExcludePredicate = getExcludeDirectoryPredicate(entry.rootRelativePath, self.parent.root, pattern);
                    if (!excludedDirs.some(dirExcludePredicate)) {
                        results.push({ path: entry.rootRelativePath, type: 'dir' });
                        if (recurse) {
                            results = results.concat(await walk(entry.rootRelativePath, recurse, pattern, excludedDirs));
                        }
                    }
                } else {
                    //We will include all files now, irrespective of pattern filters.
                    //This is done so that we could do a single directory read for src/*.js and src/*.txt and do filtration later.
                    results.push({ path: entry.rootRelativePath, type: 'file' });
                }
            }
            return results;
        };


        /*
            Walk directories with caching.
            If a directory has already been walked, the same results are returned.
        */
        const walkedDirectories = [];
        const getDirWalker = function(pattern) {
            const alreadyWalked = walkedDirectories.filter(function(d) { return d.dir === pattern.dir && d.recurse === pattern.recurse && d.important === pattern.important; });
            if (alreadyWalked.length) {
                return async function() {
                    let cachedWalkResult = {};
                    cachedWalkResult.dir = pattern.dir;
                    cachedWalkResult.recurse = pattern.recurse;
                    cachedWalkResult.important = pattern.important;
                    cachedWalkResult.pattern = pattern;
                    cachedWalkResult.entries = alreadyWalked[0].entries;
                    return cachedWalkResult;
                };
            } else {
                const walkResult = {
                    dir: pattern.dir,
                    recurse: pattern.recurse,
                    important: pattern.important,
                    pattern: pattern
                };
                walkedDirectories.push(walkResult);
                return async function() {
                    walkResult.entries = {};
                    walkResult.entries.paths = await walk(pattern.dir, pattern.recurse, pattern, self.excludedDirectories);
                    return walkResult;
                };
            }
        };

        /*
            If the pattern directory is not excluded, create a dirWalker
        */
        const dirWalkers = this.patterns.map(function(pattern) {
            const predicate = getExcludeDirectoryPredicate(pattern.dir, self.parent.root, pattern);
            return !self.excludedDirectories.some(predicate) ? getDirWalker(pattern) : null;
        }).filter(function(pattern) { return typeof pattern !== "undefined" && pattern !== null; });


        /*
            Run directory walking in parallel.
        */
        const pathsInPatternRoots = await Promise.all(dirWalkers.map(f => f()));

        /*
            From the results, we need to create a list of files and directories that need to be watched.
        */
        const addWatchedDir = function(entry) {
            self.watchedDirs.push({
                path: entry.path,
                type: entry.type
            });
        };

        /*
            We haven't filtered the file list yet.
            1. Check if the file path matches pattern AND
            2. If it is either marked important OR (does not test with excludedPatterns or does so with less specificity)
        */
        const addWatchedFile = function(entry, pattern) {
            const resolvedPath = path.resolve(entry.path);
            if (
                pattern.regex.test(resolvedPath) &&
                (
                    pattern.important ||
                    !self.excludedPatterns.some(function(excludedPattern) {
                        return excludedPattern.regex.test(resolvedPath) &&
                            (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
                    })
                )
            ) {
                const existing = self.watchedFiles.filter(function(e) { return e.path === entry.path; });
                if (existing.length) {
                    existing[0].patterns.push(pattern);
                } else {
                    self.watchedFiles.push({
                        path: entry.path,
                        type: entry.type,
                        patterns: [pattern]
                    });
                }
            }
        };

        pathsInPatternRoots.forEach(function(walkResult) {
            walkResult.entries.paths.forEach(function(entry) {
                if (entry.type === "dir") {
                    addWatchedDir(entry);
                } else if (entry.type === "file") {
                    addWatchedFile(entry, walkResult.pattern);
                }
            });
        });


        return self.watchedFiles.map(function(entry) {
            return async function() {
                await self.fn(entry.path, "change", entry.patterns);
            };
        });
    };

    startMonitoring(_onFileChange) {
        const self = this;

        //Fire fileChange if path conditions are met.
        const onFileChange = function(ev, watch, self) {
            _onFileChange(ev, watch, self, self.parent);
        };

        /*
            Create watches for the file list we have previously identified
        */
        this.watchedFiles.forEach(function(watch) {
            const resolvedPath = path.resolve(self.parent.root, watch.path);
            const fileWatcher = fs.watch(watch.path, function(ev, filename) {
                onFileChange(ev, watch, self);
            });
            watch.fileWatcher = fileWatcher;
            self.watchIndex[watch.path] = watch;
        });

        /*
            Create watches for the directories we have previously identified
        */
        this.watchedDirs.forEach(function(watch) {
            fs.watch(watch.path, function(ev, filename) {
                const filePath = path.join(watch.path, filename);

                //If there is an existing fileWatcher, the file is already being watched.
                if (self.watchIndex[filePath]) {
                    onFileChange(ev, self.watchIndex[filePath], self);
                } else {
                    const resolvedPath = path.resolve(self.parent.root, filePath);
                    const matchingPatterns = self.patterns.filter(function(pattern) {
                        return pattern.regex.test(resolvedPath) &&
                        (
                            pattern.important ||
                            !self.excludedPatterns.some(function(excludedPattern) {
                                return excludedPattern.regex.test(resolvedPath) &&
                                    (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
                            })
                        );
                    });

                    if (matchingPatterns.length) {
                        const fileWatcher = fs.watch(filePath, function(ev, filename) {
                            onFileChange(ev, watch, self);
                        });
                        self.watchIndex[filePath] = {
                            path: filePath,
                            fileWatcher: fileWatcher,
                            type: "file",
                            patterns: matchingPatterns
                        };
                    }
                }
            });
        });
    };
}
