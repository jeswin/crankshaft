(function() {
    "use strict";

    var co = require("co");
    var Build = require('./build');

    module.exports = {
        create: function(options) {
            return new Build(options);
        },

        run: function(build, monitor, cb) {
            return co(function*() {
                yield* build.start(monitor, cb);
            });
        }
    };
})();
