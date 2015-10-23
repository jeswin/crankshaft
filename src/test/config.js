/*
    Some external libs and functions we'll use in our build script
*/
import promisify from 'nodefunc-promisify';
import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';

const spawn = childProcess.spawn;

const _exec = childProcess.exec;
const exec = promisify(function(cmd, cb) {
    _exec(cmd, function(err, stdout, stderr) {
        console.log(cmd);
        cb(err, stdout.substring(0, stdout.length - 1));
    });
});


/*
    Configuration Section.
*/
const buildConfig = function() {
    /*
        The first task to run when the build starts.
        Let's call it "start_build". It just prints a message.

        Note: name (ie "start_build") isn't stricly required,
        but it allows us to declare it as a dependency in another job.
    */
    this.onStart(async function() {
        console.log("Let's start copying files...");
    }, "start_build");


    /*
        Let's create an app directory.
        We add "start_build" as a dependency, so that it runs after the message.
    */
    this.onStart(async function() {
        console.log("Creating app directory");
        await exec("rm app -rf");
        await exec("mkdir app");
    }, "create_dirs", ["start_build"]);


    /*
        A helper function to create directories which may not exist.
        We are going to use this in tasks below.
    */
    ensureDirExists = async function(file) {
        const dir = path.dirname(file);
        if (!fs.existsSync(dir)) {
            await exec("mkdir " + dir + " -p");
        }
    };


    /*
        Copies all text and html files into the app directory.
        Write as many this.watch() methods as you want, in this example we use only one.
    */
    this.watch(["*.txt", "*.html"], async function(filePath) {
        const dest = filePath.replace(/^src\//, 'app/');
        await ensureDirExists(dest);
        await exec("cp " + filePath + " " + dest);
        this.queue("merge_txt_files");
        this.queue("fake_server_restart");
    }, "copy_files");


    /*
        A job to merge txt files and create wisdom.data
    */
    this.job(async function() {
        await exec("cat app/somefile.txt app/anotherfile.txt app/abc.html > app/wisdom.data");
    }, "merge_txt_files");


    /*
        A fake server restart. Just says it did it.
    */
    this.job(async function() {
        console.log("Restarting the fake server .... done");
        //yield exec("restart.sh"); //.. for example
    }, "fake_server_restart");
};

export default buildConfig;
