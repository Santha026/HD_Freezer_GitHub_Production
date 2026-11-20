'use strict';
const $=id=>document.getElementById(id);
const CAPS=['VC-350LTR','VC-200LTR Milk','HT-100LTR','HT-200LTR','HT-500LTR','VC-600LTR','GT-625LTR','HT-60LTR','VC-200LTR SLIM','VF-400LTR-WAIVER','VF-550LTR-WAIVER'];
const COLUMNS={
 hds:['hd_code','hd_name','location','cfa_code','total_deposit','security_deposit','sdm_name','rsm_name','zsm_name','dd_date','dd_number','dd_value','block'],
 contacts:['hd_code','cfa_code','cfa_name','cfa_location','requester_email','cfa_email','sdm_name','sdm_email','rsm_name','rsm_email','zsm_name','zsm_email'],
 assets:['hd_code','asset_tag','capacity','asset_value'],
 stock:['asset_tag','capacity','asset_value','receipt_date','cfa_code','cfa_name','cfa_location','stock_status','allocation_status']
};
const ALIASES={hd_code:['HD Code','HDC SAP CODE','HD CODE'],hd_name:['HD Name'],location:['Location'],cfa_code:['CFA Code'],total_deposit:['Total Deposit'],security_deposit:['Security Deposit'],sdm_name:['SDM Name'],rsm_name:['RSM Name'],zsm_name:['ZSM Name'],dd_date:['DD Date'],dd_number:['DD Number'],dd_value:['DD Value'],block:['Block'],cfa_name:['CFA Name'],cfa_location:['CFA Location'],requester_email:['Requester Email'],cfa_email:['CFA Email'],sdm_email:['SDM Email'],rsm_email:['RSM Email'],zsm_email:['ZSM Email'],asset_tag:['Asset Tag Number','Asset Tag No','Asset Tag','TAG NO'],capacity:['Cooler Capacity','Asset Capacity','Capacity'],asset_value:['Asset Value'],receipt_date:['Stock Receipt Date'],stock_status:['Stock Status'],allocation_status:['Allocation Status']};
let db=null,user=null,profile=null,selected=null,cart=[],requestPage=0,negativePage=0,assetPage=0,assetRecords=[],loading=false;
let liveChannel=null,livePoll=null,liveDebounce=null,liveBusy=false;
const money=n=>Number(n||0).toLocaleString('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0});
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').trim().toUpperCase().replace(/\s+/g,' ');
const notify=(msg,error=false)=>{ $('notice').textContent=msg;$('notice').className=error?'error':'success'; };
const check=(r)=>{if(r.error)throw new Error(r.error.message);return r.data};
const table=(headers,rows)=>`<table><thead><tr>${headers.map(x=>`<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v)}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${headers.length}">No records</td></tr>`}</tbody></table>`;
const csvCell=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
function download(name,body,type='text/csv;charset=utf-8'){const a=document.createElement('a');const url=URL.createObjectURL(new Blob([body],{type}));a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),2000)}
function exportCSV(name,head,rows){download(name,'\ufeff'+[head,...rows].map(row=>row.map(csvCell).join(',')).join('\r\n'))}
function setTheme(dark){document.body.classList.toggle('dark',dark);$('theme').textContent=dark?'☀️ Light':'🌙 Dark';localStorage.setItem('hd-theme',dark?'dark':'light')}
$('theme').onclick=()=>setTheme(!document.body.classList.contains('dark'));
setTheme(localStorage.getItem('hd-theme')==='dark');
$('capacity').innerHTML=CAPS.map(c=>`<option>${esc(c)}</option>`).join('');
function configure(){const c=window.HD_CONFIG;if(!c||!c.supabaseUrl?.startsWith('https://')||!c.supabaseAnonKey||c.supabaseUrl.includes('YOUR-')||c.supabaseAnonKey.includes('YOUR_')||!window.supabase){$('setup').classList.remove('hidden');$('auth').classList.remove('hidden');showLoginError('Connection not configured. Add your Supabase URL and publishable key in config.js, then reload.');return false}db=window.supabase.createClient(c.supabaseUrl,c.supabaseAnonKey,{auth:{storage:window.sessionStorage,storageKey:'hap-hd-auth-session-v2',persistSession:true,autoRefreshToken:true,detectSessionInUrl:false}});return true}
function showLoginError(message){
 const el=$('login-error');el.textContent=message;el.classList.remove('hidden');
}
function showLoginScreen(message=''){
 stopLiveUpdates();
 user=null;profile=null;selected=null;cart=[];
 $('auth').classList.remove('hidden');
 $('workspace').classList.add('hidden');
 $('logout').classList.add('hidden');
 $('identity').textContent='';
 if(message)showLoginError(message);
}
async function restore(){
 try{
  const result=await db.auth.getSession();
  if(result.error)throw result.error;
  if(result.data?.session?.user)await enter(result.data.session.user);
 }catch(e){showLoginScreen('Unable to restore login: '+e.message)}
}
async function enter(u){
 stopLiveUpdates();
 previousPendingIds=null;lastPendingCount=0;liveErrorCount=0;
 const result=await db.from('profiles').select('full_name,role,active').eq('user_id',u.id).single();
 const p=check(result);
 if(!p||!p.active)throw new Error('Account disabled or missing a profile. Contact your administrator.');
 if(!['admin','sales'].includes(p.role))throw new Error('Invalid portal role. Contact your administrator.');
 user=u;profile=p;selected=null;cart=[];assetRecords=[];assetPage=0;
 $('hd-code').value='';$('hd-summary').innerHTML='';$('hd-details').textContent='Select an HD to view details.';
 $('capacity-summary').textContent='Select an HD.';$('asset-tags').textContent='Select an HD.';
 $('login-error').classList.add('hidden');
 $('auth').classList.add('hidden');
 $('workspace').classList.remove('hidden');
 $('logout').classList.remove('hidden');
 $('identity').textContent=(p.full_name||u.email)+' · '+(p.role==='admin'?'Admin':'Sales Team');
 document.querySelectorAll('.admin-only').forEach(el=>el.classList.toggle('hidden',p.role!=='admin'));
 document.querySelectorAll('.sales-only').forEach(el=>el.classList.toggle('hidden',p.role!=='sales'));
 $('portal-role').textContent=p.role==='admin'?'ADMIN PORTAL':'SALES TEAM PORTAL';
 $('portal-user').textContent=p.full_name||u.email;
 $('sidebar-role').textContent=p.role==='admin'?'ADMIN PORTAL':'SALES TEAM PORTAL';
 $('sidebar-user').textContent=p.full_name||u.email;
 $('upload-content').classList.add('hidden');
 $('toggle-upload').textContent='View uploads';
 renderRoleNav();
 setSidebarOpen(window.innerWidth>1050);
 try{await Promise.all([renderNegative(),renderRequests(),renderHistory()])}
 catch(e){notify('Signed in, but data could not be loaded: '+e.message,true)}
 startLiveUpdates();
}

