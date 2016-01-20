/* @flow */
import fs from 'fs';
import path from 'path';
import promisify from 'nodefunc-promisify';
import { ensureLeadingSlash, ensureTrailingSlash, resolveDirPath } from "./filepath-utils";
import JobBase from './job-base';
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

type WatchedDirsEntryType = {
  path: string,
  type: string
};

type WalkResultEntriesItemType = {
  path: string,
  type: string
};

type WalkResultType = {
  dir: string,
  recurse: boolean,
  important: boolean,
  pattern: WatchPattern,
  entries: {
    paths: Array<WalkResultEntriesItemType>
  }
};


const readdir = promisify(fs.readdir.bind(fs));
const stat = promisify(fs.stat.bind(fs));


/*
Conditions for exclusion are
1. pattern isn't important AND
2. excludedPattern tests resolvedPath AND
3. excludedPattern.dir isn't set OR excludedPattern.dir is set but is longer than pattern.dir
*/
const getExcludeDirectoryPredicate = function(dir, root, pattern) {
  const resolvedPath = resolveDirPath(root, dir);
  return function(excludedPattern) {
    return !pattern.important && excludedPattern.regex.test(resolvedPath) && (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
  };
};


export default class Watch extends JobBase<IConfiguration> {

  fn: (filePath: string, changeType: string, patterns: Array<WatchPattern>) => Promise;
  path: string;
  fileWatcher: Object;
  patterns: Array<Object>;
  watchedFiles: Array<WatchedFilesEntryType>;
  watchedDirs: Array<WatchedDirsEntryType>;
  watchIndex: Object;
  excludedPatterns: Array<WatchPattern>;
  excludedDirectories: Array<WatchPattern>;


  constructor(patterns: Array<WatchPattern>, fn: (filePath: string, changeType: string, patterns: Array<WatchPattern>) => Promise, parent: IConfiguration, name: string, deps: Array<string>) {
    super(parent, name, deps);

    this.fn = fn;

    this.patterns = patterns;
    this.excludedPatterns = patterns.filter(p => p.exclude === "file");
    this.excludedDirectories = patterns.filter(p => p.exclude === "dir");

    this.watchedDirs = [];
    this.watchedFiles = [];

    //This is an index with key as the watched file path and value as match information (watcher, patterns ..)
    this.watchIndex = {};
  }


  async getTasks() : Promise {
    const self = this;

    const directoryCache = {};

    const walk = async function(dir, recurse, pattern, excludedDirs) {
      let results = [{ path: dir, type: 'dir' }];
      let dirEntries;

      if (!directoryCache[dir]) {
        dirEntries = [];
        try {
          const _paths = await readdir(dir);
          for (let i = 0; i < _paths.length; i++) {
            const _rootRelativePath = path.join(dir, _paths[i]);
            const _info = await stat(_rootRelativePath);
            dirEntries.push({ path: _paths[i], info: _info, rootRelativePath: _rootRelativePath });
          }
          directoryCache[dir] = dirEntries;
        }
        catch(ex) {
          throw ex;
        }
      } else {
        dirEntries = directoryCache[dir];
      }

      for (let j = 0; j < dirEntries.length; j++) {
        const entry = dirEntries[j];
        if (entry.info.isDirectory()) {
          const dirExcludePredicate = getExcludeDirectoryPredicate(entry.rootRelativePath, self.parent.root, pattern);
          if (!excludedDirs.some(dirExcludePredicate)) {
            results.push({ path: entry.rootRelativePath, type: 'dir' });
            if (recurse) {
              results = results.concat(await walk(entry.rootRelativePath, recurse, pattern, excludedDirs));
            }
          }
        } else {
          //We will include all files now, irrespective of pattern filters.
          //This is done so that we could do a single directory read for src/*.js and src/*.txt and do filtration later.
          results.push({ path: entry.rootRelativePath, type: 'file' });
        }
      }
      return results;
    };


    /*
    Walk directories with caching.
    If a directory has already been walked, the same results are returned.
    */
    const walkedDirectories: Array<WalkResultType> = [];
    const getDirWalker = function(pattern: WatchPattern) : () => Promise<WalkResultType> {
      const alreadyWalked = walkedDirectories.filter(function(d) { return d.dir === pattern.dir && d.recurse === pattern.recurse && d.important === pattern.important; });
      if (alreadyWalked.length) {
        return async function() {
          return {
            dir: pattern.dir,
            recurse: pattern.recurse,
            important: pattern.important,
            pattern: pattern,
            entries: alreadyWalked[0].entries
          };
        };
      } else {
        return async function() {
          const paths = await walk(pattern.dir, pattern.recurse, pattern, self.excludedDirectories);
          const walkResult: WalkResultType = {
            dir: pattern.dir,
            recurse: pattern.recurse,
            important: pattern.important,
            pattern,
            entries: { paths }
          };
          walkedDirectories.push(walkResult);
          return walkResult;
        };
      }
    };

    /*
    If the pattern directory is not excluded, create a dirWalker
    */
    const dirWalkers = this.patterns.filter((pattern) => {
      const predicate = getExcludeDirectoryPredicate(pattern.dir, self.parent.root, pattern);
      return !self.excludedDirectories.some(predicate);
    }).map(pattern => getDirWalker(pattern));


    /*
    Run directory walking in parallel.
    */
    const pathsInPatternRoots = await Promise.all(dirWalkers.map(f => f()));

    /*
    From the results, we need to create a list of files and directories that need to be watched.
    */
    const addWatchedDir = function(entry) {
      self.watchedDirs.push({
        path: entry.path,
        type: entry.type
      });
    };

    /*
    We haven't filtered the file list yet.
    1. Check if the file path matches pattern AND
    2. If it is either marked important OR (does not test with excludedPatterns or does so with less specificity)
    */
    const addWatchedFile = function(entry, pattern) {
      const resolvedPath = path.resolve(entry.path);
      if (
        pattern.regex.test(resolvedPath) &&
        (
          pattern.important ||
          !self.excludedPatterns.some(function(excludedPattern) {
            return excludedPattern.regex.test(resolvedPath) && excludedPattern.dir.length >= pattern.dir.length;
          })
        )
      ) {
        const existing = self.watchedFiles.filter(function(e) { return e.path === entry.path; });
        if (existing.length) {
          existing[0].patterns.push(pattern);
        } else {
          self.watchedFiles.push({
            path: entry.path,
            type: entry.type,
            patterns: [pattern],
            fileWatcher: null
          });
        }
      }
    };

    pathsInPatternRoots.forEach(function(walkResult) {
      walkResult.entries.paths.forEach(function(entry) {
        if (entry.type === "dir") {
          addWatchedDir(entry);
        } else if (entry.type === "file") {
          addWatchedFile(entry, walkResult.pattern);
        }
      });
    });


    return self.watchedFiles.map(function(entry) {
      return async function() {
        await self.fn(entry.path, "change", entry.patterns);
      };
    });
  };

  startMonitoring(_onFileChange: OnFileChangeDelegate) {
    const self = this;

    //Fire fileChange if path conditions are met.
    const onFileChange = function(ev, watch) {
      _onFileChange(ev, watch, self, self.parent);
    };

    /*
    Create watches for the file list we have previously identified
    */
    this.watchedFiles.forEach(function(watch) {
      const resolvedPath = path.resolve(self.parent.root, watch.path);
      const fileWatcher = fs.watch(watch.path, function(ev, filename) {
        onFileChange(ev, watch);
      });
      watch.fileWatcher = fileWatcher;
      self.watchIndex[watch.path] = watch;
    });

    /*
    Create watches for the directories we have previously identified
    */
    this.watchedDirs.forEach(function(watch) {
      fs.watch(watch.path, function(ev, filename) {
        const filePath = path.join(watch.path, filename);

        //If there is an existing fileWatcher, the file is already being watched.
        if (self.watchIndex[filePath]) {
          onFileChange(ev, self.watchIndex[filePath]);
        } else {
          const resolvedPath = path.resolve(self.parent.root, filePath);
          const matchingPatterns = self.patterns.filter(function(pattern) {
            return pattern.regex.test(resolvedPath) &&
            (
              pattern.important ||
              !self.excludedPatterns.some(function(excludedPattern) {
                return excludedPattern.regex.test(resolvedPath) &&
                (!excludedPattern.dir || (excludedPattern.dir.length >= pattern.dir.length));
              })
            );
          });

          if (matchingPatterns.length) {
            const watchInfo : WatchedFilesEntryType = {
              path: filePath,
              fileWatcher: null,
              type: "file",
              patterns: matchingPatterns
            };
            const fileWatcher = fs.watch(filePath, function(ev, filename) {
              onFileChange(ev, watchInfo);
            });
            watchInfo.fileWatcher = fileWatcher;
            self.watchIndex[filePath] = watchInfo;
          }
        }
      });
    });
  };
}
