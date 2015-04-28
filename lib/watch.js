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
                        if (!pattern.regex) {
                            pattern.regex = new RegExp("^" + resolveDirPath(config.root, pattern.dir).replace(/\//g, "\\/"));
                        }
                        if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                            pattern.recurse = true;
                        }
                        this.excludedDirectories.push(pattern);
                        break;
                    case "file":
                        if (!pattern.regex) {
                            var excludeBaseDir = pattern.dir !== "." ? resolveDirPath(config.root, pattern.dir).replace(/\//g, "\\/") : "";
                            pattern.regex = new RegExp(excludeBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                        }
                        this.excludedPatterns.push(pattern);
                        break;
                    default:
                        throw new Error("Exclude type must be 'directory' or 'file'");
                }
            } else {
                if (!pattern.regex) {
                    var patternBaseDir = pattern.dir !== "." ? pattern.dir.replace(/\//g, "\\/") + "\\/" : "";
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
    var getPatternMatchFunction = function(matchPath, root, patterns) {
        var isFilePath = !/\/$/.test(matchPath); //Check trailing slash. If so, it's a directory.
        var resolvedPath = path.resolve(root, matchPath);

        var testPattern = function(path, pattern, excludedPatterns) {
            return pattern.important || !excludedPatterns.some(function(excludedPattern) {
                return excludedPattern.regex.test(resolvedPath) &&
                    (excludedPattern.dir && excludedPattern.dir.length >= pattern.dir.length);
            });
        };

        return function(exclusions) {
            if (isFilePath) {
                var parentDir = ensureTrailingSlash(path.dirname(matchPath));

                var excludedPatterns = exclusions.filter(function(e) { return e.exclude === "file"; });
                var excludedDirectories = exclusions.filter(function(e) { return e.exclude === "dir"; });

                return patterns.filter(function(pattern) {
                    return testPattern(resolvedPath, pattern, excludedPatterns) && testPattern(parentDir, pattern, excludedDirectories);
                });
            } else {
                return patterns.filter(function(pattern) {
                    return testPattern(resolvedPath, pattern, exclusions);
                });
            }
        };
    };


    Watch.prototype.getTasks = function*() {
        var self = this;

        var walk = function*(dir, recurse, pattern, recursivelyExcludedDirs) {
            var results = [];

            var paths = [];
            try {
                paths = yield* readdir(dir);
            }
            catch(ex) {
                console.log("Skipped reading " + dir + ": " + ex.toString());
            }

            for (var i = 0; i < paths.length; i++) {
                var fullPath = path.join(dir, paths[i]);
                var info = yield* stat(fullPath);
                if (info.isDirectory()) {
                    //Do not parse the directory if it is excluded and pattern is !important.
                    var matchFunc = getPatternMatchFunction(ensureTrailingSlash(paths[i]), self.config.root, [pattern]);
                    var matchingPatterns = matchFunc(recursivelyExcludedDirs);
                    if (matchingPatterns.length) {
                        results.push({ path: fullPath, type: 'dir' });
                        if (recurse) {
                            results = results.concat(yield* walk(fullPath, recurse, pattern, recursivelyExcludedDirs));
                        }
                    }
                } else {
                    results.push({ path: fullPath, type: 'file' });
                }
            }
            return results;
        };

        /*
            Exclusions that apply recursively. This means that pattern.dir will be excluded at all levels.
                eg: { dir: "node_modules", exclude: "dir", recurse: true } will exclude /a/b/node_modules/x/y

            However, if there is an inclusion that is more specific than the exclusion, the inclusion wins.
                eg: include /a/b/c/*.js beats exclude /a/b/
        */
        var recursivelyExcludedDirs = self.excludedDirectories.filter(function(p) { return p.recurse; });

        /*
            Find files and directories that match the pattern.
        */
        var getDirWalker = function(pattern) {
            return function*() {
                return {
                    paths: yield* walk(pattern.dir, pattern.recurse, pattern, recursivelyExcludedDirs),
                    pattern: pattern
                };
            };
        };

        /*
            If the pattern directory is not excluded, create a dirWalker
        */
        var dirWalkers = this.patterns.map(function(pattern) {
            //Do not parse the directory if it is excluded and pattern is !important.
            var matchFunc = getPatternMatchFunction(ensureTrailingSlash(pattern.dir), self.config.root, [pattern]);
            var matchingPatterns = matchFunc(self.excludedDirectories)
            if (matchingPatterns.length) {
                return getDirWalker(pattern);
            }
        });


        /*
            Run directory walking in parallel.
        */
        var pathsInPatternRoots = yield* coTools.parallel(dirWalkers);

        /*
            Create a list with key as path
        */
        var addToWatchList = function(entry, list, pattern) {
            var existing = list.filter(function(e) { return e.path === entry.path; });
            if (existing.length) {
                existing[0].patterns.push(pattern);
            } else {
                list.push({
                    path: entry.path,
                    type: entry.type,
                    patterns: [pattern]
                });
            }
        };


        /*
            From the results, we need to create a list of files and directories that need to be watched.
        */
        pathsInPatternRoots.forEach(function(pathsInPattern) {
            pathsInPattern.paths.forEach(function(entry) {
                var list = (entry.type === "dir") ? self.watchedDirs : self.watchedFiles;
                addToWatchList(entry, list, pathsInPattern.pattern);
            });
        });


        /*
            From the watch list, we can remove excluded items
        */
        var removeExclusionsFromList = function(list) {
            return list.map(function(entry) {
                var _path = entry.type === "dir" ? ensureTrailingSlash(entry.path) : entry.path;
                var fn = getPatternMatchFunction(_path, self.config.root, entry.patterns);
                var patterns = fn(self.excludedPatterns.concat(self.excludedDirectories));
                return {
                    path: entry.path,
                    type: entry.type,
                    patterns: patterns
                };
            }).filter(function(entry) {
                return entry.patterns.length > 0;
            });
        };

        self.watchedDirs = removeExclusionsFromList(self.watchedDirs);
        self.watchedFiles = removeExclusionsFromList(self.watchedFiles);

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

                //If there is an existing fileWatcher, the file is already being watched.
                if (self.watchIndex[filePath]) {
                    onFileChange(ev, self.watchIndex[filePath], self);
                } else {
                    //Check if we match any patterns. If yes, then add a new file fileWatcher
                    var matchFunc = getPatternMatchFunction(watch.path, self.config.root, self.patterns);
                    var matchedPatterns = matchFunc(self.excludedPatterns.concat(self.excludedDirectories));
                    if (matchedPatterns.length) {
                        var fileWatcher = fs.watch(match.path, function(ev, filename) {
                            onFileChange(ev, watch, self);
                        });
                        self.watchIndex[filePath] = {
                            path: filePath,
                            fileWatcher: fileWatcher,
                            type: "file",
                            patterns: matchedPatterns
                        };
                    }
                }
            });
        });
    };

    module.exports = Watch;
}());