// One selected page at a time. HD Search and HD Details are a single view.
const PAGE_GROUPS={
 'hd-search-section':['hd-search-section','hd-details-section'],
 'capacity-summary-section':['capacity-summary-section'],
 'asset-details-section':['asset-details-section'],
 'negative-section':['negative-section'],
 'approvals-section':['approvals-section'],
 'allocation-history-section':['allocation-history-section'],
 'master-section':['master-section'],
 'sales-request-section':['sales-request-section','cfa-stock-section'],
 'my-requests-section':['my-requests-section']
};
const ROLE_PAGES={
 admin:[['02 · HD Search & Balances','hd-search-section','⌕'],['04 · Capacity Summary','capacity-summary-section','▥'],['06 · Asset Tag Details','asset-details-section','▤'],['Negative HD Balances','negative-section','⚠'],['08 · Admin Approvals','approvals-section','✓'],['09 · Allocation History','allocation-history-section','◷'],['01 · Master Uploads','master-section','⇧']],
 sales:[['02 · HD Search & Balances','hd-search-section','⌕'],['04 · Capacity Summary','capacity-summary-section','▥'],['05 · Cooler Request Calculator & CFA Available Stock','sales-request-section','⊞'],['07 · My Requests','my-requests-section','◷'],['Negative HD Balances','negative-section','⚠']]
};
let currentPage='hd-search-section';
let previousPendingIds=null;
let lastPendingCount=0;
let liveErrorCount=0;

