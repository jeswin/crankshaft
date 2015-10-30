import Job from './job';
import Watch from './watch';
import JobRunner from './jobrunner';

class JobQueue {

    constructor(root, build) {
        this.root = root;
        this.activeJobs = [];
        this.jobs = [];
        this.onStartJobs = [];
        this.onCompleteJobs = [];
        this.queuedJobs = [];

        if (build) {
            this.build = build;
        }
    }


    job(fn, name, deps) {
        const job = new Job(fn, name, deps, this);
        this.jobs.push(job);
        return job;
    }


    onStart(fn, name, deps) {
        const job = new Job(fn, name, deps, this);
        this.onStartJobs.push(job);
        return job;
    }


    onComplete(fn, name, deps) {
        const job = new Job(fn, name, deps, this);
        this.onCompleteJobs.push(job);
        return job;
    }


    dequeue(name) {
        this.queuedJobs = this.queuedJobs.filter(j => j.name !== name);
    }


    queue(name, allowDuplicates) {
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


    async run(name) {
        const jobs = this.jobs.filter(function(t) {
            return t.name === name;
        });
        if (jobs.length) {
            const job = jobs[0];
            const runner = new JobRunner(this, { threads: this.build.options.threads });
            await runner.run(job);
        } else {
            throw new Error("The job " + fn + " was not found");
        }
    }


    async runQueuedJobs() {
        while (this.queuedJobs.length) {
            const job  = this.queuedJobs.shift();
            const runner = new JobRunner(this, { threads: this.build.options.threads });
            await runner.run(job);
        }
    }


    async runJobs() {
        this.queuedJobs = [];

        process.chdir(this.root);

        const options = { threads: this.build.options.threads };

        const startRunner = new JobRunner(this, options);
        await startRunner.run(this.onStartJobs);

        const jobRunner = new JobRunner(this, options);
        await jobRunner.run(this.activeJobs);

        const completionRunner = new JobRunner(this, options);
        await completionRunner.run(this.onCompleteJobs);

        await this.runQueuedJobs();

        process.chdir(this.build.root);
    }
}

export default JobQueue;
