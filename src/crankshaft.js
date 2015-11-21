/* @flow */
import Build from './build';

export default {
    create: function(options: BuildCtorArgsType) : Build {
        return new Build(options);
    },

    run: async function(build: Build, monitor: boolean, cb: () => void) : Promise {
        await build.start(monitor, cb);
    }
}
