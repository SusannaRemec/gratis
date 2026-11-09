export function visibleFiles(files,{query='',sort='recent'}={}){
 const terms=query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
 const rows=files.filter(file=>terms.every(term=>file.path.toLocaleLowerCase().includes(term)));
 const byName=(a,b)=>a.path.localeCompare(b.path);
 return rows.sort(sort==='name'?byName:sort==='size'?(a,b)=>b.bytes-a.bytes||byName(a,b):(a,b)=>b.modified-a.modified||byName(a,b));
}
