/* Presentation-only adapter for the untouched yesterday production portal.
   Does not implement auth, master imports, balances, requests, approvals or allocation. */
(function(){
'use strict';
const options=[
 ['#0e1c37','#2563eb','#aebdd8','#ffffff'],
 ['#ffffff','#0c72de','#50637b','#18375b'],
 ['#142a32','#079e9d','#aebdd8','#ffffff'],
 ['#24183c','#8052d9','#aebdd8','#ffffff'],
 ['#161d29','#ef7b25','#aebdd8','#ffffff'],
 ['#081f3d','#00a4cf','#aebdd8','#ffffff'],
 ['#14342c','#1d996a','#aebdd8','#ffffff'],
 ['#301b27','#cc477b','#aebdd8','#ffffff'],
 ['#111827','#475569','#aebdd8','#ffffff'],
 ['#12295c','#e0a31b','#aebdd8','#ffffff']
];
const names=['Classic Corporate Blue','Light Office Sidebar','Teal Operations','Purple Analytics','Orange Industrial','Compact ERP','Green Rounded','Rose Workspace','Minimal Slate','Gold Executive'];
const $=id=>document.getElementById(id);
const sections=[
 {id:'hd',name:'HD Search & Complete Details',icon:'⌕',find:()=>[$('hd-summary').closest('section'),$('hd-details').closest('section')]},
 {id:'capacity',name:'Capacity-wise Cooler Summary',icon:'▤',find:()=>[$('capacity-summary').closest('section')]},
 {id:'requests',name:'Cooler Request & CFA Stock',icon:'⊞',role:'sales',find:()=>[$('cart').closest('section')]},
 {id:'assets',name:'Asset Tag Details',icon:'◈',role:'admin',find:()=>[$('asset-tags').closest('section')]},
 {id:'mine',name:'My Requests',icon:'✉',role:'sales',find:()=>[$('my-requests').closest('section')]},
 {id:'approvals',name:'Admin Approvals',icon:'✓',role:'admin',find:()=>[$('approvals').closest('section')]},
 {id:'history',name:'Allocation History',icon:'◷',role:'admin',find:()=>[$('allocation-history').closest('section')]},
 {id:'negative',name:'Negative HD Balance Alerts',icon:'⚠',find:()=>[$('negative-list').closest('section')]},
 {id:'uploads',name:'Admin Excel Master Uploads',icon:'⇧',role:'admin',find:()=>[$('master-section')]}
];
let mounted=false,selected='hd',currentRole='',collapsed=false;
const allPanels=()=>sections.flatMap(x=>x.find()).filter(Boolean);
function theme(i){
 i=Math.max(1,Math.min(10,Number(i)||1));
 const side=$('hap-sidebar');if(!side)return;
 const [bg,active,muted,ink]=options[i-1];
 side.style.setProperty('--hap-nav-bg',bg);
 side.style.setProperty('--hap-nav-active',active);
 side.style.setProperty('--hap-nav-muted',muted);
 side.style.setProperty('--hap-nav-ink',ink);
 side.dataset.theme=String(i);
 $('hap-theme').value=String(i);
 try{localStorage.setItem('hap_sidebar_theme',String(i))}catch(_){}
}
function show(id){
 const item=sections.find(s=>s.id===id&&(!s.role||s.role===currentRole));
 if(!item)return;
 selected=id;
 const visible=new Set(item.find());
 allPanels().forEach(panel=>panel.classList.toggle('hap-panel-hidden',!visible.has(panel)));
 document.querySelectorAll('#hap-menu button[data-page]').forEach(btn=>{
  const active=btn.dataset.page===id;btn.classList.toggle('active',active);
  btn.setAttribute('aria-current',active?'page':'false');
 });
 $('hap-view-title').textContent=item.name;
 if(window.innerWidth<=760)closeMobile();
}
function closeMobile(){$('workspace').classList.remove('hap-mobile-open');$('hap-toggle').setAttribute('aria-expanded','false')}
function toggle(){
 if(window.innerWidth<=760){
  const open=$('workspace').classList.toggle('hap-mobile-open');
  $('hap-toggle').setAttribute('aria-expanded',String(open));
 }else{
  collapsed=!collapsed;
  $('workspace').classList.toggle('hap-collapsed',collapsed);
  $('hap-toggle').setAttribute('aria-expanded',String(!collapsed));
 }
}
function mount(){
 if(mounted)return;
 const w=$('workspace');if(!w)return;
 const panels=allPanels();
 if(panels.length!==10)throw new Error('Yesterday portal layout differs from expected panel structure');
 const shell=document.createElement('div');shell.className='hap-app-shell';
 const aside=document.createElement('aside');aside.id='hap-sidebar';aside.className='hap-sidebar';
 aside.innerHTML='<div class="hap-brand"><b>❄</b><span>HAP HD Fresh Asset Portal</span></div><div class="hap-menu" id="hap-menu"></div><div class="hap-theme-box"><label for="hap-theme">Sidebar design</label><select id="hap-theme"></select></div><div class="hap-sidefoot">Secure production portal</div>';
 const right=document.createElement('div');right.className='hap-main';
 const top=document.createElement('div');top.className='hap-topbar';
 top.innerHTML='<button id="hap-toggle" type="button" aria-label="Toggle navigation" aria-expanded="true">☰</button><strong id="hap-view-title">HD Search & Complete Details</strong><span id="hap-role"></span>';
 const view=document.createElement('div');view.id='hap-view';view.className='hap-view';
 const overlay=document.createElement('button');overlay.className='hap-overlay';overlay.type='button';overlay.setAttribute('aria-label','Close navigation');
 overlay.onclick=closeMobile;
 const notice=$('notice');if(notice)view.appendChild(notice);
 panels.forEach(panel=>view.appendChild(panel));
 right.append(top,view);shell.append(aside,right,overlay);w.appendChild(shell);
 // Hide the original layout wrappers, now emptied of their panels.
 w.querySelectorAll(':scope > .layout').forEach(el=>el.classList.add('hap-empty-layout'));
 $('hap-toggle').onclick=toggle;
 $('hap-theme').innerHTML=names.map((n,i)=>'<option value="'+(i+1)+'">'+String(i+1).padStart(2,'0')+' · '+n+'</option>').join('');
 $('hap-theme').onchange=e=>theme(e.target.value);
 theme((()=>{try{return localStorage.getItem('hap_sidebar_theme')}catch(_){return 1}})());
 mounted=true;
}
function roleUpdate(){
 if(!window.profile)return;
 mount();
 currentRole=window.profile.role;
 $('hap-role').textContent=(currentRole==='admin'?'ADMIN PORTAL':'SALES TEAM PORTAL')+' · '+(window.profile.full_name||window.user?.email||'');
 const menu=$('hap-menu');menu.replaceChildren();
 sections.filter(s=>!s.role||s.role===currentRole).forEach(s=>{
  const b=document.createElement('button');b.type='button';b.dataset.page=s.id;
  const icon=document.createElement('span');icon.className='hap-icon';icon.textContent=s.icon;
  const label=document.createElement('span');label.className='hap-menu-label';label.textContent=s.name;
  b.append(icon,label);b.onclick=()=>show(s.id);menu.appendChild(b);
 });
 show('hd');
}
if(typeof window.enter==='function'){
 const originalEnter=window.enter;
 window.enter=async function(...args){
  await originalEnter.apply(this,args);
  roleUpdate();
 };
}else{
 console.error('Production login handler was not found. Sidebar adapter has not changed authentication.');
}
})();
