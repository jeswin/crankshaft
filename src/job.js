/* @flow */
import JobQueue from "./jobqueue";

export default class Job<TParent : JobQueue> {

    fn: () => Promise;
    name: string;
    deps: Array<string>;
    parent: TParent;

    constructor(fn: () => Promise, parent: TParent, name: string = "", deps: Array<string> = []) {
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


    async getTasks() : Promise<Array<() => Promise>> {
        const self = this;
        return [async function() { await self.fn(); }];
    };
}
