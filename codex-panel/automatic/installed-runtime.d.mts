export function resolveInstalledRuntime(directory:string,options?:{execute?:Function}):Promise<{cli:string;resources:string;node:string;packageVersion:string;cliSha256:string}>;
