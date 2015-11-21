/* @flow */
import fs from 'fs';
import path from 'path';
import Watch from './watch';
import Job from "./job";
import Build from "./build";
import JobQueue from './jobqueue';

type FnOnFileChangeType = (ev: string, watch: Watch, job: Job, config: Configuration) => void;

export default class Configuration extends JobQueue {

    watchJobs: Array<Watch>;
    state: Object;

    constructor(root: string, build: Build) {
        super(root, build);
        this.watchJobs = [];
    }


    watch(patterns: string | Array<string> | Array<PatternType>, fn: FnActionType, name: string, deps: Array<string>) {
        const _patterns: Array<string> | Array<PatternType> = (typeof patterns === "string") ? [patterns] : patterns;
        const job = new Watch(_patterns, fn, name, deps, this, {});
        this.activeJobs.push(job);
        this.watchJobs.push(job);
        return job;
    }


    startMonitoring(onFileChange: FnOnFileChangeType) {
        const self = this;
        this.watchJobs.forEach(function(job) {
            job.startMonitoring(onFileChange);
        });
    }

}
