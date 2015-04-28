(function () {
    "use strict";

    var fs = require('fs'),
        path = require('path'),
        generatorify = require('nodefunc-generatorify'),
        readdir = generatorify(fs.readdir),
        stat = generatorify(fs.stat),
        coTools = require('co-parallel-tools');


    var Job = require('./job');

    //Make sure dir ends with a trailing slash
    var ensureLeadingSlash = function(dir) {
        return /^\//.test(dir) ? dir : "/" + dir;
    };

    //Make sure dir ends with a trailing slash
    var ensureTrailingSlash = function(dir) {
        return /\/$/.test(dir) ? dir : dir + "/";
    };


    var resolveDirPath = function() {
        var result = path.resolve.apply(path, arguments);
        return ensureTrailingSlash(result);
    };


    var Watch = function(patterns, fn, name, deps, config, options) {
        Job.call(this, fn, name, deps, config, options);

        this.patterns = [];
        this.excludedPatterns = [];
        this.excludedDirectories = [];

        this.watchedDirs = [];
        this.watchedFiles = [];

        //This is an index with key as the watched file path and value as match information (watcher, patterns ..)
        this.watchIndex = {};

        patterns.forEach(function(pattern) {
            if (typeof pattern === "string") {
                var result = {};
                /*
                    Exclamation mark at he beginning is a special character.
                    1. "!!!hello" includes a file or directory named "!hello"
                    2. "!!*.js" marks *.js as an important include. (overrides excludes)
                    3. "!*.txt" means the watch should exclude all txt files.
                */
                if (/^!!!/.test(pattern)) {
                    path = pattern.substr(2);
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
                                pattern.regex = new RegExp("^" + resolveDirPath(config.root, pattern.dir).replace(/\//g, "\\/"));
                            }
                        }
                        this.excludedDirectories.push(pattern);
                        break;
                    case "file":
                        if (!pattern.regex) {
                            var excludeBaseDir = resolveDirPath(config.root, pattern.dir).replace(/\//g, "\\/");
                            pattern.regex = new RegExp(excludeBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                        }
                        this.excludedPatterns.push(pattern);
                        break;
                    default:
                        throw new Error("Exclude type must be 'dir' or 'file'");
                }
            } else {
                if (!pattern.regex) {
                    var patternBaseDir = resolveDirPath(config.root, pattern.dir).replace(/\//g, "\\/");
                    pattern.regex = new RegExp(patternBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                }
                if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                    pattern.recurse = true;
                }
                this.patterns.push(pattern);
            }

        }, this);
    };

    Watch.prototype = Object.create(Job.prototype);
    Watch.prototype.constructor = Watch;


    /*
        Returns a function which can be used to find matching patterns
        1. If the pattern is important
        2. excludedPattern regex test fails and excludedPattern.dir is not set (happens when user uses regex as watch pattern)
        3. OR excludedPattern regex test fails but pattern.dir is more specific than excludedPattern.dir
    */
    var getFilePatternMatchFunction = function(matchPath, root, patterns) {
        var parentDir = ensureTrailingSlash(path.dirname(matchPath));

        /*
            Return
            1. all patterns marked important
            2. Patterns which aren't overridden by exclusions
        */
        return function(excludedPatterns, excludedDirectories) {
            var important = patterns.filter(function(pattern) { return pattern.important; });

        };
    };


    /*
        Conditions for exclusion are
        1. pattern isn't important AND
        2. excludedPattern tests resolvedPath AND
        3. excludedPattern.dir isn't set OR excludedPattern.dir is set but is longer than pattern.dir
    */
    var getExcludeDirectoryPredicate = function(dir, root, pattern) {
        var resolvedPath = resolveDirPath(root, dir);
        return function(excludedPattern) {
            return !pattern.important && excludedPattern.regex.test(resolvedPath) && (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
        };
    };


    Watch.prototype.getTasks = function*() {
        var self = this;

        var walk = function*(dir, recurse, pattern, excludedDirs) {
            var results = [{ path: dir, type: 'dir' }];

            var paths = [];
            try {
                paths = yield* readdir(dir);
            }
            catch(ex) {
                console.log("Skipped reading " + dir + ": " + ex.toString());
            }

            for (var i = 0; i < paths.length; i++) {
                var rootRelativePath = path.join(dir, paths[i]);
                var info = yield* stat(rootRelativePath);
                if (info.isDirectory()) {
                    var dirExcludePredicate = getExcludeDirectoryPredicate(rootRelativePath, self.config.root, pattern);
                    if (!excludedDirs.some(dirExcludePredicate)) {
                        results.push({ path: rootRelativePath, type: 'dir' });
                        if (recurse) {
                            results = results.concat(yield* walk(rootRelativePath, recurse, pattern, excludedDirs));
                        }
                    }
                } else {
                    //We will include all files now, irrespective of pattern filters.
                    //This is done so that we could do a single directory read for src/*.js and src/*.txt and do filtration later.
                    results.push({ path: rootRelativePath, type: 'file' });
                }
            }
            return results;
        };


        /*
            Walk directories with caching.
            If a directory has already been walked, the same results are returned.
        */
        var walkedDirectories = [];
        var getDirWalker = function(pattern) {
            var alreadyWalked = walkedDirectories.filter(function(d) { return d.dir === pattern.dir && d.recurse === pattern.recurse && d.important === pattern.important; });
            if (alreadyWalked.length) {
                return function*() {
                    var cachedWalkResult = {};
                    cachedWalkResult.dir = pattern.dir;
                    cachedWalkResult.recurse = pattern.recurse;
                    cachedWalkResult.important = pattern.important;
                    cachedWalkResult.pattern = pattern;
                    cachedWalkResult.entries = alreadyWalked[0].entries;
                    return cachedWalkResult;
                };
            } else {
                var walkResult = {
                    dir: pattern.dir,
                    recurse: pattern.recurse,
                    important: pattern.important,
                    pattern: pattern
                };
                walkedDirectories.push(walkResult);
                return function*() {
                    walkResult.entries = {};
                    walkResult.entries.paths = yield* walk(pattern.dir, pattern.recurse, pattern, self.excludedDirectories);
                    return walkResult;
                };
            }
        };

        /*
            If the pattern directory is not excluded, create a dirWalker
        */
        var dirWalkers = this.patterns.map(function(pattern) {
            var predicate = getExcludeDirectoryPredicate(pattern.dir, self.config.root, pattern);
            return !self.excludedDirectories.some(predicate) ? getDirWalker(pattern) : null;
        }).filter(function(pattern) { return typeof pattern !== "undefined" && pattern !== null; });


        /*
            Run directory walking in parallel.
        */
        var pathsInPatternRoots = yield* coTools.parallel(dirWalkers);


        /*
            From the results, we need to create a list of files and directories that need to be watched.
        */
        var addWatchedDir = function(entry) {
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
        var addWatchedFile = function(entry, pattern) {
            var resolvedPath = path.resolve(self.config.root, entry.path);
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
                var existing = self.watchedFiles.filter(function(e) { return e.path === entry.path; });
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
            return function*() {
                yield* coTools.doYield(self.fn, self.config, [entry.path, "change", entry.patterns]);
            };
        });
    };

    Watch.prototype.startMonitoring = function(_onFileChange) {
        var self = this;

        //Fire fileChange if path conditions are met.
        var onFileChange = function(ev, watch, self) {
            _onFileChange(ev, watch, self, self.config);
        };

        /*
            Create watches for the file list we have previously identified
        */
        this.watchedFiles.forEach(function(watch) {
            var fileWatcher = fs.watch(watch.path, function(ev, filename) {
                onFileChange(ev, watch, self);
            });
            watch.fileWatcher = fileWatcher;
            self.watchIndex[watch.path] = watch;
        });

        /*
            Create watches for the directory list we have previously identified
        */
        this.watchedDirs.forEach(function(watch) {
            fs.watch(watch.path, function(ev, filename) {
                var filePath = path.join(watch.path, filename);
                var resolvedPath = path.resolve(self.config.root, filePath);

                //If there is an existing fileWatcher, the file is already being watched.
                if (self.watchIndex[resolvedPath]) {
                    onFileChange(ev, self.watchIndex[resolvedPath], self);
                } else {
                    var matchingPatterns = self.patterns.filter(function(pattern) {
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
                        var fileWatcher = fs.watch(match.path, function(ev, filename) {
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

    module.exports = Watch;
}());
