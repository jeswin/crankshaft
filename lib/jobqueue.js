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


    JobQueue.prototype.run = function*(name) {
        var job;
        var jobs = this.jobs.filter(function(t) {
            return t.name === fn;
        });
        if (jobs.length) {
            job = jobs[0];
        } else {
            throw new Error("The job " + fn + " was not found");
        }

        var runner = new JobRunner(this, { threads: this.build.options.threads });
        yield* runner.run(job);
    };


    JobQueue.prototype.runQueuedJobs = function*() {
        while (this.queuedJobs.length) {
            var job  = this.queuedJobs.shift();
            var runner = new JobRunner(this, { threads: this.build.options.threads });
            yield* runner.run(job);
        }
    };


    JobQueue.prototype.runJobs = function*() {
        this.queuedJobs = [];

        process.chdir(this.root);

        var options = { threads: this.build.options.threads };

        var startRunner = new JobRunner(this, options);
        yield* startRunner.run(this.onStartJobs);

        var jobRunner = new JobRunner(this, options);
        yield* jobRunner.run(this.activeJobs);

        var completionRunner = new JobRunner(this, options);
        yield* completionRunner.run(this.onCompleteJobs);

        yield* this.runQueuedJobs();

        process.chdir(this.build.root);
    };


    module.exports = JobQueue;
}());
