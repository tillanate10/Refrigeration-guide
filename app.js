const $ = id => document.getElementById(id);
const HISTORY_KEY = 'rst_history_v2';
const CHECK_KEY = 'rst_checklist_v2';
const checklistItems = [
  'Confirm exact model and rating plate', 'Verify refrigerant type', 'Verify factory charge by exact model',
  'Verify replacement compressor', 'Replace filter-drier', 'Inspect/repair leak or restriction',
  'Pressure test with appropriate dry gas', 'Evacuate with micron gauge', 'Perform vacuum decay/hold test',
  'Charge by exact verified weight', 'Restore/secure process connection', 'Run compressor and verify operation',
  'Verify condenser heat rejection', 'Verify evaporator/frost pattern', 'Record final temperatures and amps'
];

function esc(v=''){return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]))}
function cls(c='RED'){return c.toLowerCase()}
function history(){try{return JSON.parse(localStorage.getItem(HISTORY_KEY)||'[]')}catch{return[]}}
function saveHistory(item){const h=history().filter(x=>!(x.model===item.model&&x.repair===item.repair));h.unshift(item);localStorage.setItem(HISTORY_KEY,JSON.stringify(h.slice(0,30)));renderHistory()}
function renderHistory(){const h=history();$('historyCount').textContent=h.length; $('history').innerHTML=h.length?h.map((x,i)=>`<div class="history-item"><div><b>${esc(x.model)}</b><div class="muted">${esc(x.repair)} · ${new Date(x.time).toLocaleString()}</div></div><button onclick="loadHistory(${i})">Open</button></div>`).join(''):'<div class="empty">No saved repairs yet.</div>'}
window.loadHistory=i=>{const x=history()[i]; if(!x)return; $('model').value=x.model;$('repair').value=x.repair;$('notes').value=x.notes||'';renderResults(x.data);window.scrollTo({top:0,behavior:'smooth'})}
function list(title,items){return `<h3>${title}</h3>${items?.length?`<ul class="list">${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`:'<div class="empty">No verified information returned.</div>'}`}
function renderResults(d){
 $('results').classList.remove('hidden');
 const c=d.confidence||'RED';
 $('summary').innerHTML=`<div class="summary-main"><div><div class="muted">EXACT MODEL</div><div class="big-spec">${esc(d.model||'')}</div><div class="muted">${esc(d.manufacturer||'')}</div></div><span class="confidence ${cls(c)}">${esc(c)} — ${esc(d.confidence_reason||'')}</span></div>${c!=='GREEN'?'<div class="warning">⚠ DO NOT CHARGE UNTIL THE FACTORY CHARGE AND REFRIGERANT ARE VERIFIED.</div>':''}`;
 const v=d.verified||{};
 $('specs').innerHTML=`<h3>Verified unit data</h3>${[['Refrigerant',v.refrigerant],['Factory charge',v.charge_g!=null?v.charge_g+' g':'NOT VERIFIED'],['Compressor',v.compressor],['Filter-drier',v.filter_drier],['Service port',v.service_port]].map(([a,b])=>`<div class="fact"><b>${a}</b><span>${esc(b||'Not verified')}</span></div>`).join('')}`;
 $('conflicts').innerHTML=`<h3>Conflicts & verification</h3>${d.conflicts?.length?d.conflicts.map(x=>`<div class="warning"><b>${esc(x.fact)}</b><br>${esc((x.values||[]).join(' vs '))}<br>${esc(x.explanation)}</div>`).join(''):'<div class="empty">No source conflicts reported.</div>'}`;
 $('procedure').innerHTML=`<h3>Model-specific procedure</h3>${(d.procedure||[]).map(s=>`<div class="step"><div class="step-num">STEP ${esc(s.step)}</div><h4>${esc(s.title)}</h4><p>${esc(s.instructions)}</p>${s.warning?`<div class="warning">${esc(s.warning)}</div>`:''}</div>`).join('')}`;
 $('evacuation').innerHTML=list('Evacuation & vacuum',d.evacuation); $('charging').innerHTML=list('Recharge',d.charging); $('startup').innerHTML=list('Startup checks',d.startup_checks); $('diagnostics').innerHTML=list('Diagnostics',d.diagnostics); $('safety').innerHTML=list('Safety',d.safety);
 $('sources').innerHTML=`<h3>Sources</h3>${d.sources?.length?d.sources.map(s=>`<div class="source"><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.title||s.url)}</a><div class="muted">${esc(s.type||'source')}</div></div>`).join(''):'<div class="empty">No live sources available.</div>'}`;
 renderChecklist();
}
async function research(){
 const model=$('model').value.trim(), repair=$('repair').value, notes=$('notes').value.trim();
 if(!model){alert('Enter the exact model number first.');return}
 $('researchBtn').disabled=true;$('researchBtn').textContent='RESEARCHING…';
 try{const r=await fetch('/api/research',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,repair,notes,tech_mode:true})});const d=await r.json();renderResults(d);saveHistory({model:model.toUpperCase(),repair,notes,data:d,time:Date.now()});$('results').scrollIntoView({behavior:'smooth'});}catch(e){alert('Research failed. Check that the backend is running.')}finally{$('researchBtn').disabled=false;$('researchBtn').textContent='RESEARCH MODEL'}
}
async function analyzePlate(file){
 if(!file)return; $('plateStatus').textContent='Reading rating plate…';
 const fd=new FormData();fd.append('file',file);
 try{const r=await fetch('/api/analyze-rating-plate',{method:'POST',body:fd});const d=await r.json(); if(!r.ok)throw new Error(d.detail||'Unable to read plate');
   if(d.model)$('model').value=d.model;if(d.charge_g)$('notes').value=`Rating plate charge: ${d.charge_g} g\n`+($('notes').value||'');
   $('plateStatus').innerHTML=`<div class="plate-found">Plate read: ${esc(d.manufacturer||'')} ${esc(d.model||'')} · ${esc(d.refrigerant||'')} ${d.charge_g?`· ${esc(d.charge_g)} g`:''}</div>`;
 }catch(e){$('plateStatus').textContent=e.message||'Plate analysis failed.'}
}
function renderChecklist(){let done=[];try{done=JSON.parse(localStorage.getItem(CHECK_KEY)||'[]')}catch{};$('checklist').innerHTML=checklistItems.map((x,i)=>`<label class="check-row"><input type="checkbox" ${done.includes(i)?'checked':''} onchange="toggleCheck(${i},this.checked)"><span>${esc(x)}</span></label>`).join('')}
window.toggleCheck=(i,on)=>{let d=[];try{d=JSON.parse(localStorage.getItem(CHECK_KEY)||'[]')}catch{};d=on?[...new Set([...d,i])]:d.filter(x=>x!==i);localStorage.setItem(CHECK_KEY,JSON.stringify(d))};
$('researchBtn').onclick=research;$('plateBtn').onclick=()=>$('plateInput').click();$('plateInput').onchange=e=>analyzePlate(e.target.files[0]);$('clearHistory').onclick=()=>{localStorage.removeItem(HISTORY_KEY);renderHistory()};$('resetChecklist').onclick=()=>{localStorage.removeItem(CHECK_KEY);renderChecklist()};$('modeBtn').onclick=()=>document.body.classList.toggle('tech-mode');renderHistory();renderChecklist();

