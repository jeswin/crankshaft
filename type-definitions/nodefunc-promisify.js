declare module "nodefunc-promisify" {
    declare function exports<T>(nodefunc: (arg: any, callback: (e: ?Error, result: T) => void) => void) : (arg: any) => Promise<T>;
}
