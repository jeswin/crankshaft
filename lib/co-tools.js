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
        return {
            parallel: function*(array) {
                if (debug) {
                    var results = [];
                    for(var i = 0; i < array.length; i++) {
                        if (isGeneratorFunction(array[i]))
                            results[i] = yield* array[i]();
                        else if (isGenerator(array[i]))
                            results[i] = yield* array[i];
                        else
                            throw new Error("Pass an array of generator functions or generators");
                    }
                    return results;
                } else {
                    return yield array;
                }
            },

            doYield: function*(fn, thisPtr, args) {
                if (isGeneratorFunction(fn)) {
                    yield* fn.apply(thisPtr, args);
                } else {
                    yield fn.apply(thisPtr, args);
                }
            }
        };
    };

})();
