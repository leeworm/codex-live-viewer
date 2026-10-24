export type ThemePalette={surface:string;ink:string;accent:string;added:string;removed:string;contrast:number};
export type AppThemeSettings={mode:'system'|'light'|'dark';light?:Partial<ThemePalette>;dark?:Partial<ThemePalette>};
export type ResolvedAppTheme={mode:'light'|'dark';page:string;card:string;ink:string;muted:string;border:string;accent:string;added:string;removed:string;addBackground:string;removeBackground:string};
const defaults:Record<'light'|'dark',ThemePalette>={
 light:{surface:'#ffffff',ink:'#1a1c1f',accent:'#339cff',added:'#00a240',removed:'#ba2623',contrast:45},
 dark:{surface:'#181818',ink:'#ffffff',accent:'#339cff',added:'#40c977',removed:'#fa423e',contrast:60},
};
const object=(v:unknown):Record<string,unknown>=>v&&typeof v==='object'&&!Array.isArray(v)?v as Record<string,unknown>:{};
const color=(v:unknown):string|undefined=>typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v)?v.toLowerCase():undefined;
function palette(value:unknown):Partial<ThemePalette>{
 const v=object(value),semantic=object(v.semanticColors),result:Partial<ThemePalette>={};
 for(const key of ['surface','ink','accent'] as const){const c=color(v[key]);if(c)result[key]=c;}
 const added=color(semantic.diffAdded),removed=color(semantic.diffRemoved);if(added)result.added=added;if(removed)result.removed=removed;
 if(typeof v.contrast==='number'&&Number.isFinite(v.contrast))result.contrast=Math.max(0,Math.min(100,v.contrast));
 return result;
}
/** Project only desktop appearance fields; never return the raw configuration. */
export function selectAppTheme(value:unknown):AppThemeSettings{
 const d=object(object(value).desktop);
 return {mode:d.appearanceTheme==='dark'||d.appearanceTheme==='light'?d.appearanceTheme:'system',light:palette(d.appearanceLightChromeTheme),dark:palette(d.appearanceDarkChromeTheme)};
}
function mix(a:string,b:string,weight:number):string{
 return '#'+[1,3,5].map(i=>Math.round(parseInt(a.slice(i,i+2),16)*(1-weight)+parseInt(b.slice(i,i+2),16)*weight).toString(16).padStart(2,'0')).join('');
}
export function resolveAppTheme(settings:Partial<AppThemeSettings>,systemDark:boolean):ResolvedAppTheme{
 const mode=settings.mode==='light'||settings.mode==='dark'?settings.mode:systemDark?'dark':'light';
 const p={...defaults[mode]},candidate=settings[mode]??{};
 for(const key of ['surface','ink','accent','added','removed'] as const){const valid=color(candidate[key]);if(valid)p[key]=valid;}
 if(typeof candidate.contrast==='number'&&Number.isFinite(candidate.contrast))p.contrast=Math.max(0,Math.min(100,candidate.contrast));
 const contrast=p.contrast/100;
 return {mode,page:p.surface,card:mix(p.surface,p.ink,mode==='dark'?.025:.015),ink:p.ink,muted:mix(p.surface,p.ink,.65+contrast*.1),border:mix(p.surface,p.ink,.12+contrast*.06),accent:p.accent,added:p.added,removed:p.removed,addBackground:mix(p.surface,p.added,mode==='dark'?.18:.1),removeBackground:mix(p.surface,p.removed,mode==='dark'?.18:.1)};
}
