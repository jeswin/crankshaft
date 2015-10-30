class Job {

    constructor(fn, name, deps, parent, options) {
        this.fn = fn;
        this.name = name || this.randomString(24);

        this.deps = deps || [];
        if (typeof deps === "string")
            this.deps = [deps];

        this.parent = parent;
    }


    randomString(len) {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        for( var i = 0; i < len; i++ ) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }


    async getTasks() {
        const self = this;
        return [async function() { await self.fn(); }];
    };
}

export default Job;
