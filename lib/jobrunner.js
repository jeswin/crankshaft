(function () {
    "use strict";

    var Job = require('./job'),
    co = require("co"),
    coTools = require('co-parallel-tools');

    var JobRunner = function(queue, options) {
        this.queue = queue;
        this.options = options || { threads : 1};
    };


    /*
        Runs a list of jobs.
        Dependent jobs must be in the list, or must be in queue.jobs.
    */
    JobRunner.prototype.run = function*(jobs) {
        if (!(jobs instanceof Array)) {
            jobs = [jobs];
        }

        var self = this;
        var jobList = [];

        if (this.isRunning)
            throw new Error("Cannot call JobRunner.run while it is already in running state");

        this.isRunning = true;

        // Checks if all dependent jobs have completed.
        var isSignaled = function(jobData) {
            //Already done?
            if (jobData.tasks && jobData.tasks.length === 0)
                return false;

            //Not done yet.
            for (var i = 0; i < jobData.job.deps.length; i++) {
                var dep = jobData.job.deps[i];
                var matches = jobList.filter(function(r) {
                    return r.job.name === dep;
                });
                if (!matches.length)
                    throw new Error("Cannot find dependent job " + dep + " for job " + jobData.job.name);
                else
                    if ((typeof matches[0].tasks === "undefined") || (matches[0].totalTasks > matches[0].completedTasks))
                        return false;
            }
            return true;
        };

        var activeThreads = 0;

        // The scheduler will schedule as many threads as needed to match self.options.threads
        // generatorRecursionCount is used to set a max limit on how many times generators recurse.
        var scheduler = function(generatorRecursionCount) {
            var generators = [];
            var threadCtr = self.options.threads - activeThreads;
            activeThreads += threadCtr;
            if (threadCtr > 0) {
                generatorRecursionCount += threadCtr;
                while (threadCtr--) {
                    generators.push(function*() {
                        yield* next(generatorRecursionCount);
                    });
                }
            }
            return generators;
        };

        // This is where actual work happens.
        var next = function*(generatorRecursionCount) {
            // Signal all jobs that can run
            var fn, jobData;
            var signaled = jobList.filter(isSignaled);

            for(let i = 0; i < signaled.length; i++) {
                if (typeof(signaled[i].tasks) === "undefined" && !signaled[i].isStarting) {
                    signaled[i].isStarting = true;
                    signaled[i].tasks = yield* signaled[i].job.getTasks();
                    signaled[i].totalTasks = signaled[i].tasks.length;
                    signaled[i].isStarting = false;
                }
            }

            for(let i = 0; i < signaled.length; i++) {
                if (signaled[i].tasks && signaled[i].tasks.length) {
                    fn = signaled[i].tasks.shift();
                    jobData = signaled[i];
                    break;
                }
            }

            if (fn) {
                yield* coTools.doYield(fn);
                jobData.completedTasks++;
                activeThreads--;

                if (generatorRecursionCount < 400) {
                    var generators = scheduler(generatorRecursionCount);
                    yield* coTools.parallel(generators);
                }
            } else {
                activeThreads--;
            }
        };

        var addToJobList = function(job, jobList) {
            //See if the job is already in the jobList
            var isInList = jobList.some(function(item) {
                return item.job.name === job.name;
            });

            //Nope. Not in the jobList, we should add it.
            if (!job.name || !isInList) {
                //job is not in the jobList already.
                //We must add it.
                jobList.push({
                    job: job,
                    completedTasks: 0,
                    totalTasks: 0,
                });

                //Find all dependent jobs
                var deps = jobs.concat(self.queue.jobs).filter(function(t) {
                    return job.deps.indexOf(t.name) > -1;
                });

                //....recursively, of course.
                deps.forEach(function(dep) {
                    addToJobList(dep, jobList);
                });
            }
        };


        //In single job mode, build the list of dependencies
        for (var i = 0; i < jobs.length; i++) {
            addToJobList(jobs[i], jobList);
        }


        //We need to run things in parallel.
        var signaled = jobList.filter(isSignaled);
        while ((signaled = jobList.filter(isSignaled)).length > 0) {
            var generators = scheduler(0);
            yield* coTools.parallel(generators);
        }

        this.isRunning = false;
    };

    module.exports = JobRunner;

}());
