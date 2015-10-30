/*
    Some external libs and functions we'll use in our build script
*/
import promisify from 'nodefunc-promisify';
import fs from 'fs';
import path from 'path';
import childProcess from 'child_process';
import should from 'should';
import crankshaft from "..";

const spawn = childProcess.spawn;

const _exec = childProcess.exec;
const exec = promisify(function(cmd, cb) {
    _exec(cmd, function(err, stdout, stderr) {
        cb(err, stdout.substring(0, stdout.length - 1));
    });
});

/*
    A helper function to create directories which may not exist.
    We are going to use this in tasks below.
*/
const ensureDirExists = async function(file) {
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) {
        await exec("mkdir " + dir + " -p");
    }
};


describe("Crankshaft build", () => {

    it("Must add function to the configuration's startup jobs", () => {
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.onStart(async function() {
            }, "start_build");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            config.onStartJobs.length.should.equal(1);
            config.onStartJobs[0].name.should.equal('start_build');
        });
    });


    it("Must add function to the configuration's completion jobs", () => {
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.onComplete(async function() {
            }, "complete_build");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            config.onCompleteJobs.length.should.equal(1);
            config.onCompleteJobs[0].name.should.equal('complete_build');
        });
    });


    it("Must add task create_dirs depedent on start_build", () => {
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.onStart(async function() {
            }, "start_build");
            this.onStart(async function() {
            }, "create_dirs", ["start_build"]);
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            config.onStartJobs.length.should.equal(2);
            config.onStartJobs[1].name.should.equal('create_dirs');
        });
    });


    it("Must return filenames matching specified patterns", () => {
        const matchingFiles = [];
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.watch(["*.txt", "*.html"], async function(filePath) {
                matchingFiles.push(filePath);
            }, "copy_files");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            matchingFiles.should.containEql("src/anotherfile.txt");
            matchingFiles.length.should.equal(4);
        });
    });


    it("Must run a job", () => {
        let restarted = false;
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            var self = this;
            this.job(async function() {
                restarted = true;
            }, "fake_server_restart");
            this.onComplete(async function() {
                await self.run("fake_server_restart");
            }, "complete_build");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            restarted.should.be.true();
        });
    });


    it("Must run queued jobs", () => {
        let restarted = false;
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            var self = this;
            this.job(async function() {
                restarted = true;
            }, "fake_server_restart");
            this.onComplete(async function() {
                self.queue("fake_server_restart");
            }, "complete_build");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            restarted.should.be.true();
        });
    });


    it("Must dequeue specified job", () => {
        let restarted = false;
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            var self = this;
            this.job(async function() {
                restarted = true;
            }, "fake_server_restart");
            this.onComplete(async function() {
                self.queue("fake_server_restart");
                self.dequeue("fake_server_restart");
            }, "complete_build");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, false).then(() => {
            restarted.should.be.false();
        });
    });
});
