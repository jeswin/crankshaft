(function () {
    "use strict";
    var coTools = require('co-parallel-tools');

    var Job = function(fn, name, deps, config, options) {
        this.fn = fn;
        this.name = name || "undefined";

        this.deps = deps || [];
        if (typeof deps === "string")
            this.deps = [deps];

        this.config = config;
        this.options = options;
    };


    Job.prototype.getTasks = function*() {
        var self = this;
        return [function*() { yield* coTools.doYield(self.fn, self.config); }];
    };

    module.exports = Job;
}());
