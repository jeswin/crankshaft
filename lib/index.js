(function() {
    "use strict";

    var Build = require('./build');

    module.exports = {
        create: function(options) {
            return new Build(options);
        }
    };
})();
