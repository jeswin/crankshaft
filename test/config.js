/*
    Some external libs and functions we'll use in our build script
*/
co = require('co');
thunkify = require('fora-node-thunkify');
fs = require('fs');
path = require('path');

spawn = require('child_process').spawn;
_exec = require('child_process').exec;
exec = thunkify(function(cmd, cb) {
    _exec(cmd, function(err, stdout, stderr) {
        console.log(cmd);
        cb(err, stdout.substring(0, stdout.length - 1));
    });
});


/*
    Configuration Section.
*/
buildConfig = function() {
    /*
        The first task to run when the build starts.
        Let's call it "start_build". It just prints a message.

        Note: name (ie "start_build") isn't stricly required,
        but it allows us to declare it as a dependency in another job.
    */
    this.onStart(function*() {
        console.log("Let's start copying files...");
    }, "start_build");


    /*
        Let's create an app directory.
        We add "start_build" as a dependency, so that it runs after the message.
    */
    this.onStart(function*() {
        console.log("Creating app directory");
        yield* exec("rm app -rf");
        yield* exec("mkdir app");
    }, "create_dirs", ["start_build"]);


    /*
        A helper function to create directories which may not exist.
        We are going to use this in tasks below.
    */
    ensureDirExists = function*(file) {
        var dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
            yield* exec("mkdir " + dir + " -p");
        }
    };


    /*
        Copies all text and html files into the app directory.
        Write as many this.watch() methods as you want, in this example we use only one.
    */
    this.watch(["*.txt", "*.html"], function*(filePath) {
        var dest = filePath.replace(/^src\//, 'app/');
        yield* ensureDirExists(dest);
        yield* exec("cp " + filePath + " " + dest);
        this.queue("merge_txt_files");
        this.queue("fake_server_restart");
    }, "copy_files");


    /*
        A job to merge txt files and create wisdom.data
    */
    this.job(function*() {
        yield* exec("cat app/somefile.txt app/anotherfile.txt app/abc.html > app/wisdom.data");
    }, "merge_txt_files");


    /*
        A fake server restart. Just says it did it.
    */
    this.job(function*() {
        console.log("Restarting the fake server .... done");
        //yield* exec("restart.sh"); //.. for example
    }, "fake_server_restart");
};

module.exports = buildConfig;
