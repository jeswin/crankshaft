(function () {
    "use strict";
    var coTools = require('./co-tools')(typeof ENABLE_DEBUG_MODE !== "undefined" && ENABLE_DEBUG_MODE);

    var Job = function(fn, name, deps, parent, options) {
        this.fn = fn;
        this.name = name || "undefined";

        this.deps = deps || [];
        if (typeof deps === "string")
            this.deps = [deps];

        this.parent = parent;
        this.options = options;
    };


    Job.prototype.getTasks = function*() {
        var self = this;
        return [function*() { yield* coTools.doYield(self.fn, self.parent); }];
    };

    module.exports = Job;
}());