function selectPortalPage(page,updateHash=true){
 const allowed=(ROLE_PAGES[profile?.role]||[]).map(x=>x[1]);
 if(!allowed.includes(page))page='hd-search-section';
 currentPage=page;
 const visible=new Set(PAGE_GROUPS[page]||[]);
 Object.values(PAGE_GROUPS).flat().forEach(id=>{
  const el=$(id);if(!el)return;
  el.classList.toggle('portal-view-hidden',!visible.has(id));
 });
 document.querySelectorAll('#role-nav .sidebar-link').forEach(a=>{
  const active=a.dataset.section===page;
  a.classList.toggle('active',active);
  if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
 });
 const item=(ROLE_PAGES[profile.role]||[]).find(x=>x[1]===page);
 $('current-page-name').textContent=item?.[0]||'HD Search & Details';
 if(updateHash&&location.hash!=='#'+page)history.replaceState(null,'','#'+page);
 if(window.innerWidth<=1050)setSidebarOpen(false);
 window.scrollTo({top:0,behavior:'instant'});
}
function renderRoleNav(){
 const links=ROLE_PAGES[profile?.role]||[];
 $('role-nav').innerHTML=links.map(([label,id,symbol])=>`<a href="#${id}" data-section="${id}" class="sidebar-link"><span class="nav-symbol" aria-hidden="true">${symbol}</span><span>${esc(label)}</span></a>`).join('');
 $('role-nav').querySelectorAll('.sidebar-link').forEach(link=>link.addEventListener('click',e=>{e.preventDefault();selectPortalPage(link.dataset.section)}));
 selectPortalPage('hd-search-section',false);
}
window.addEventListener('hashchange',()=>{if(profile)selectPortalPage(location.hash.slice(1),false)});

// Accessible sidebar: supports Microsoft Edge, Chrome and narrow screens.
function setSidebarOpen(open){
 const workspace=$('workspace');workspace.classList.toggle('sidebar-collapsed',!open);
 $('sidebar-toggle').setAttribute('aria-expanded',String(open));
 $('sidebar-overlay').classList.toggle('hidden',!open||window.innerWidth>1050);
}
$('sidebar-toggle').addEventListener('click',()=>setSidebarOpen($('workspace').classList.contains('sidebar-collapsed')));
$('sidebar-close').addEventListener('click',()=>setSidebarOpen(false));
$('sidebar-overlay').addEventListener('click',()=>setSidebarOpen(false));
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('workspace').classList.contains('sidebar-collapsed'))setSidebarOpen(false)});
window.addEventListener('resize',()=>{if(window.innerWidth>1050)$('sidebar-overlay').classList.add('hidden')});

