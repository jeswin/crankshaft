declare module "nodefunc-promisify" {
    declare function exports(nodefunc: Function) : (...params: any) => Promise;
}
