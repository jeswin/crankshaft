/* @flow */
import Job from './job';

type IJobQueue = {
    jobs: Array<Job>
};

type JobListEntryType = {
    job: Job,
    tasks: Array<() => Promise>,
    initialized: boolean,
    completedTasks: number,
    totalTasks: number,
    isStarting: boolean
};

type JobListType = Array<JobListEntryType>;

export default class JobRunner {

    queue: IJobQueue;
    threads: number;
    isRunning: boolean;

    constructor(queue: IJobQueue) {
        this.queue = queue;
        this.threads = queue.threads || 4;
        this.isRunning = false;
    }

    /*
        Runs a list of jobs.
        Dependent jobs must be in the list, or must be in queue.jobs.
    */
    async run(job: Job) : Promise {
        await this.runMany([job]);
    }

    async runMany(jobs: Array<Job>) : Promise {
        if (!(jobs instanceof Array)) {
            jobs = [jobs];
        }

        const self = this;
        const jobList: JobListType = [];

        if (this.isRunning)
            throw new Error("Cannot call JobRunner.run() while it is already in running state");

        this.isRunning = true;

        // Checks if all dependent jobs have completed.
        const canSignal = function(jobData) {
            //Already done or is it in the process of starting?
            if ((jobData.tasks && jobData.tasks.length === 0) || jobData.isStarting)
                return false;

            //Not done yet.
            for (let i = 0; i < jobData.job.deps.length; i++) {
                const dep = jobData.job.deps[i];
                const matches = jobList.filter(function(r) {
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

        let activeThreads = 0;

        // The scheduler will schedule as many threads as needed to match self.threads
        // generatorRecursionCount is used to set a max limit on how many times generators recurse.
        const scheduler = function(generatorRecursionCount) {
            const pseudoThreads = [];
            let threadCtr = self.threads - activeThreads;
            activeThreads += threadCtr;
            if (threadCtr > 0) {
                generatorRecursionCount += threadCtr;
                while (threadCtr--) {
                    pseudoThreads.push(async function() {
                        await next(generatorRecursionCount);
                    });
                }
            }
            return pseudoThreads;
        };

        // This is where actual work happens.
        const next = async function(generatorRecursionCount) {
            // Signal all jobs that can run
            const signaled = jobList.filter(canSignal);

            for(let i = 0; i < signaled.length; i++) {
                if (!signaled[i].initialized) {
                    signaled[i].initialized = true;
                    signaled[i].isStarting = true;
                    signaled[i].tasks = await signaled[i].job.getTasks();
                    signaled[i].totalTasks = signaled[i].tasks.length;
                    signaled[i].isStarting = false;
                }
            }

            for(let i = 0; i < signaled.length; i++) {
                if (signaled[i].tasks && signaled[i].tasks.length) {
                    const jobData: JobListEntryType = signaled[i];
                    const fn: () => Promise = jobData.tasks.shift();
                    await fn();
                    jobData.completedTasks++;
                    if (generatorRecursionCount < 400) {
                        const pseudoThreads = scheduler(generatorRecursionCount);
                        let promises = pseudoThreads.map(f => f());
                        await Promise.all(promises);
                    }
                    break;
                }
            }

            activeThreads--;
        };

        const addToJobList = function(job: Job, jobList: JobListType) {
            //See if the job is already in the jobList
            const isInList = jobList.some(function(item) {
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
                    isStarting: false,
                    tasks: [],
                    initialized: false
                });

                //Find all dependent jobs
                const deps = jobs.concat(self.queue.jobs).filter(function(t) {
                    return job.deps.indexOf(t.name) > -1;
                });

                //....recursively, of course.
                deps.forEach(function(dep) {
                    addToJobList(dep, jobList);
                });
            }
        };


        //In single job mode, build the list of dependencies
        for (let i = 0; i < jobs.length; i++) {
            addToJobList(jobs[i], jobList);
        }


        //We need to run things in parallel.
        let signaled = jobList.filter(canSignal);
        while ((signaled = jobList.filter(canSignal)).length > 0) {
            const pseudoThreads = scheduler(0);
            let promises = pseudoThreads.map(f => f());
            await Promise.all(promises);
        }

        this.isRunning = false;
    };
}
