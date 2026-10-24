export function createAppPanelOpener(options:{serverPath:string;nodePath?:string;env?:NodeJS.ProcessEnv;timeoutMs?:number;onStatus?:(value:{phase:string;threadId?:string;message?:string})=>void}):{open(owner:{threadId:string;url:string;turnId:string|null}):Promise<boolean>;close():Promise<void>};
export function bundledAppTools(resources:string):string;
