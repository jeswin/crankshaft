(function() {
    "use strict";

    var Build = require('./build');
    var tools = require('./tools');

    module.exports = {
        create: function(options) {
            return new Build(options);
        },
        tools: tools
    };
})();
