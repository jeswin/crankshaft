# Crankshaft

Crankshaft is a very simple build module for node.js built with ES7 async/await. It prefers code over configuration and
encourages you to use stuff you already know like bash commands and built-in node functions. Also monitors files for
changes after the build.

## HOWTO

1. npm install 'crankshaft'
2. Write a build.js file
3. node build.js

### The build.js file

These examples should help you get started.
Especially see the test named "A full flow example must run without errors" below.

```javascript
describe("Crankshaft build", () => {

    //Delete the test-fixtures directory.
    before(() => {
        fs.removeSync(`${__dirname}/fixtures/temp`);
        fs.mkdirsSync(`${__dirname}/fixtures/temp`);
    });

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


    it("Must return filenames matching patterns", () => {
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
            matchingFiles.length.should.equal(6);
        });
    });


    it("Must omit file patterns", () => {
        const matchingFiles = [];
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.watch(["*.txt", "*.html", "!src/somefile.txt", "!src/zomg.txt"], async function(filePath) {
                matchingFiles.push(filePath);
            }, "copy_files");
        }
        const config = build.configure(createConfig, 'fixtures');
        debugger;
        return crankshaft.run(build, false).then(() => {
            matchingFiles.length.should.equal(4);
        });
    });


    it("Must omit directory patterns", () => {
        const matchingFiles = [];
        const build = crankshaft.create({ threads: 4 });
        const createConfig = function() {
            this.watch(["*.txt", "*.html", "!inner/"], async function(filePath) {
                matchingFiles.push(filePath);
            }, "copy_files");
        }
        const config = build.configure(createConfig, 'fixtures');
        debugger;
        return crankshaft.run(build, false).then(() => {
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


    it("Must dequeue job", () => {
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

    /*
        These tests will not run on windows
    */
    const isWin = /^win/.test(process.platform);
    if (!isWin) {
        it("A full flow example must run without errors (*nix only)", () => {
            const matchingFiles = [];
            const build = crankshaft.create({ threads: 4 });

            let buildStarted = false;
            build.onStart(() => {
                buildStarted = true;
            });

            let buildCompleted = false;
            build.onStart(() => {
                buildCompleted = true;
            });

            const copyTextAndHtmlFiles = function() {
                //Copy all txt and html files, except zomg.txt and those in the temp/ directory
                this.watch(["*.txt", "*.html", "!src/zomg.txt", "!temp/"], async function(filePath) {
                    await exec(`cp ${filePath} temp`);
                }, "copy_text_and_html_files");
            }
            //Start this task list in the "fixtures" directory
            build.configure(copyTextAndHtmlFiles, 'fixtures');

            let configStarted = false;
            let configCompleted = false;
            const copyJsonFiles = function() {
                //task lists also have an onStart
                this.onStart(() => {
                    //You can do something useful here.
                    //await exec(`ls src`);

                    configStarted = true;
                });

                //Copy all json files, except those in the temp/ directory
                this.watch(["*.txt", "!temp/"], async function(filePath) {
                    await exec(`cp ${filePath} temp`);
                }, "copy_json_files");

                //task lists also have an onComplete
                this.onComplete(() => {
                    //You can wrap up things here.
                    //await exec(`ls src`);

                    configCompleted = true;
                });
            }
            //Start this task list in the "fixtures" directory
            build.configure(copyJsonFiles, 'fixtures');

            return crankshaft.run(build, false).then(() => {
                buildStarted.should.be.true();
                buildCompleted.should.be.true();

                configStarted.should.be.true();
                configCompleted.should.be.true();

                //Number of files in the temp directory must be 5
                const files = fs.readdirSync("fixtures/temp");
                files.length.should.equal(6);
            });
        });
    }


    /*
        We're gonna touch a file after 1000ms and see if we receive the callback
    */
    it("Must watch a file for changes (happens after 1000ms)", (done) => {
        let isWatching = false;
        let watchedFile;
        const matchingFiles = [];
        const build = crankshaft.create({ threads: 4 });
        build.onComplete(() => {
            setTimeout(() => {
                watchedFile = matchingFiles[0];
                isWatching = true;
                touch(`fixtures/${watchedFile}`);
            }, 500);
        });
        const createConfig = function() {
            this.watch(["*.txt", "*.html"], async function(filePath) {
                if (isWatching && watchedFile === filePath) {
                    done();
                }
                matchingFiles.push(filePath);
            }, "copy_files");
        }
        const config = build.configure(createConfig, 'fixtures');
        return crankshaft.run(build, true);
    });
});

```
