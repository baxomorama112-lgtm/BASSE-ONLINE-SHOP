/* BASSE UI kit: branded confirm box (replaces the browser's "basseonlineshop.com says…" popup) and non-blocking alerts.
   Confirm card design adapted from the Uiverse "exit/confirm card" snippet. Used by marketplace, admin, vendor and driver. */
(function(){
  if(window.basseConfirm)return;
  const CSS=`
.bk-back{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(10,19,49,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);animation:bkFade .18s ease-out}
.bk-card{position:relative;width:min(100%,380px);background:#fff;border-radius:22px;padding:30px 26px 24px;box-shadow:0 30px 60px -20px rgba(10,19,49,.45),0 2px 6px rgba(10,19,49,.08);display:flex;flex-direction:column;gap:18px;font-family:Inter,system-ui,-apple-system,"Segoe UI",sans-serif;color:#101828;animation:bkPop .22s cubic-bezier(.2,.8,.2,1)}
.bk-x{position:absolute;top:16px;right:16px;width:32px;height:32px;border:0;border-radius:50%;background:transparent;display:grid;place-items:center;cursor:pointer;padding:0}
.bk-x svg{width:18px;height:18px;fill:#a3abbb;transition:fill .15s}.bk-x:hover svg{fill:#101828}
.bk-icon{width:52px;height:52px;border-radius:16px;display:grid;place-items:center;background:#eef3fc;color:#1d55c9}
.bk-card.danger .bk-icon{background:#fef3f2;color:#d92d20}
.bk-icon svg{width:26px;height:26px;stroke:currentColor;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.bk-title{margin:0;font-size:20px;font-weight:700;line-height:1.25;color:#1b1b1b;padding-right:28px}
.bk-msg{margin:6px 0 0;font-size:14px;line-height:1.55;color:#667085}
.bk-row{display:flex;gap:10px}
.bk-btn{flex:1;height:46px;border:0;border-radius:12px;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:background .15s,transform .1s}
.bk-btn:active{transform:scale(.98)}
.bk-cancel{background:#eef0f4;color:#344054}.bk-cancel:hover{background:#e1e5ec}
.bk-ok{background:#1d55c9;color:#fff}.bk-ok:hover{background:#17439f}
.bk-card.danger .bk-ok{background:#e5484d}.bk-card.danger .bk-ok:hover{background:#cf3a3f}
.bk-btn:focus-visible,.bk-x:focus-visible{outline:3px solid rgba(29,85,201,.35);outline-offset:2px}
.bk-toast{position:fixed;left:50%;top:calc(14px + env(safe-area-inset-top));transform:translateX(-50%);z-index:2147483001;max-width:min(92vw,420px);background:#0a1331;color:#fff;border-radius:14px;padding:13px 18px;font:600 14px/1.4 Inter,system-ui,sans-serif;box-shadow:0 16px 34px -12px rgba(10,19,49,.6);animation:bkDrop .25s ease-out}
@keyframes bkFade{from{opacity:0}to{opacity:1}}@keyframes bkPop{from{opacity:0;transform:translateY(10px) scale(.96)}to{opacity:1;transform:none}}@keyframes bkDrop{from{opacity:0;transform:translate(-50%,-10px)}to{opacity:1;transform:translate(-50%,0)}}
@media(max-width:480px){.bk-back{align-items:flex-end;padding:0}.bk-card{width:100%;border-radius:24px 24px 0 0;padding:28px 22px calc(22px + env(safe-area-inset-bottom))}}
@media(prefers-reduced-motion:reduce){.bk-back,.bk-card,.bk-toast{animation:none}}`;
  const ICON={danger:'<svg viewBox="0 0 24 24"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',info:'<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/></svg>'};
  function css(){if(document.getElementById('bk-css'))return;const s=document.createElement('style');s.id='bk-css';s.textContent=CSS;(document.head||document.documentElement).appendChild(s)}
  function derive(m){m=String(m||'');
    const rules=[[/restore/i,{title:'Restore this backup?',ok:'Restore backup',danger:true}],[/delete/i,{title:'Delete this item?',ok:'Delete',danger:true}],[/reject/i,{title:'Reject this item?',ok:'Reject',danger:true}],[/refund/i,{title:'Mark as refunded?',ok:'Mark refunded',danger:true}],[/cancel/i,{title:'Cancel this payment?',ok:'Yes, cancel',danger:true}],[/verify/i,{title:'Verify this payment?',ok:'Yes, verify',danger:false}]];
    for(const [re,o] of rules)if(re.test(m))return o;return{title:'Please confirm',ok:'Confirm',danger:false}}
  window.basseConfirm=function(arg){
    const o=typeof arg==='string'?{message:arg}:Object.assign({},arg||{}),d=derive(o.message);
    const title=o.title||d.title,okText=o.confirmText||d.ok,danger=o.danger!=null?o.danger:d.danger;
    css();return new Promise(resolve=>{
      const back=document.createElement('div');back.className='bk-back';back.setAttribute('role','presentation');
      back.innerHTML='<div class="bk-card'+(danger?' danger':'')+'" role="alertdialog" aria-modal="true" aria-labelledby="bkT" aria-describedby="bkM"><button type="button" class="bk-x" aria-label="Close"><svg viewBox="0 0 15 15"><path d="M12.8 3.6 11.4 2.2 7.5 6.1 3.6 2.2 2.2 3.6l3.9 3.9-3.9 3.9 1.4 1.4 3.9-3.9 3.9 3.9 1.4-1.4-3.9-3.9z"/></svg></button><div class="bk-icon">'+(danger?ICON.danger:ICON.info)+'</div><div><h3 class="bk-title" id="bkT"></h3><p class="bk-msg" id="bkM"></p></div><div class="bk-row"><button type="button" class="bk-btn bk-cancel"></button><button type="button" class="bk-btn bk-ok"></button></div></div>';
      back.querySelector('.bk-title').textContent=title;back.querySelector('.bk-msg').textContent=String(o.message||'');
      back.querySelector('.bk-cancel').textContent=o.cancelText||'Cancel';back.querySelector('.bk-ok').textContent=okText;
      const prev=document.activeElement;let done=false;
      const finish=v=>{if(done)return;done=true;document.removeEventListener('keydown',onKey,true);back.remove();try{prev&&prev.focus&&prev.focus()}catch(e){}resolve(v)};
      const onKey=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();finish(false)}if(e.key==='Tab'){const f=[...back.querySelectorAll('button')];const i=f.indexOf(document.activeElement);e.preventDefault();f[(i+(e.shiftKey?-1:1)+f.length)%f.length].focus()}};
      back.addEventListener('mousedown',e=>{if(e.target===back)finish(false)});
      back.querySelector('.bk-x').onclick=()=>finish(false);back.querySelector('.bk-cancel').onclick=()=>finish(false);back.querySelector('.bk-ok').onclick=()=>finish(true);
      document.addEventListener('keydown',onKey,true);(document.body||document.documentElement).appendChild(back);back.querySelector('.bk-cancel').focus()})};
  /* alert() no longer freezes the page with the browser's grey box: show a branded message instead */
  window.basseToast=function(msg,ms){css();const t=document.createElement('div');t.className='bk-toast';t.setAttribute('role','status');t.textContent=String(msg==null?'':msg);(document.body||document.documentElement).appendChild(t);setTimeout(()=>t.remove(),ms||4200)};
  window.alert=function(m){window.basseToast(m)};
})();
