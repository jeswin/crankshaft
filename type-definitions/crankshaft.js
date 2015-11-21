type PatternType = {
    file: string,
    dir: string,
    important: boolean,
    regex: RegExp,
    exclude: boolean,
    recurse: boolean
};

type FnActionType = () => Promise;
