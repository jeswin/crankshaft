import JobQueue from './jobqueue';
import Watch from './watch';
import fs from 'fs';
import path from 'path';

class Configuration extends JobQueue {

    constructor(root, build) {
        super(root, build);
        this.watchJobs = [];
    }


    watch(patterns, fn, name, deps) {
        if (typeof patterns === "string")
            patterns = [patterns];
        const job = new Watch(patterns, fn, name, deps, this, {});
        this.activeJobs.push(job);
        this.watchJobs.push(job);
        return job;
    }


    startMonitoring(onFileChange) {
        const self = this;
        this.watchJobs.forEach(function(job) {
            job.startMonitoring(onFileChange);
        });
    }

}

export default Configuration;
