(function () {
    "use strict";

    var JobQueue = require('./jobqueue'),
        Watch = require('./watch'),
        fs = require('fs'),
        path = require('path');

    var Configuration = function(root, build) {
        JobQueue.call(this, root, build);
        this.watchJobs = [];
    };


    Configuration.prototype = Object.create(JobQueue.prototype);
    Configuration.prototype.constructor = Configuration;


    Configuration.prototype.watch = function(patterns, fn, name, deps) {
        if (typeof patterns === "string")
            patterns = [patterns];
        var job = new Watch(patterns, fn, name, deps, this, {});
        this.activeJobs.push(job);
        this.watchJobs.push(job);
        return job;
    };


    Configuration.prototype.startMonitoring = function(onFileChange) {
        var self = this;
        this.watchJobs.forEach(function(job) {
            job.watchers = {};

            job.watchedFiles.forEach(function(filePath) {
                var watcher = fs.watch(filePath, function(ev, filename) {
                    onFileChange(ev, filePath, watcher, job, self);
                });
                job.watchers[filePath] = watcher;
            });

            job.watchedDirs.forEach(function(dirPath) {
                fs.watch(dirPath, function(ev, filename) {
                    var filePath = path.join(dirPath, filename);
                    if (job.watchers[filePath]) {
                        onFileChange(ev, filePath, job.watchers[filePath], job, self);
                    } else {
                        //Check if we match any patterns. If yes, then add a new file watcher
                        if (job.patterns.filter(function(p) { return p.regex.test(filePath); }).length) {
                            var watcher = fs.watch(filePath, function(ev, filename) {
                                onFileChange(ev, filePath, watcher, job, self);
                            });
                            job.watchers[filePath] = watcher;
                        }
                    }
                });
            });
        });
    };

    module.exports = Configuration;
}());
