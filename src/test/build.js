build = require('..').create({ threads: 4 }); //That's right. Things get done in parallel.    
build.configure(require('./config'), 'data'); //data is the directory where your files are.
build.start(true, function() { console.log("Build is done. But we're still monintoring."); }); //build.start(true, cb) to keep monitoring

