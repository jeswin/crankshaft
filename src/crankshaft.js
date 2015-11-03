import Build from './build';

export default {
    create: function(options) {
        return new Build(options);
    },

    run: async function(build, monitor, cb) {
        await build.start(monitor, cb);
    }
}
