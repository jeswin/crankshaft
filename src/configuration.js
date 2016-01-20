/* @flow */
import fs from 'fs';
import path from 'path';
import JobBase from "./job-base";
import Watch from './watch';
import JobQueue from './jobqueue';
import WatchPattern from "./watch-pattern";

type IConfiguration = {
  root: string
};

type OnFileChangeDelegate = (ev: string, watch: WatchedFilesEntryType, job: Watch, config: IConfiguration) => void;

type WatchedFilesEntryType = {
  path: string,
  type: string,
  patterns: Array<WatchPattern>,
  fileWatcher: any
};

export default class Configuration extends JobQueue {

  watchJobs: Array<Watch>;
  state: Object;

  constructor(root: string) {
    super(root);
    this.watchJobs = [];
  }


  watch(strPatterns: Array<string>, fn: () => Promise, name: string, deps: Array<string>) : JobBase {
    const patterns = strPatterns.map((pattern) => {
      /*
      Exclamation mark at the beginning is a special character.
      1. "!!!hello" includes a file or directory named "!hello"
      2. "!!*.js" marks *.js as an important include. (overrides excludes)
      3. "!*.txt" means the watch should exclude all txt files.
      */
      if (/^!!!/.test(pattern)) {
        const _pattern = pattern.substr(2);
        const file = path.basename(_pattern);
        const dir = path.dirname(_pattern);
        return new WatchPattern(file, dir, this.root);
      } else if (/^!!/.test(pattern)) {
        const _pattern = pattern.substr(2);
        const file = path.basename(_pattern);
        const dir = path.dirname(_pattern);
        return new WatchPattern(file, dir, this.root, "", true, true);
      } else if (/^!/.test(pattern)) {
        const _pattern = pattern.substr(1);
        if (/\/$/.test(_pattern)) {
          return new WatchPattern("", _pattern, this.root, "dir");
        } else {
          const file = path.basename(_pattern);
          const dir = path.dirname(_pattern);
          return new WatchPattern(file, dir, this.root, "file");
        }
      } else {
        const file = path.basename(pattern);
        const dir = path.dirname(pattern);
        return new WatchPattern(file, dir, this.root);
      }
    });

    return this.watchPatterns(patterns, fn, name, deps);
  }


  watchPatterns(patterns: Array<WatchPattern>, fn: () => Promise, name: string, deps: Array<string>) : JobBase {
    const job = new Watch(patterns, fn, this, name, deps);
    this.activeJobs.push(job);
    this.watchJobs.push(job);
    return job;
  }


  startMonitoring(onFileChange: OnFileChangeDelegate) : void {
    const self = this;
    this.watchJobs.forEach(function(job) {
      job.startMonitoring(onFileChange);
    });
  }

}
