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
            job.startMonitoring(onFileChange);
        });
    };

    module.exports = Configuration;
}());
