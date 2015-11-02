# Crankshaft

Crankshaft is a very simple build module for node.js built with ES7 async/await. It prefers code over configuration and
encourages you to use stuff you already know like bash commands and built-in node functions. Also monitors files for
changes after the build.

## HOWTO

1. npm install 'crankshaft'
2. Write a build.js file
3. node build.js

### The build.js file

This example should help you get started.
Check the tests directory to see more examples.

```javascript
describe("Crankshaft build", () => {

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
});

```
