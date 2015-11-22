declare module "fs" {
    declare function readdir(path: string, callback: (err: any, files: Array<string>) => void): any;
}
