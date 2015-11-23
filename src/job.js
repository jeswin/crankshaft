/* @flow */
import JobBase from './job-base';

export default class Job<TParent> extends JobBase<TParent> {

    fn: () => Promise;

    constructor(fn: () => Promise, parent: TParent, name: string = "", deps: Array<string> = []) {
        super(parent, name, deps);
        this.fn = fn;
    }


    async getTasks() : Promise<Array<() => Promise>> {
        const self = this;
        return [async function() { await self.fn(); }];
    };
}
