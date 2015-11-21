/* @flow */
import JobQueue from "./jobqueue";

export default class Job {

    fn: FnActionType;
    name: string;
    deps: Array<string>;
    parent: ?JobQueue;

    constructor(fn: FnActionType, name?: string, deps?: Array<string>, parent?: JobQueue) {
        this.fn = fn;
        this.name = name || this.randomString(24);

        this.deps = deps || [];
        if (typeof deps === "string")
            this.deps = [deps];

        this.parent = parent;
    }


    randomString(len: number) : string {
        var text = "";
        var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

        for( var i = 0; i < len; i++ ) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }


    async getTasks() : Promise<Array<FnActionType>> {
        const self = this;
        return [async function() { await self.fn(); }];
    };
}
