// Keep unchanged nodes attached while a response streams.
export function reconcileChildren(parent,nodes){
 const wanted=new Set(nodes);
 for(const child of [...parent.childNodes])if(!wanted.has(child))child.remove();
 nodes.forEach((node,index)=>{if(parent.childNodes[index]!==node)parent.insertBefore(node,parent.childNodes[index]||null);});
}
