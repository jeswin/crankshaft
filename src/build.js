/* @flow */
import fs from 'fs';
import path from 'path';
import Job from './job';
import Configuration from './configuration';
import JobQueue from './jobqueue';

let sleep = function(ms: number) : Promise {
    return new Promise((resolve, reject) => { setTimeout(resolve, ms); });
};

type FnConfigureType = (config: Configuration) => Configuration;

export default class Build extends JobQueue {

    configs: Array<Configuration>;
    state: Object;
    monitor: boolean;
    monitoring: boolean;


    constructor(options: JobQueueOptionsType) {
        super(process.cwd(), options);
        this.configs = [];
        this.state = {};
    }


    configure(fn: FnConfigureType, root: string) : Configuration {
        const configuration = new Configuration(root, this);
        this.configs.push(configuration);
        return fn(configuration);
    }


    async start(monitor: boolean, cb: () => void) : Promise {
        const self = this;

        this.monitor = monitor;
        const options = { threads: this.options.threads };

        this.activeJobs.push(
            new Job(async function() {
                for (let i = 0; i < self.configs.length; i++) {
                    const config = self.configs[i];
                    process.chdir(config.root);
                    config.state = {};
                    await config.runJobs();
                    process.chdir(self.root);
                }
            })
        );

        await this.runJobs();

        if (cb) cb();

        if (monitor)
            await this.startMonitoring();
    }


    async startMonitoring() : Promise {
        const self = this;
        const fileChangeEvents = [];
        let processedCycle = []; //The files which have changed in this change cycle
        this.monitoring = true;

        const onFileChange = function(ev, watch, job, config) {
            if (!fileChangeEvents.concat(processedCycle).some(function(c) { return c.watch.path === watch.path && c.config === config; })) {
                fileChangeEvents.push({ ev: ev, watch: watch, job: job, config: config });
            }
        };

        this.configs.forEach(function(config) {
            process.chdir(config.root);
            config.startMonitoring(onFileChange);
            process.chdir(self.root);
        });

        while(true) {
            processedCycle = [];

            while(fileChangeEvents.length) {
                const changeNotification = fileChangeEvents[0];
                process.chdir(changeNotification.config.root);

                //The exists check is to handle the temp files that many editors create.
                //They disappear instantaneously, and fs.watch will except.
                if (fs.existsSync(changeNotification.watch.path)) {
                    //If there is an existing file watcher, kill (and later recreate) watching that file.
                    //So that it won't get into a loop if fn changes the same file
                    if (changeNotification.watch.fileWatcher)
                        changeNotification.watch.fileWatcher.close();

                    //Push this to the list of files we won't monitor in this cycle.
                    processedCycle.push({ watch: changeNotification.watch, config: changeNotification.config });
                    await changeNotification.job.fn(changeNotification.watch.path, "change", changeNotification.watch.patterns);

                    //Remove the event. We have processed it.
                    fileChangeEvents.shift();

                    //Put the watch back.
                    (function(changeNotification) {
                        changeNotification.watch.fileWatcher = fs.watch(changeNotification.watch.path, function(ev, filename) {
                            onFileChange(ev, changeNotification.watch, changeNotification.job, changeNotification.config);
                        });
                    })(changeNotification);

                }
                process.chdir(this.root);
            }

            for (let i = 0; i < this.configs.length; i++) {
                if (this.configs[i].queuedJobs.length) {
                    process.chdir(this.configs[i].root);
                    await this.configs[i].runQueuedJobs();
                    process.chdir(this.root);
                }
            }

            if (this.queuedJobs.length)
                await this.runQueuedJobs();

            await sleep(500);
        }
    }
}
