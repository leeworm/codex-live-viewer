import type {AppThemeSettings} from '../../src/shared/app-theme.js';
export function createThemeReader(options?:{file?:string;read?:()=>Promise<string>}):()=>Promise<AppThemeSettings>;
