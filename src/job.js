class Job {

    constructor(fn, name, deps, config, options) {
        this.fn = fn;
        this.name = name;

        this.deps = deps || [];
        if (typeof deps === "string")
            this.deps = [deps];

        this.config = config;
        this.options = options;
    }


    async getTasks() {
        const self = this;
        return [async function() { await self.fn(); }];
    };
}

export default Job;
