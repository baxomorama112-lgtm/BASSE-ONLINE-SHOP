/* BASSE keyboard-safe layer: tracks the visual viewport (iOS keyboard), exposes --vvh/--vvt/--kb,
   and keeps the focused field fully visible inside whatever scroller holds it. Works on every page. */
(function(){
  if(window.__kbSafe)return;window.__kbSafe=1;
  var root=document.documentElement,vv=window.visualViewport,FIELD='input,textarea,select';
  function fullH(){return Math.max(window.innerHeight||0,root.clientHeight||0)}
  function metrics(){var h=vv?vv.height:window.innerHeight,t=vv?vv.offsetTop:0;return{h:Math.round(h),top:Math.round(t),kb:Math.max(0,Math.round(fullH()-h-t))}}
  function apply(){var m=metrics(),s=root.style;s.setProperty('--vvh',m.h+'px');s.setProperty('--vvt',m.top+'px');s.setProperty('--kb',m.kb+'px');root.classList.toggle('kb-open',m.kb>80);return m}
  function scroller(el){for(var p=el.parentElement;p&&p!==document.body&&p!==root;p=p.parentElement){var cs=getComputedStyle(p);if(/(auto|scroll)/.test(cs.overflowY)&&p.scrollHeight>p.clientHeight+1)return p;if(cs.position==='fixed')return null}return document.scrollingElement||root}
  function reveal(el){
    if(!el||!el.matches||!el.matches(FIELD)||el.type==='hidden'||el.disabled)return;
    var m=apply(),pad=14,r=el.getBoundingClientRect();if(!r.height)return;
    var hb=0;if(!el.closest('.modal,.ticket-form,.sheet')){var h=document.querySelector('header.top,.top,header,.bar');if(h){var hs=getComputedStyle(h).position;if(hs==='sticky'||hs==='fixed')hb=Math.max(0,h.getBoundingClientRect().bottom)}}
    var top=Math.max(m.top+pad+28,hb+pad+24),bot=m.top+m.h-pad;   /* keeps the label above the field visible, clear of sticky headers */
    if(r.top>=top&&r.bottom<=bot)return;
    var want=Math.max(m.top+m.h*0.38,top+r.height/2),dy=(r.top+r.height/2)-want,sc=scroller(el);if(!sc)return;
    if(sc===document.scrollingElement||sc===root)window.scrollBy(0,dy);else sc.scrollTop+=dy;
  }
  function revealSoon(el){[0,120,280,520,850].forEach(function(ms){setTimeout(function(){if(document.activeElement===el)reveal(el)},ms)})}
  document.addEventListener('focusin',function(e){if(e.target.matches&&e.target.matches(FIELD)){apply();revealSoon(e.target)}},true);
  var raf=0;function onVV(){if(raf)return;raf=requestAnimationFrame(function(){raf=0;apply();var a=document.activeElement;if(a&&a.matches&&a.matches(FIELD))reveal(a)})}
  if(vv){vv.addEventListener('resize',onVV);vv.addEventListener('scroll',onVV)}
  window.addEventListener('resize',onVV);window.addEventListener('orientationchange',function(){setTimeout(onVV,250)});
  apply();
})();
