(function () {
    "use strict";

    var Job = require('./job'),
        coTools = require('./co-tools')(ENABLE_DEBUG_MODE);

    var JobRunner = function(jobs, options) {
        this.jobs = jobs || [];
        this.options = options || { threads : 1};

    };


    /*
        If a job is explicitly passed in, only that job and its dependencies will be started.
        Otherwise we'll try to run everything.
    */
    JobRunner.prototype.run = function*(fn, name, deps, parent, options) {
        var singleJob;
        if (fn) {
            if (typeof fn !== "string") {
                singleJob = new Job(fn, name, deps, parent, options);
            } else {
                singleJob = this.jobs.filter(function(t) {
                    return t.name === fn;
                });
                if (singleJob.length)
                    singleJob = singleJob[0];
                else
                    throw new Error("The job " + fn + " was not found");
            }
        }

        if (this.isRunning)
            throw new Error("Cannot call JobRunner.run while it is already in running state");
        this.isRunning = true;

        var self = this;
        var jobList = [];
        var activeThreads = 0;

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
                    if ((typeof matches[0].tasks === "undefined") || (matches[0].total > matches[0].completed))
                        return false;
            }
            return true;
        };

        //Do the do.
        var next = function*() {
            // Signal all jobs that can run
            var fn, jobData;
            var signaled = jobList.filter(isSignaled);
            for(let i = 0; i < signaled.length; i++) {
                if (typeof(signaled[i].tasks) === "undefined" && !signaled[i].isStarting) {
                    signaled[i].isStarting = true;
                    signaled[i].tasks = yield* signaled[i].job.getTasks();
                    signaled[i].total = signaled[i].tasks.length;
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
                activeThreads++;
                yield* fn();
                activeThreads--;
                jobData.completed++;

                //Now that this work item has completed, it is time to queue more.
                var scheduled = scheduler();
                yield* coTools.parallel(scheduled);
            }
        };

        // Create a number of parallel jobs, equal to unused threads.
        var scheduler = function() {
            var gens = [];
            var threads = self.options.threads - activeThreads;
            if (threads > 0)
                while (threads--) gens.push(next);
            return gens;
        };

        //In single job mode, build the list of dependencies
        if (singleJob) {
            var addToJobList = function(job, jobList) {
                //See if the job is already in the jobList
                var matches = jobList.filter(function(t) {
                    return t.name === job.name;
                });

                //Nope. Not in the jobList, we should add it.
                if (!matches.length) {
                    //job is not in the jobList already.
                    //We must add it.
                    jobList.push({
                        job: job,
                        completed: 0,
                        total: 0,
                    });

                    //Also add dependencies for the job
                    var deps = self.jobs.filter(function(t) {
                        return job.deps.indexOf(t.name) > -1;
                    });
                    //....recursively, of course.
                    deps.forEach(function(dep) {
                        addToJobList(dep, jobList);
                    });
                }
            };
            addToJobList(singleJob, jobList);
        }
        //Otherwise, you can run everything
        else {
            for (var i = 0; i < this.jobs.length; i++) {
                jobList.push({
                    job: this.jobs[i],
                    completed: 0,
                    total: 0,
                });
            }
        }

        //Queue initial work items
        var scheduled = scheduler();
        yield* coTools.parallel(scheduled);

        this.isRunning = false;
    };

    module.exports = JobRunner;

}());
