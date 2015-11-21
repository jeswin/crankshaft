/* @flow */
import fs from 'fs';
import path from 'path';
import Watch from './watch';
import Job from "./job";
import Build from "./build";
import JobQueue from './jobqueue';
import { ensureLeadingSlash, ensureTrailingSlash, resolveDirPath } from "./filepath-utils";

export default class Configuration extends JobQueue {

    watchJobs: Array<Watch>;
    state: Object;

    constructor(root: string) {
        super(root);
        this.watchJobs = [];
    }


    watch(strPatterns: Array<string>, fn: () => Promise, name: string, deps: Array<string>) {
        const patterns = strPatterns.map((pattern) => {
            let result: PatternType;
            /*
                Exclamation mark at he beginning is a special character.
                1. "!!!hello" includes a file or directory named "!hello"
                2. "!!*.js" marks *.js as an important include. (overrides excludes)
                3. "!*.txt" means the watch should exclude all txt files.
            */
            if (/^!!!/.test(pattern)) {
                const _pattern = pattern.substr(2);
                result.file = path.basename(_pattern);
                result.dir = path.dirname(_pattern);
            } else if (/^!!/.test(pattern)) {
                const _pattern = pattern.substr(2);
                result.file = path.basename(_pattern);
                result.dir = path.dirname(_pattern);
                result.important = true;
            } else if (/^!/.test(pattern)) {
                const _pattern = pattern.substr(1);
                if (/\/$/.test(_pattern)) {
                    result.exclude = "dir";
                    result.dir = _pattern;
                } else {
                    result.exclude = "file";
                    result.file = path.basename(pattern);
                    result.dir = path.dirname(pattern);
                }
            } else {
                result.file = path.basename(pattern);
                result.dir = path.dirname(pattern);
            }
            if (typeof result.important === "undefined" || result.important === null)
                result.important = false;

            return result;
        });

        const job = new Watch(patterns, fn, name, deps, this);
        this.activeJobs.push(job);
        this.watchJobs.push(job);
        return job;
    }


    watchPatterns(patterns: Array<PatternType>, fn: () => Promise, name: string, deps: Array<string>) {
        patterns.forEach((pattern) => {
            if (pattern.regex && typeof pattern.regex === "string") {
                pattern.regex = new RegExp(pattern.regex);
            }

            if (pattern.exclude) {
                switch(pattern.exclude) {
                    case "dir":
                        if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                            pattern.recurse = true;
                        }
                        if (pattern.recurse) {
                            if (!pattern.regex) {
                                pattern.regex = new RegExp(ensureLeadingSlash(ensureTrailingSlash(pattern.dir)).replace(/\//g, "\\/"));
                            }
                        } else {
                            if (!pattern.regex) {
                                pattern.regex = new RegExp("^" + resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/"));
                            }
                        }
                        break;
                    case "file":
                        if (!pattern.regex) {
                            const excludeBaseDir = resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/");
                            pattern.regex = new RegExp(excludeBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                        }
                        break;
                    default:
                        throw new Error("Exclude type must be 'dir' or 'file'");
                }
            } else {
                if (!pattern.regex) {
                    const patternBaseDir = resolveDirPath(parent.root, pattern.dir).replace(/\//g, "\\/");
                    pattern.regex = new RegExp(patternBaseDir + "(.*\\/)?" + (pattern.file.replace(".", "\\.").replace("*", ".*") + "$"));
                }
                if (typeof pattern.recurse === "undefined" || pattern.recurse === null) {
                    pattern.recurse = true;
                }
            }
        });

        const job = new Watch(patterns, fn, name, deps, this, {});
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
