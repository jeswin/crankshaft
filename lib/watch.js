(function () {
    "use strict";

    var fs = require('fs'),
        path = require('path'),
        generatorify = require('nodefunc-generatorify'),
        readdir = generatorify(fs.readdir),
        stat = generatorify(fs.stat),
        coTools = require('./co-tools');

    var Job = require('./job');

    var Watch = function(patterns, fn, name, deps, parent, options) {
        Job.call(this, fn, name, deps, parent, options);
        this.patterns = [];
        this.excludedPatterns = [];
        this.excludedDirectories = [];

        this.watchedFiles = [];
        this.watchedDirs = [];
        this.watchers = {};

        patterns.forEach(function(pattern) {
            if (typeof pattern === "string") {
                var result = {};
                //!*.txt means the watch should exclude all text files.
                if (/^!/.test(pattern)) {
                    result.exclude = "file";
                    pattern = pattern.substr(1);
                }
                result.file = path.basename(pattern);
                result.dir = path.dirname(pattern);

                pattern = result;
            }

            if (!pattern.recurse)
                pattern.recurse = true;

            if (pattern.exclude === "directory") {
                if (typeof pattern.dir === "string") {
                    pattern.regex = new RegExp("^" + pattern.dir.replace(new RegExp("\/", "g"), "\\/") + "\\/");
                }
                this.excludedDirectories.push(pattern);
            } else {
                if (!pattern.regex) {
                    var baseDir = pattern.dir !== "." ? pattern.dir.replace(new RegExp("\/", "g"), "\\/") + "\\/" : "";
                    pattern.regex = new RegExp(baseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                }

                if (pattern.exclude) {
                    this.excludedPatterns.push(pattern);
                } else {
                    this.patterns.push(pattern);
                }
            }

        }, this);
    };

    Watch.prototype = Object.create(Job.prototype);
    Watch.prototype.constructor = Watch;

    var mustExclude = function(path) {
        return function(excludedPattern) {
            return excludedPattern.regex.test(path);
        };
    };

    var mustExcludeDirectory = function(dir) {
        return mustExclude(/\/$/.test(dir) ? dir : dir + "/");
    };

    Watch.prototype.getTasks = function*() {
        var self = this;

        var walk = function*(dir, recurse, excludedDirectories) {
            var results = [];

            var files = [];
            try {
                files = yield* readdir(dir);
            }
            catch(ex) {
                console.log("Skipped reading " + dir + ": " + ex.toString());
            }

            for (var i = 0; i < files.length; i++) {
                var fullPath = path.join(dir, files[i]);
                var info = yield* stat(fullPath);
                if (info.isDirectory()) {
                    if (!excludedDirectories.some(mustExcludeDirectory(files[i]))) {
                        results.push({ path: fullPath, type: 'dir' });
                        if (recurse) {
                            results = results.concat(yield* walk(fullPath, recurse, excludedDirectories));
                        }
                    }
                } else {
                    results.push({ path: fullPath, type: 'file' });
                }
            }
            return results;
        };

        //Exclusions that apply recursively. This means that pattern.dir will be excluded at all levels.
        //eg: { dir: "node_modules", exclude: "directory", recurse: true } will exclude /a/b/node_modules/x/y
        var recursivelyExcludedDirectories = self.excludedDirectories.filter(function(p) { return p.recurse; });

        var wrapWalker = function(pattern) {
            return function*() {
                return {
                    files: yield* walk(pattern.dir, pattern.recurse, recursivelyExcludedDirectories),
                    pattern: pattern
                };
            };
        };

        var dirWalkers = this.patterns.map(function(pattern) {
            if (!self.excludedDirectories.some(mustExclude(pattern.dir))) {
                return wrapWalker(pattern);
            }
        });

        var filesInPatternRoots = yield* coTools.parallel(dirWalkers);

        var yieldables = [];
        filesInPatternRoots.forEach(function(filesInPattern) {
            filesInPattern.files.forEach(function(entry) {
                if (entry.type === "dir") {
                    self.watchedDirs.push(entry.path);
                } else if (entry.type === 'file') {
                    if (!filesInPattern.pattern.nowatch &&
                        filesInPattern.pattern.regex.test(entry.path) &&
                        self.watchedFiles.indexOf(entry.path) === -1 &&
                        !self.excludedPatterns.some(mustExclude(entry.path)) &&
                        !self.excludedDirectories.some(mustExcludeDirectory(path.dirname(entry.path))))
                    {
                        yieldables.push(function*() {
                            yield* coTools.doYield(self.fn, self.parent, [entry.path, "change", filesInPattern.pattern]);
                        });
                        self.watchedFiles.push(entry.path);
                    }
                }
            });
        });

        return yieldables;
    };

    Watch.prototype.startMonitoring = function(_onFileChange, config) {
        var self = this;

        this.watchers = {};

        //Fire fileChange if path conditions are met.
        var onFileChange = function(ev, filePath, watcher, self, config) {
            if (!self.excludedPatterns.some(mustExclude(filePath)) &&
                !self.excludedDirectories.some(mustExcludeDirectory(path.dirname(filePath)))) {
                _onFileChange(ev, filePath, watcher, self, config);
            }
        };

        this.watchedFiles.forEach(function(filePath) {
            var watcher = fs.watch(filePath, function(ev, filename) {
                onFileChange(ev, filePath, watcher, self, config);
            });
            self.watchers[filePath] = watcher;
        });

        this.watchedDirs.forEach(function(dirPath) {
            fs.watch(dirPath, function(ev, filename) {
                var filePath = path.join(dirPath, filename);
                if (self.watchers[filePath]) {
                    onFileChange(ev, filePath, self.watchers[filePath], self, config);
                } else {
                    //Check if we match any patterns. If yes, then add a new file watcher
                    if (self.patterns.some(function(p) { return p.regex.test(filePath); })) {
                        var watcher = fs.watch(path.join(config.root, filePath), function(ev, filename) {
                            onFileChange(ev, filePath, watcher, self, config);
                        });
                        self.watchers[filePath] = watcher;
                    }
                }
            });
        });
    };

    module.exports = Watch;
}());