$('login').onsubmit=async e=>{
 e.preventDefault();
 if(!db)return showLoginError('Supabase is not configured. Please complete config.js.');
 const submit=$('login').querySelector('[type=submit]');
 submit.disabled=true;submit.textContent='Signing in…';
 $('login-error').classList.add('hidden');
 try{
  const {data,error}=await db.auth.signInWithPassword({email:$('email').value.trim(),password:$('password').value});
  if(error)throw error;
  if(!data?.user)throw new Error('Login succeeded without a user session.');
  await enter(data.user);
 }catch(err){showLoginError(err.message||'Unable to sign in. Check your account and Supabase configuration.')}
 finally{submit.disabled=false;submit.innerHTML='Sign in securely <span aria-hidden="true">→</span>'}
};
$('logout').onclick=async()=>{try{await db.auth.signOut();showLoginScreen()}catch(e){notify(e.message,true)}};
async function loadHD(){const code=$('hd-code').value.trim();if(!code)return;try{const rows=check(await db.from('hd_balances').select('*').eq('hd_code',code).limit(1));if(!rows.length)throw new Error('HD Code not found');selected=rows[0];cart=[];assetRecords=[];assetPage=0;await renderHD();}catch(e){notify(e.message,true)}}
$('find-hd').onclick=loadHD;$('hd-code').onkeydown=e=>{if(e.key==='Enter')loadHD()};
async function renderHD(){if(!selected)return;const h=selected;
 const fields=[['HD Code',h.hd_code],['HD Name',h.hd_name],['Total Deposit',money(h.total_deposit)],['Security Deposit',money(h.security_deposit)],['Freezer Deposit',money(h.original_balance)],['Asset Value',money(h.asset_value)],['Original HD Balance',money(h.original_balance)],['Pending / Approved Requests',money(h.requested_amount)],['Available HD Balance',money(h.available_balance)],['No. of Assets',h.asset_count],['Assigned CFA',h.cfa_code]];
 $('hd-summary').innerHTML=fields.map(([label,value])=>
  `<div class="metric ${label==='Available HD Balance'?'balance':''} ${label==='HD Name'?'name':''}"><span>${esc(label)}</span><strong>${esc(value??'')}</strong></div>`
 ).join('');
 const detailGroups=[
  [['HD Code',h.hd_code],['HD Name',h.hd_name],['Location',h.location],['Assigned CFA',h.cfa_code],['Total Deposit',money(h.total_deposit)],['Security Deposit',money(h.security_deposit)]],
  [['Freezer Deposit',money(h.original_balance)],['Asset Value',money(h.asset_value)],['Available HD Balance',money(h.available_balance)],['No. of Assets',h.asset_count],['Pending / Approved Requests',money(h.requested_amount)]]
 ];
 $('hd-details').innerHTML='<div class="detail-grid">'+detailGroups.map((g,i)=>'<div class="detail-block"><h3>HD Details · Table '+(i+1)+'</h3>'+table(['Detail','Value'],g)+'</div>').join('')+'</div>';
 if(profile.role==='admin'){
 const assets=await fetchAll('assets','asset_tag,capacity,asset_value','hd_code',h.hd_code);
 const caps=new Map();for(const a of assets){const c=caps.get(a.capacity)||{qty:0,value:0};c.qty++;c.value+=Number(a.asset_value);caps.set(a.capacity,c)}
 $('capacity-summary').innerHTML=table(['Cooler Capacity','No. of Assets','Total Asset Value'],[...caps].map(([cap,v])=>[cap,v.qty,money(v.value)]));
 assetRecords=assets;assetPage=0;renderAssetPage();
 }else{
  try{
   const totals=check(await db.rpc('hd_capacity_summary',{p_hd:h.hd_code}));
   $('capacity-summary').innerHTML=table(['Cooler Capacity','No. of Assets','Total Asset Value'],totals.map(r=>[r.capacity,r.asset_count,money(r.total_asset_value)]));
  }catch(e){$('capacity-summary').textContent='Capacity summary unavailable. Run supabase/04_sales_capacity_summary.sql once. '+e.message;}
 }
 if(profile.role==='sales'){await renderStock();renderCart();await renderMyRequests();}
}
function renderAssetPage(){
 const perTable=15,perPage=perTable*2;
 const total=Math.max(1,Math.ceil(assetRecords.length/perPage));
 assetPage=Math.max(0,Math.min(assetPage,total-1));
 const pageItems=assetRecords.slice(assetPage*perPage,(assetPage+1)*perPage);
 const halves=[pageItems.slice(0,perTable),pageItems.slice(perTable,perPage)];
 $('asset-tags').innerHTML=halves.map((items,i)=>{
  const start=assetPage*perPage+i*perTable+1;
  const end=start+items.length-1;
  const rows=items.map(a=>[a.asset_tag,a.capacity,money(a.asset_value)]);
  return `<div class="asset-half"><h3>Asset Tags · Table ${i+1} ${items.length?'('+start+'–'+end+')':''}</h3>`+
    table(['Asset Tag Number','Capacity','Asset Value'],rows)+'</div>';
 }).join('');
 $('asset-page').textContent='Page '+(assetPage+1)+' of '+total+' · '+assetRecords.length+' assets · 15 per table';
 $('asset-prev').disabled=assetPage===0;
 $('asset-next').disabled=assetPage>=total-1;
 $('asset-pager').classList.toggle('hidden',assetRecords.length<=perPage);
}
$('asset-prev').onclick=()=>{assetPage--;renderAssetPage()};
$('asset-next').onclick=()=>{assetPage++;renderAssetPage()};
$('copyright-year').textContent=new Date().getFullYear();
async function fetchAll(entity,columns,filter,value){let result=[];for(let i=0;i<100;i++){let q=db.from(entity).select(columns).range(i*1000,(i+1)*1000-1);if(filter)q=q.eq(filter,value);const data=check(await q);result.push(...data);if(data.length<1000)break}return result}
async function renderStock(){if(!selected||profile?.role!=='sales')return;const cfa=selected.cfa_code;$('cfa-heading').textContent='Available Stock · CFA '+cfa;const data=check(await db.rpc('cfa_stock_summary',{p_cfa:cfa}));const qty=new Map();for(const r of data)qty.set(norm(r.capacity),(qty.get(norm(r.capacity))||0)+Number(r.available_qty));const halves=[CAPS.slice(0,6),CAPS.slice(6)];$('cfa-stock').innerHTML=halves.map(arr=>`<div class="table-wrap">${table(['Capacity','Available QTY'],arr.map(c=>[c,qty.get(norm(c))||0]))}</div>`).join('')}
function renderCart(){if(!selected){$('cart').innerHTML='';return}const count=cart.reduce((a,l)=>a+l.quantity,0);$('cart').innerHTML=cart.map((l,i)=>`<div class="cartline"><span>${esc(l.capacity)} × ${l.quantity}</span><button class="danger" data-remove="${i}">Remove</button></div>`).join('');$('cart-balance').textContent=`${count} cooler(s) in cart. Exact request amount is calculated and validated securely when submitted. Current available balance: ${money(selected.available_balance)}.`;}
$('add-line').onclick=()=>{if(profile?.role!=='sales')return notify('Sales Team only',true);if(!selected)return notify('Search an HD first',true);const capacity=$('capacity').value,quantity=Number($('quantity').value);if(!Number.isInteger(quantity)||quantity<1||quantity>500)return notify('Quantity must be 1–500',true);const found=cart.find(x=>x.capacity===capacity);if(found){found.quantity+=quantity;if(found.quantity>500)return notify('Maximum 500 per capacity',true)}else cart.push({capacity,quantity});renderCart()};
$('cart').onclick=e=>{const b=e.target.closest('[data-remove]');if(b){cart.splice(Number(b.dataset.remove),1);renderCart()}};
$('submit-request').onclick=async()=>{if(profile?.role!=='sales')return notify('Sales Team only',true);if(!selected||!cart.length)return notify('Select HD and add cooler quantity',true);if(!confirm('Submit request and reserve HD balance?'))return;try{const id=check(await db.rpc('submit_cooler_request',{p_hd:selected.hd_code,p_lines:cart}));notify('Request submitted: '+id);cart=[];await refreshHD();await Promise.all([renderMyRequests(),renderRequests(),renderNegative()]);scheduleLiveRefresh();}catch(e){notify(e.message,true)}};
async function refreshHD(){if(!selected)return;const code=selected.hd_code;const rows=check(await db.from('hd_balances').select('*').eq('hd_code',code));if(rows.length&&selected?.hd_code===code){selected=rows[0];await renderHD()}}
async function renderMyRequests(){if(profile?.role!=='sales')return;const rs=check(await db.from('requests').select('id,hd_code,total_amount,status,requested_at').order('requested_at',{ascending:false}).limit(50));$('my-requests').innerHTML=table(['Request ID','HD','Amount','Status','Date'],rs.map(r=>[r.id.slice(0,8),r.hd_code,money(r.total_amount),r.status,new Date(r.requested_at).toLocaleString()]))}
async function renderNegative(){
 if(!user)return;
 const perTable=15,perPage=perTable*2,from=negativePage*perPage;
 const q=await db.from('hd_balances').select('hd_code,hd_name,available_balance',{count:'exact'})
  .lt('available_balance',0).order('available_balance',{ascending:true}).range(from,from+perPage-1);
 const rs=check(q),pages=Math.max(1,Math.ceil((q.count||0)/perPage));
 negativePage=Math.min(negativePage,pages-1);
 const halves=[rs.slice(0,perTable),rs.slice(perTable,perPage)];
 $('negative-list').innerHTML=halves.map((group,i)=>
  `<div class="negative-half"><h3>Negative HD Balances · Table ${i+1}</h3>`+
  table(['HD Code','HD Name','Negative Balance'],group.map(h=>[h.hd_code,h.hd_name,money(h.available_balance)]))+'</div>'
 ).join('');
 $('neg-page').textContent=`Page ${negativePage+1} of ${pages} · 15 per table`;
 $('neg-prev').disabled=negativePage===0;
 $('neg-next').disabled=negativePage>=pages-1;
}
$('neg-prev').onclick=async()=>{negativePage=Math.max(0,negativePage-1);await renderNegative()};$('neg-next').onclick=async()=>{negativePage++;await renderNegative()};
// Supabase Realtime for immediate cross-device notifications, with a 5-second
// polling fallback when Realtime is not enabled on the database publication.
function stopLiveUpdates(){
 if(livePoll){clearInterval(livePoll);livePoll=null}
 if(liveDebounce){clearTimeout(liveDebounce);liveDebounce=null}
 if(liveChannel&&db){try{db.removeChannel(liveChannel)}catch(_){}}
 liveChannel=null;liveBusy=false;
 const label=$('live-status');if(label)label.textContent='Offline';
}
async function refreshLiveData(){
 if(!user||!profile||liveBusy||document.hidden)return;
 liveBusy=true;
 try{
  if(profile.role==='admin')await Promise.all([renderRequests(),renderHistory(),renderNegative()]);
  else await Promise.all([renderMyRequests(),renderNegative()]);
  // Preserve each tab's independently selected HD; do not change its search field.
  if(selected)await refreshHD();
  const label=$('live-status');if(label)label.textContent='Synced '+new Date().toLocaleTimeString('en-IN')+' · '+lastPendingCount+' pending';
  liveErrorCount=0;
 }catch(e){const label=$('live-status');if(label)label.textContent='Sync error · '+e.message;liveErrorCount++;console.warn('Live refresh:',e.message)}
 finally{liveBusy=false}
}
function scheduleLiveRefresh(){
 if(liveDebounce)clearTimeout(liveDebounce);
 liveDebounce=setTimeout(()=>{liveDebounce=null;void refreshLiveData()},250);
}
function startLiveUpdates(){
 stopLiveUpdates();
 if(!db||!user)return;
 const label=$('live-status');if(label)label.textContent='Connecting…';
 livePoll=setInterval(()=>{void refreshLiveData()},3000);
 void refreshLiveData();
 try{
  liveChannel=db.channel('hap-requests-'+user.id)
   .on('postgres_changes',{event:'*',schema:'public',table:'requests'},scheduleLiveRefresh)
   .on('postgres_changes',{event:'*',schema:'public',table:'allocations'},scheduleLiveRefresh)
   .subscribe(status=>{if(label)label.textContent=status==='SUBSCRIBED'?'Live updates on':'Auto-sync every 3s'});
 }catch(e){if(label)label.textContent='Auto-sync every 3s'}
}
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&user)void refreshLiveData()});
async function renderRequests(){if(!user||profile.role!=='admin')return;const from=requestPage*20;const q=await db.from('requests').select('id,hd_code,cfa_code,total_amount,requested_at,status',{count:'exact'}).eq('status','pending').order('requested_at',{ascending:true}).range(from,from+19);const rs=check(q);
 const pendingCount=q.count||0;lastPendingCount=pendingCount;
 const countEl=$('pending-count');if(countEl){countEl.textContent=String(pendingCount);countEl.classList.toggle('hidden',pendingCount===0)}
 const approvalLink=document.querySelector('#role-nav [data-section="approvals-section"]');
 if(approvalLink){approvalLink.dataset.pending=String(pendingCount);approvalLink.setAttribute('aria-label','Admin Approvals, '+pendingCount+' pending requests')}
 // Compare latest request IDs (across regions) with the previous snapshot, without resetting the current HD.
 const latest=check(await db.from('requests').select('id,hd_code,requested_at').eq('status','pending').order('requested_at',{ascending:false}).limit(50));
 const nowIds=new Set(latest.map(r=>r.id));
 if(previousPendingIds!==null){
  const fresh=latest.filter(r=>!previousPendingIds.has(r.id));
  if(fresh.length){
   const banner=$('new-request-alert');
   if(banner){banner.textContent=fresh.length+' new Sales Team request(s) received · HD '+fresh.slice(0,3).map(r=>r.hd_code).join(', ');banner.classList.remove('hidden')}
  }
 }
 previousPendingIds=nowIds;
 const hdCodes=[...new Set(rs.map(r=>r.hd_code))];const hdRows=hdCodes.length?check(await db.from('hd_balances').select('hd_code,hd_name,asset_count,available_balance').in('hd_code',hdCodes)):[];const hmap=new Map(hdRows.map(h=>[h.hd_code,h]));$('approvals').innerHTML=`<table><thead><tr><th>HD Code</th><th>HD Name</th><th>No. of Assets</th><th>Available Balance</th><th>Amount</th><th>Actions</th></tr></thead><tbody>${rs.map(r=>{const h=hmap.get(r.hd_code)||{};return `<tr><td>${esc(r.hd_code)}</td><td>${esc(h.hd_name||'')}</td><td>${esc(h.asset_count||0)}</td><td>${esc(money(h.available_balance))}</td><td>${esc(money(r.total_amount))}</td><td><button data-approve="${esc(r.id)}">Approve</button> <button class="danger" data-reject="${esc(r.id)}">Reject</button></td></tr>`}).join('')}</tbody></table>`;const pages=Math.max(1,Math.ceil((q.count||0)/20));requestPage=Math.min(requestPage,pages-1);$('req-page').textContent=`Page ${requestPage+1} of ${pages}`;$('req-prev').disabled=requestPage===0;$('req-next').disabled=requestPage>=pages-1}
