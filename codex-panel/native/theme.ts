import {resolveAppTheme,type AppThemeSettings} from '../../src/shared/app-theme.js';
/** Push theme settings directly into the mounted viewer element (used by MCP App bridge). */
export function applyAppTheme(element:HTMLElement,settings?:Partial<AppThemeSettings>):void{
 if(settings&&typeof settings==='object'){
  element.dataset.appThemeSettings=JSON.stringify(settings);
  element.dispatchEvent(new CustomEvent('live-viewer-theme'));
 }
}
/** Follow the app's color settings while keeping the code renderer and its feed independent. */
export function followAppTheme(element:HTMLElement):()=>void{
 const media=matchMedia('(prefers-color-scheme: dark)');
 const isHttpStream=(location.protocol==='http:'||location.protocol==='https:')&&/^\/v\/[a-f0-9]{32}$/.test(location.pathname);
 let settings:Partial<AppThemeSettings>={},disposed=false,legacy=element.dataset.themeSync==='next-launch'||element.dataset.themeSync==='mcp-app'||!isHttpStream,timer:ReturnType<typeof setTimeout>|undefined,request:AbortController|undefined;
 function readDatasetSettings(){try{settings=JSON.parse(element.dataset.appThemeSettings??'{}') as AppThemeSettings;}catch{}}
 readDatasetSettings();
 function apply(){
  const p=resolveAppTheme(settings,media.matches),vars:Record<string,string>={'--page':p.page,'--card':p.card,'--ink':p.ink,'--muted':p.muted,'--rule':p.border,'--accent':p.accent,'--green':p.added,'--red':p.removed,'--add-bg':p.addBackground,'--del-bg':p.removeBackground};
  vars['--syntax-keyword']=p.mode==='dark'?'#83c5fa':'#3978a9';vars['--syntax-string']=p.mode==='dark'?'#a3d59c':'#45804e';vars['--syntax-number']=p.mode==='dark'?'#d9b387':'#936232';vars['--syntax-comment']=p.muted;vars['--syntax-type']=p.mode==='dark'?'#d1afe3':'#8a5b86';
  for(const [key,value]of Object.entries(vars))element.style.setProperty(key,value);
  element.dataset.appTheme=p.mode;element.style.colorScheme=p.mode;
  document.documentElement.style.colorScheme=p.mode;document.documentElement.style.setProperty('--viewer-background',p.page);document.documentElement.style.backgroundColor=p.page;document.body.style.backgroundColor=p.page;
 }
 const onExternalTheme=()=>{readDatasetSettings();if(!disposed)apply();};
 async function refresh(){
  if(timer!==undefined){clearTimeout(timer);timer=undefined;}
  if(disposed||legacy||document.hidden)return;
  request?.abort();const current=new AbortController();request=current;
  try{const response=await fetch('/theme',{cache:'no-store',signal:current.signal});if(response.ok){settings=await response.json() as AppThemeSettings;element.dataset.themeSync='live';if(!disposed)apply();}else if(response.status===404){legacy=true;element.dataset.themeSync='next-launch';}}catch{/* Theme availability must not interrupt code display. */}
  finally{if(request===current)request=undefined;if(!disposed&&!legacy&&!document.hidden)timer=setTimeout(refresh,1500);}
 }
 const visible=()=>{if(document.hidden){request?.abort();if(timer!==undefined)clearTimeout(timer);}else void refresh();};
 media.addEventListener('change',apply);element.addEventListener('live-viewer-theme',onExternalTheme);document.addEventListener('visibilitychange',visible);apply();void refresh();
 return()=>{disposed=true;request?.abort();if(timer!==undefined)clearTimeout(timer);media.removeEventListener('change',apply);element.removeEventListener('live-viewer-theme',onExternalTheme);document.removeEventListener('visibilitychange',visible);};
}
