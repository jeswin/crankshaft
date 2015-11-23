/* @flow */
import JobBase from './job-base';
import Job from './job';
import JobRunner from './jobrunner';
import Build from "./build";


export default class JobQueue {

    root: string;
    activeJobs: Array<JobBase>;
    jobs: Array<JobBase>;
    onStartJobs: Array<JobBase>;
    onCompleteJobs: Array<JobBase>;
    queuedJobs: Array<JobBase>;
    threads: number;

    constructor(root: string) {
        this.root = root;
        this.activeJobs = [];
        this.jobs = [];
        this.onStartJobs = [];
        this.onCompleteJobs = [];
        this.queuedJobs = [];
    }


    job(fn: () => Promise, name: string, deps: Array<string>) : Job {
        const _job = new Job(fn, this, name, deps);
        this.jobs.push(_job);
        return _job;
    }


    onStart(fn: () => Promise, name: string, deps: Array<string>) : Job {
        const job = new Job(fn, this, name, deps);
        this.onStartJobs.push(job);
        return job;
    }


    onComplete(fn: () => Promise, name: string, deps: Array<string>) : Job {
        const job = new Job(fn, this, name, deps);
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
            const runner = new JobRunner(this);
            await runner.run(job);
        } else {
            throw new Error(`The job ${name} was not found`);
        }
    }


    async runQueuedJobs() : Promise {
        while (this.queuedJobs.length) {
            const job  = this.queuedJobs.shift();
            const runner = new JobRunner(this);
            await runner.run(job);
        }
    }


    async runJobs() : Promise {
        this.queuedJobs = [];

        const startRunner = new JobRunner(this);
        await startRunner.runMany(this.onStartJobs);

        const jobRunner = new JobRunner(this);
        await jobRunner.runMany(this.activeJobs);

        const completionRunner = new JobRunner(this);
        await completionRunner.runMany(this.onCompleteJobs);

        await this.runQueuedJobs();
    }
}