$('req-prev').onclick=async()=>{requestPage=Math.max(0,requestPage-1);await renderRequests()};$('req-next').onclick=async()=>{requestPage++;await renderRequests()};
$('approvals').onclick=async e=>{const btn=e.target.closest('[data-approve],[data-reject]');if(!btn)return;const approve=!!btn.dataset.approve,id=btn.dataset.approve||btn.dataset.reject;if(!confirm(approve?'Approve and allocate FIFO stock?':'Reject and release balance?'))return;try{btn.disabled=true;check(await db.rpc('review_cooler_request',{p_id:id,p_approve:approve,p_note:''}));notify(approve?'Approved. FIFO allocation saved in cloud.':'Rejected. Reserved HD balance released.');await Promise.all([renderRequests(),renderHistory(),renderNegative(),renderMyRequests()]);if(selected)await refreshHD();if(approve)await draftEmail(id)}catch(err){notify(err.message,true)}finally{btn.disabled=false}};
async function renderHistory(){if(!user||profile.role!=='admin')return;const rows=check(await db.from('allocations').select('request_id,asset_tag,hd_code,hd_name,cfa_code,capacity,allocated_at').order('allocated_at',{ascending:false}).limit(100));$('allocation-history').innerHTML=table(['HD Code','HD Name','CFA','Asset Tag','Capacity','Allocated At'],rows.map(a=>[a.hd_code,a.hd_name,a.cfa_code,a.asset_tag,a.capacity,new Date(a.allocated_at).toLocaleString()]))}
const AUDIT_HEAD=['Request ID','HD Code','HD Name','CFA Code','Asset Tag Number','Cooler Capacity','Allocation Date (UTC)','Allocated By'];
$('export-history').onclick=async()=>{try{const rows=await fetchAll('allocations','request_id,hd_code,hd_name,cfa_code,asset_tag,capacity,allocated_at,allocated_by');exportCSV('HD_Allocation_History.csv',AUDIT_HEAD,rows.map(a=>[a.request_id,a.hd_code,a.hd_name,a.cfa_code,a.asset_tag,a.capacity,a.allocated_at,a.allocated_by]));notify('Allocation history downloaded')}catch(e){notify(e.message,true)}};
async function draftEmail(id){try{const req=check(await db.from('requests').select('hd_code,cfa_code,reviewed_at').eq('id',id).single());const contact=check(await db.from('hd_contacts').select('sdm_email,cfa_email,sdm_name,cfa_name').eq('hd_code',req.hd_code).maybeSingle());const rows=check(await db.from('allocations').select('asset_tag,hd_code,hd_name,cfa_code,capacity,allocated_at').eq('request_id',id));const to=[contact?.sdm_email,contact?.cfa_email].filter(Boolean).join('; ');const subject='Cooler Allocation Approved - HD '+req.hd_code;const body=`<!doctype html><html><head><meta charset="utf-8"><title>${esc(subject)}</title></head><body><h2>${esc(subject)}</h2><p><b>To:</b> ${esc(to||'SDM / CFA email not configured')}</p><p><b>Approved at:</b> ${esc(req.reviewed_at)}</p><p>Dear Team, please arrange distribution of the following FIFO-allocated assets.</p>${table(['Asset Tag','HD Code','HD Name','CFA Code','Capacity','Allocation Date'],rows.map(r=>[r.asset_tag,r.hd_code,r.hd_name,r.cfa_code,r.capacity,r.allocated_at]))}<p>Regards,<br>Asset Management Team</p><p><i>Draft only; not automatically sent.</i></p></body></html>`;download('Allocation_Email_Draft_'+req.hd_code+'.html',body,'text/html;charset=utf-8');}catch(e){notify('Allocation saved; email draft could not be generated: '+e.message,true)}}
function dateExcel(value){if(typeof value==='number'){const d=new Date(Date.UTC(1899,11,30)+value*86400000);return d.toISOString().slice(0,10)}const s=String(value??'').trim();if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);if(m)return `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;throw new Error('Invalid receipt date: '+s)}
function toRows(kind,source){const keys=COLUMNS[kind];const numeric=new Set(['total_deposit','security_deposit','dd_value','asset_value']);return source.map((item,i)=>{const values=Object.entries(item).map(([k,v])=>[norm(k).replace(/[^A-Z0-9]/g,''),v]);const row={};for(const field of keys){const aliases=[field,...(ALIASES[field]||[])].map(k=>norm(k).replace(/[^A-Z0-9]/g,''));const match=values.find(([k])=>aliases.includes(k));let v=match?.[1]??'';if(field==='receipt_date'){if(!v)throw new Error('Missing Stock Receipt Date at row '+(i+2));v=dateExcel(v)}else if(numeric.has(field)){v=Number(String(v).replace(/[₹,\s]/g,''))||0;if(v<0)throw new Error('Negative value at row '+(i+2))}else v=String(v).trim();row[field]=v}
 if(!row.hd_code&&kind!=='stock')throw new Error('Missing HD Code at row '+(i+2));if(kind==='stock'&&!row.cfa_code)throw new Error('Missing CFA Code at row '+(i+2));if(kind==='stock'){row.stock_status=norm(row.stock_status||'AVAILABLE');row.allocation_status=norm(row.allocation_status||'UNALLOCATED');if(['IN STOCK','INHAND','READY','FREE'].includes(row.stock_status))row.stock_status='AVAILABLE';if(['AVAILABLE','NOT ALLOCATED','PENDING','FREE'].includes(row.allocation_status))row.allocation_status='UNALLOCATED'}if(['assets','stock'].includes(kind)&&(!row.asset_tag||!row.capacity))throw new Error('Missing asset tag or capacity at row '+(i+2));return row})}
async function uploadMaster(file,kind){if(profile.role!=='admin')throw new Error('Admin only');if(!file) return;if(!confirm(`Replace entire ${kind} master using ${file.name}? This changes live production data.`))return;const bytes=await file.arrayBuffer();const wb=XLSX.read(bytes,{type:'array',cellDates:false});const ws=wb.Sheets[wb.SheetNames[0]];const source=XLSX.utils.sheet_to_json(ws,{defval:'',raw:true});if(!source.length)throw new Error('Excel sheet has no data rows');if(source.length>15000)throw new Error('Maximum 15,000 rows per import. Use a backend bulk-import job for larger files.');const rows=toRows(kind,source);const uniqueField=['assets','stock'].includes(kind)?'asset_tag':'hd_code';const ids=new Set();for(const r of rows){if(ids.has(r[uniqueField]))throw new Error('Duplicate '+uniqueField+': '+r[uniqueField]);ids.add(r[uniqueField])}const result=check(await db.rpc('import_master',{p_kind:kind,p_rows:rows}));notify(`${kind}: ${result} rows imported to Supabase`);await renderNegative();if(selected)await refreshHD()}
document.querySelectorAll('[data-master]').forEach(input=>input.onchange=async()=>{try{input.disabled=true;await uploadMaster(input.files[0],input.dataset.master)}catch(e){notify(e.message,true)}finally{input.disabled=false;input.value=''}});
$('toggle-upload').onclick=()=>{const collapsed=$('upload-content').classList.toggle('hidden');$('toggle-upload').textContent=collapsed?'View uploads':'Hide uploads'};
if(configure())restore();
