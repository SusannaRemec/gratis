export function isBlankComputerFrame(frame){return !!frame&&/^about:blank(?:[?#]|$)/i.test(frame.url||'');}
export function computerNotice(notice,frame){
 if(!notice)return '';
 if((!frame||isBlankComputerFrame(frame)||/\/start(?:[?#]|$)/.test(frame.url||''))&&/^The page is blank or still loading\./.test(notice))return '';
 return notice;
}
