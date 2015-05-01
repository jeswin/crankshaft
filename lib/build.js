(function () {
    "use strict";

    var fs = require('fs'),
        path = require('path');

    var Job = require('./job'),
        Configuration = require('./configuration'),
        JobQueue = require('./jobqueue');

    var coTools = require('co-parallel-tools');

    var Build = function(options) {
        JobQueue.call(this, process.cwd(), this);

        this.configs = [];
        this.state = {};

        this.options = options || {};
        this.options.threads = this.options.threads || 4;
    };

    Build.prototype = Object.create(JobQueue.prototype);
    Build.prototype.constructor = Build;


    Build.prototype.configure = function(fn, root) {
        var configuration = new Configuration(root, this);
        this.configs.push(configuration);
        fn.call(configuration);
        return configuration;
    };


    Build.prototype.start = function*(monitor, cb) {
        var self = this;

        this.jobQueue = [];
        this.monitor = monitor;

        var options = { threads: this.options.threads };

        this.activeJobs.push(
            new Job(function*() {
                for (var i = 0; i < self.configs.length; i++) {
                    self.configs[i].state = {};
                    yield* self.configs[i].runJobs();
                }
            })
        );

        yield* this.runJobs();

        if (cb) cb();

        if (monitor)
            yield* this.startMonitoring();
    };


    var sleep = function(ms) {
        return function (cb) {
            setTimeout(cb, ms);
        };
    };


    Build.prototype.startMonitoring = function*() {
        var self = this;
        var fileChangeEvents = [];
        var processedCycle = []; //The files which have changed in this change cycle
        this.monitoring = true;

        var onFileChange = function(ev, watch, job, config) {
            if (!fileChangeEvents.concat(processedCycle).some(function(c) { return c.watch.path === watch.path && c.config === config; }))
                fileChangeEvents.push({ ev: ev, watch: watch, job: job, config: config });
        };

        this.configs.forEach(function(config) {
            process.chdir(config.root);
            config.startMonitoring(onFileChange);
            process.chdir(self.root);
        });

        while(true) {
            processedCycle = [];

            while(fileChangeEvents.length) {
                var changeNotification = fileChangeEvents[0];

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

                    yield* coTools.doYield(changeNotification.job.fn, changeNotification.config, [changeNotification.watch.path, "change", changeNotification.watch.patterns]);

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

            for (var i = 0; i < this.configs.length; i++) {
                if (this.configs[i].queuedJobs.length) {
                    process.chdir(this.configs[i].root);
                    yield* this.configs[i].runQueuedJobs();
                    process.chdir(this.root);
                }
            }

            if (this.queuedJobs.length)
                yield* this.runQueuedJobs();

            yield sleep(1000);
        }
    };

    module.exports = Build;
}());
