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
        const job = new Job(fn, name, deps, this, {});
        this.jobs.push(job);
        return job;
    }


    onStart(fn, name, deps) {
        const job = new Job(fn, name, deps, this, {});
        this.onStartJobs.push(job);
        return job;
    }


    onComplete(fn, name, deps) {
        const job = new Job(fn, name, deps, this, {});
        this.onCompleteJobs.push(job);
        return job;
    }


    dequeue(fn) {
        this.queuedJobs = this.queuedJobs.filter(function(f) {
            return f.fn !== fn;
        });
    }


    queue(fn, allowDuplicates) {
        if (!allowDuplicates) {
            this.queuedJobs = this.queuedJobs.filter(function(f) {
                return f.fn !== fn;
            });
        }
        this.queuedJobs.push({ fn: fn });
    }

    async run(name) {
        let job;
        const jobs = this.jobs.filter(function(t) {
            return t.name === fn;
        });
        if (jobs.length) {
            job = jobs[0];
        } else {
            throw new Error("The job " + fn + " was not found");
        }

        const runner = new JobRunner(this, { threads: this.build.options.threads });
        await runner.run(job);
    };


    async runQueuedJobs() {
        while (this.queuedJobs.length) {
            const job  = this.queuedJobs.shift();
            const runner = new JobRunner(this, { threads: this.build.options.threads });
            await runner.run(job);
        }
    };


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
    };
}

export default Job;
