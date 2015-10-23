/*
    A very simple test script.
*/
describe('build.run()', function() {
    describe('when executed', function(){
        it('should run all configurations without throwing an exception', function(done){
            let build = require('..').create({ threads: 4 });
            build.configure(require('./config'), 'data'); //data is the directory where the files are
            build.start(false, done); //false indicates that the build need not monitor files for changes.
        });
    });
});
