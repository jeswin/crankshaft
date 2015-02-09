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
            if (pattern.exclude === "directory") {
                if (typeof pattern.dir === "string") {
                    pattern.regex = new RegExp("^" + pattern.excludeDirectory + "\/");
                }
                this.excludedDirectories.push(pattern);
            } else {
                if (!pattern.recurse)
                    pattern.recurse = true;

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

    Watch.prototype.getTasks = function*() {
        var self = this;

        var walk = function*(dir, recurse) {
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
                    results.push({ path: fullPath, type: 'dir' });
                    if (recurse) {
                        results = results.concat(yield* walk(fullPath, recurse));
                    }
                } else {
                    results.push({ path: fullPath, type: 'file' });
                }
            }
            return results;
        };

        var wrapWalker = function(pattern) {
            return function*() {
                return {
                    files: yield* walk(pattern.dir, pattern.recurse),
                    pattern: pattern
                };
            };
        };

        var dirWalkers = this.patterns.map(function(pattern) {
            if (!self.excludedDirectories.some(function(excluded) { return excluded.regex.test(pattern.dir); })) {
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
                    var mustExclude = function(excludedPattern) { return excludedPattern.regex.test(entry.path); };
                    if (filesInPattern.pattern.regex.test(entry.path) &&
                        self.watchedFiles.indexOf(entry.path) === -1 &&
                        !self.excludedPatterns.some(mustExclude))
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

    module.exports = Watch;
}());
