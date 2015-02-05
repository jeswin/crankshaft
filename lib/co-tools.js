(function() {

    "use strict";

    /**
     * Check if `obj` is a generator.
     *
     * @param {Mixed} obj
     * @return {Boolean}
     * @api private
     */

    function isGenerator(obj) {
      return obj && 'function' == typeof obj.next && 'function' == typeof obj.throw;
    }

    /**
     * Check if `obj` is a generator function.
     *
     * @param {Mixed} obj
     * @return {Boolean}
     * @api private
     */

    function isGeneratorFunction(obj) {
      return obj && obj.constructor && 'GeneratorFunction' == obj.constructor.name;
    }

    module.exports = function(debug) {

        var parallel = function*(array) {
            if (debug) {
                var results = [];
                for(var i = 0; i < array.length; i++) {
                    results[i] = yield* doYield(array[i]);
                }
                return results;
            } else {
                return yield array;
            }
        };

        var doYield = function*(fn, thisPtr, args) {
            if (isGeneratorFunction(fn)) {
                return yield* fn.apply(thisPtr, args);
            } else {
                return yield fn.apply(thisPtr, args);
            }
        };

        return {
            parallel: parallel,
            doYield: doYield
        };
    };

})();
