/* @flow */
import Build from './build';

type CrankshaftOptionsType = { threads: number };

export default {
  create: function(options: CrankshaftOptionsType) : Build {
    return new Build(options.threads);
  },

  run: async function(build: Build, monitor: boolean, cb: () => void) : Promise {
    await build.start(monitor, cb);
  }
}
