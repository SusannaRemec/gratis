// A bot's optional `apps` list narrows which connected apps it may use. Absent means every connected app.
// Direct app ids are lowercase letters, digits and underscores, so an id with "@" can never be one.
export const COMPOSIO_APP='@composio';
export const MAX_APPS=100,MAX_APP_ID=64;
export const validApps=value=>Array.isArray(value)&&value.length<=MAX_APPS&&new Set(value).size===value.length&&value.every(id=>typeof id==='string'&&id.length>0&&id.length<=MAX_APP_ID);
export const allowedApps=(bot,connected)=>bot?.apps===undefined?[...connected]:connected.filter(id=>bot.apps.includes(id));
// Only a bot that was never narrowed stays on "all apps". Clearing a saved list here would re-allow an excluded app that is signed out right now.
export const chosenApps=(checked,connected,previous)=>{const picked=connected.filter(id=>checked.includes(id));return previous===undefined&&picked.length===connected.length?null:picked;};
export const connectedApps=(composio,direct)=>[...(composio?[{id:COMPOSIO_APP,name:'Composio'}]:[]),...direct.filter(a=>a.signedIn).map(({id,name})=>({id,name}))];
