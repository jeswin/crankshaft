(function () {
    "use strict";

    var Job = require('./job'),
        Watch = require('./watch'),
        JobRunner = require('./jobrunner');


    var JobQueue = function(root, build) {
        this.root = root;
        this.build = build;
        this.activeJobs = [];
        this.jobs = [];
        this.onStartJobs = [];
        this.onCompleteJobs = [];
        this.queuedJobs = [];
    };


    JobQueue.prototype.job = function(fn, name, deps) {
        var job = new Job(fn, name, deps, this, {});
        this.jobs.push(job);
        return job;
    };


    JobQueue.prototype.onStart = function(fn, name, deps) {
        var job = new Job(fn, name, deps, this, {});
        this.onStartJobs.push(job);
        return job;
    };


    JobQueue.prototype.onComplete = function(fn, name, deps) {
        var job = new Job(fn, name, deps, this, {});
        this.onCompleteJobs.push(job);
        return job;
    };


    JobQueue.prototype.dequeue = function(fn) {
        this.queuedJobs = this.queuedJobs.filter(function(f) {
            return f.fn !== fn;
        });
    };


    JobQueue.prototype.queue = function(fn, allowDuplicates) {
        if (!allowDuplicates) {
            this.queuedJobs = this.queuedJobs.filter(function(f) {
                return f.fn !== fn;
            });
        }
        this.queuedJobs.push({ fn: fn });
    };


    JobQueue.prototype.run = function*(fn, name, deps, config, options) {
        var runner = new JobRunner(this.jobs, { threads: this.build.options.threads });
        yield* runner.run(fn, name, deps, config, options);
    };


    JobQueue.prototype.runQueuedJobs = function*() {
        while (this.queuedJobs.length) {
            var job  = this.queuedJobs.shift();
            var runner = new JobRunner(this.jobs, { threads: this.build.options.threads });
            yield* runner.run(job.fn);
        }
    };


    JobQueue.prototype.runJobs = function*() {
        this.queuedJobs = [];

        process.chdir(this.root);

        var options = { threads: this.build.options.threads };

        var startRunner = new JobRunner(this.onStartJobs, options);
        yield* startRunner.run();

        var jobRunner = new JobRunner(this.activeJobs, options);
        yield* jobRunner.run();

        var completionRunner = new JobRunner(this.onCompleteJobs, options);
        yield* completionRunner.run();

        yield* this.runQueuedJobs();

        process.chdir(this.build.root);
    };


    module.exports = JobQueue;
}());
