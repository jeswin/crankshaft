(function () {
    "use strict";

    var fs = require('fs'),
        path = require('path'),
        generatorify = require('nodefunc-generatorify'),
        readdir = generatorify(fs.readdir),
        stat = generatorify(fs.stat),
        coTools = require('./co-tools')(typeof ENABLE_DEBUG_MODE !== "undefined" && ENABLE_DEBUG_MODE);

    var Job = require('./job');

    var Watch = function(patterns, fn, name, deps, parent, options) {
        Job.call(this, fn, name, deps, parent, options);
        this.patterns = [];

        this.watchedFiles = [];
        this.watchedDirs = [];

        patterns.forEach(function(pattern) {
            if (typeof pattern === "string") {
                var result = {};
                result.file = path.basename(pattern);
                result.dir = path.dirname(pattern);
                pattern = result;
            }

            if (!pattern.recurse)
                pattern.recurse = true;

            if (!pattern.regex) {
                var baseDir = pattern.dir !== "." ? pattern.dir.replace(new RegExp("\/", "g"), "\\/") + "\\/" : "";
                pattern.regex = new RegExp(baseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
            }

            this.patterns.push(pattern);

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


        var dirWalkers = [];

        var wrapWalker = function(i) {
            return function*() { return yield* walk(self.patterns[i].dir, self.patterns[i].recurse); };
        };
        for (var i = 0; i < this.patterns.length; i++) {
            dirWalkers.push(wrapWalker(i));
        }
        var pathList = yield* coTools.parallel(dirWalkers);

        var yieldables = [];
        pathList.forEach(function(paths) {
            paths.forEach(function(entry) {
                if (entry.type === "dir") {
                    self.watchedDirs.push(entry.path);
                } else if (entry.type === 'file') {
                    var matches = self.patterns.filter(function(p) { return p.regex.test(entry.path); });
                    if (matches.length) {
                        (function(matches) {
                            yieldables.push(function*() {
                                yield* coTools.doYield(self.fn, self.parent, [entry.path, "change", matches]);
                            });
                        })(matches);
                        if (self.watchedFiles.indexOf(entry.path) === -1)
                            self.watchedFiles.push(entry.path);
                    }
                }
            });
        });

        return yieldables;
    };

    module.exports = Watch;
}());
