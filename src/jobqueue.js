/* @flow */
import Job from './job';
import Watch from './watch';
import JobRunner from './jobrunner';
import Build from "./build";

type JobQueueOptionsType = { threads: number };

export default class JobQueue {

    root: string;
    activeJobs: Array<Job>;
    jobs: Array<Job>;
    onStartJobs: Array<Job>;
    onCompleteJobs: Array<Job>;
    queuedJobs: Array<Job>;
    build: Build;
    options: JobQueueOptionsType;

    constructor(root: string, options: JobQueueOptionsType) {
        this.root = root;
        this.activeJobs = [];
        this.jobs = [];
        this.onStartJobs = [];
        this.onCompleteJobs = [];
        this.queuedJobs = [];
        this.options = this.options || { threads: 4 };
    }


    job(fn: FnActionType, name: string, deps: Array<string>) : Job {
        const _job = new Job(fn, name, deps, this);
        this.jobs.push(_job);
        return _job;
    }


    onStart(fn: FnActionType, name: string, deps: Array<string>) : Job {
        const job = new Job(fn, name, deps, this);
        this.onStartJobs.push(job);
        return job;
    }


    onComplete(fn: FnActionType, name: string, deps: Array<string>) : Job {
        const job = new Job(fn, name, deps, this);
        this.onCompleteJobs.push(job);
        return job;
    }


    dequeue(name: string) {
        this.queuedJobs = this.queuedJobs.filter(j => j.name !== name);
    }


    queue(name: string, allowDuplicates: boolean) {
        if (allowDuplicates !== false || !this.queuedJobs.some(j => j.name === name)) {
            const matchingJob = this.jobs.filter(j => j.name === name);
            if (!matchingJob.length) {
                throw new Error(`Job ${name} was not found.`);
            }
            const job = matchingJob[0];
            this.queuedJobs.push(job);
            return job;
        }
    }


    async run(name: string) : Promise {
        const jobs = this.jobs.filter(function(t) {
            return t.name === name;
        });
        if (jobs.length) {
            const job = jobs[0];
            const runner = new JobRunner(this, { threads: this.options.threads });
            await runner.run(job);
        } else {
            throw new Error(`The job ${name} was not found`);
        }
    }


    async runQueuedJobs() : Promise {
        while (this.queuedJobs.length) {
            const job  = this.queuedJobs.shift();
            const runner = new JobRunner(this, { threads: this.options.threads });
            await runner.run(job);
        }
    }


    async runJobs() : Promise {
        this.queuedJobs = [];

        const options = { threads: this.options.threads };

        const startRunner = new JobRunner(this, options);
        await startRunner.run(this.onStartJobs);

        const jobRunner = new JobRunner(this, options);
        await jobRunner.run(this.activeJobs);

        const completionRunner = new JobRunner(this, options);
        await completionRunner.run(this.onCompleteJobs);

        await this.runQueuedJobs();
    }
}