let deferredInstallPrompt = null;
const installBtn = $('installBtn');
const shareBtn = $('shareBtn');
const toast = $('toast');
function showToast(message){ toast.textContent=message; toast.classList.remove('hidden'); toast.classList.add('show'); setTimeout(()=>{toast.classList.remove('show');toast.classList.add('hidden')},2600); }
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstallPrompt=e; installBtn.classList.remove('hidden'); });
installBtn.onclick = async () => { if(!deferredInstallPrompt){showToast('Use your browser menu to Add to Home Screen.');return;} deferredInstallPrompt.prompt(); await deferredInstallPrompt.userChoice; deferredInstallPrompt=null; installBtn.classList.add('hidden'); };
shareBtn.onclick = async () => { const data={title:'Refrigerator Sealed-System Tech',text:'Refrigerator Sealed-System Tech — exact-model appliance repair research tool.',url:location.href}; try { if(navigator.share) await navigator.share(data); else { await navigator.clipboard.writeText(location.href); showToast('App link copied.'); } } catch(e){} };
if ('serviceWorker' in navigator) window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(()=>{}));
const params=new URLSearchParams(location.search); if(params.get('action')==='history') setTimeout(()=>document.querySelector('.history-card')?.scrollIntoView({behavior:'smooth'}),200); if(params.get('action')==='research') setTimeout(()=>$('model')?.focus(),200);
