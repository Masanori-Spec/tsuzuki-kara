'use strict';
(() => {
const Q=Quiet,C=HandoffCore,$=Q.$,KEY='quiet.tsuzuki-kara.v1';
const fresh=()=>{const id=Q.id();return {app:'tsuzuki-kara',version:1,activeProject:id,projects:[{id,name:'はじめの作業',goal:'',next:'',records:[]}]};};
let store=fresh(),filter='current',outputScope='全体',replacing=null,dirty=false,editProjectId=null,saveTimer=null,renderTimer=null;
const project=()=>store.projects.find(p=>p.id===store.activeProject)||store.projects[0];
function persist(){clearTimeout(saveTimer);if($('autosave').checked)saveTimer=setTimeout(()=>{if(!Q.save(KEY,store,true))$('autosave').checked=false;},250);}
function scopes(){return ['全体',...new Set(project().records.map(r=>r.scope).filter(s=>C.norm(s)!=='全体'))];}
function renderScopes(){const ss=scopes();if(!ss.includes(outputScope))outputScope='全体';$('outputScope').innerHTML=ss.map(s=>`<option value="${Q.esc(s)}">${Q.esc(s)}</option>`).join('');$('outputScope').value=outputScope;$('scopeSuggestions').innerHTML=ss.map(s=>`<option value="${Q.esc(s)}"></option>`).join('');}
function refreshOutput(){const p=project();const opts={sources:$('includeSources').checked,rejected:$('includeRejected').checked,pending:$('includePending').checked,history:$('includeHistory').checked};$('handoffPreview').value=C.buildHandoff(p,outputScope,opts);$('exportCount').textContent=`有効 ${C.activeForScope(p,outputScope).length}件`;}
function renderProject(){const p=project();$('projectSelect').innerHTML=store.projects.map(p=>`<option value="${Q.esc(p.id)}">${Q.esc(p.name)}</option>`).join('');$('projectSelect').value=p.id;$('projectGoal').value=p.goal;$('projectNext').value=p.next;renderScopes();}
function renderRecords(){
 const p=project();$('recordCount').textContent=`${p.records.length}件`;$('activeCount').textContent=p.records.filter(r=>r.status==='active').length;$('pendingCount').textContent=p.records.filter(r=>r.status==='pending').length;$('historyCount').textContent=p.records.filter(r=>['superseded','done','archived'].includes(r.status)).length;
 const query=C.norm($('recordSearch').value);
 const rs=p.records.filter(r=>filter==='all'||(filter==='current'?['active','pending'].includes(r.status):filter==='history'?['superseded','done','archived'].includes(r.status):r.status==='rejected')).filter(r=>!query||C.norm([r.title,r.content,r.scope,r.source].join('\n')).includes(query)).slice().reverse();
 $('records').innerHTML=rs.length?rs.map(r=>{
  const controls=[];
  if(r.status==='pending')controls.push(['approve','承認する','soft'],['reject','不採用にする','ghost']);
  if(r.status==='active')controls.push(['replace','差し替える','soft'],...(r.kind==='next'?[['done','完了にする','ghost']]:[]));
  if(['rejected','archived','done'].includes(r.status))controls.push(['restore','未承認に戻す','ghost']);
  if(r.status!=='archived')controls.push(['archive','アーカイブ','ghost']);
  const badgeClass=r.status==='active'?'accent':r.status==='pending'?'warn':r.status==='rejected'?'bad':'';
  return `<article class="record ${r.status}" data-record="${Q.esc(r.id)}"><div class="record-heading"><h3>${Q.esc(r.title)}</h3><span class="badge ${badgeClass}">${C.STATUS_NAMES[r.status]}</span></div><p class="record-content">${Q.esc(r.content)}</p><div class="chip-list"><span class="chip">${C.KIND_NAMES[r.kind]}</span><span class="chip">${Q.esc(r.scope)}</span><span class="chip">${C.AUTHOR_NAMES[r.author]}${r.author!=='user'&&r.approved?' · 利用者承認済み':''}</span></div><div class="record-meta mt12">更新 ${Q.date(r.updatedAt)}${r.supersedes?' · 差し替え履歴あり':''}</div><details><summary>根拠と変更履歴</summary><div class="history-detail">${r.source?`根拠・参照：${Q.esc(r.source)}\n\n`:''}${r.history.map(h=>`${Q.esc(Q.date(h.at))}　${Q.esc(h.event)}`).join('\n')||'履歴なし。'}${r.supersedes?'\n差し替え元：'+Q.esc(p.records.find(x=>x.id===r.supersedes)?.title||'不明'):''}</div></details><div class="record-actions">${controls.map(([action,label,cls])=>`<button class="btn small ${cls}" data-action="${action}" data-id="${Q.esc(r.id)}">${label}</button>`).join('')}</div></article>`;
 }).join(''):`<div class="empty"><div class="empty-glyph" aria-hidden="true">↳</div><strong>${p.records.length?'この表示に合う記録はありません。':'最初の決定を、ひとつ残そう。'}</strong>${p.records.length?'表示タブや検索条件を変えてください。':'「新しい記録を残す」から追加するか、サンプルを試せます。'}</div>`;
}
function render(){renderProject();renderRecords();refreshOutput();persist();}
function approvalUI(){$('approvalLabel').hidden=!($('recordStatus').value==='active'&&$('recordAuthor').value!=='user');}
function clearForm(){replacing=null;dirty=false;$('recordForm').reset();$('recordScope').value='全体';$('recordAuthor').value='user';$('recordStatus').value='active';$('formHeading').textContent='新しい記録を残す';$('formMode').textContent='NEW';$('saveRecord').textContent='記録を追加する';$('replaceNotice').hidden=true;$('formError').hidden=true;approvalUI();}
function startReplace(id){const r=project().records.find(r=>r.id===id);if(!r)return;if(dirty&&!confirm('入力途中の記録を破棄し、差し替えの入力に切り替えますか？'))return;clearForm();replacing=id;$('recordTitle').value=r.title;$('recordContent').value=r.content;$('recordScope').value=r.scope;$('recordKind').value=r.kind;$('recordAuthor').value='user';$('recordStatus').value='active';$('recordSource').value=r.source;$('replaceNotice').hidden=false;$('replaceNotice').textContent='採用すると、元の記録は「変更済み」になります。未承認で保存する間は、元の記録を有効のまま残します。';$('formHeading').textContent='決定を差し替える';$('formMode').textContent='REPLACE';$('saveRecord').textContent='新しい内容で保存';dirty=true;approvalUI();$('recordContent').focus();}
function formError(message){$('formError').textContent=message;$('formError').hidden=false;}
function totalRecords(){return store.projects.reduce((n,p)=>n+p.records.length,0);}
$('recordForm').onsubmit=e=>{
 e.preventDefault();$('formError').hidden=true;
 try{
  const author=$('recordAuthor').value,status=$('recordStatus').value;
  if(status==='active'&&author!=='user'&&!$('approvalCheck').checked)throw new Error('AI・第三者の提案を有効にするには、確認・採用のチェックが必要です。');
  if(totalRecords()>=2000)throw new Error('全体の記録は2,000件までです。不要なプロジェクトを整理してください。');
  const now=new Date().toISOString(),r={id:Q.id(),title:$('recordTitle').value.trim(),content:$('recordContent').value.trim(),scope:$('recordScope').value.trim(),kind:$('recordKind').value,author,status,approved:status==='active',source:$('recordSource').value.trim(),createdAt:now,updatedAt:now,supersedes:replacing,history:[{at:now,event:status==='active'?'利用者が承認して記録':'新しい記録を追加',from:'',to:status}]};
  C.validateRecord(r);const cs=C.conflicts(project(),r),old=project().records.find(x=>x.id===replacing&&x.status==='active');
  const needReplace=status==='active'&&(cs.length||old);if(needReplace&&!confirm('現在有効な同じ項目、または差し替え元の記録を「変更済み」にし、この記録を有効にしますか？'))return;
  C.addRecord(project(),r,!!needReplace);clearForm();filter='current';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));$('recordSearch').value='';render();Q.toast('記録を保存しました。');
 }catch(err){formError(err.message);}
};
$('recordForm').addEventListener('input',()=>{dirty=true;});$('recordAuthor').onchange=()=>{$('recordStatus').value=$('recordAuthor').value==='user'?'active':'pending';$('approvalCheck').checked=false;dirty=true;approvalUI();};$('recordStatus').onchange=()=>{$('approvalCheck').checked=false;dirty=true;approvalUI();};
$('cancelRecord').onclick=()=>{if(!dirty||confirm('入力途中の内容をクリアしますか？保存済みの記録は消えません。'))clearForm();};
$('records').onclick=e=>{
 const b=e.target.closest('[data-action]');if(!b)return;const id=b.dataset.id,action=b.dataset.action,p=project(),r=p.records.find(r=>r.id===id);if(!r)return;
 if(action==='replace')return startReplace(id);
 try{
  if(action==='approve'){const conflict=C.conflicts(p,r).length||p.records.some(x=>x.id===r.supersedes&&x.status==='active');if(!confirm(conflict?'この提案を承認し、競合する有効記録を「変更済み」にしますか？':'この提案を確認し、有効な決定として採用しますか？'))return;C.transition(p,id,'active',true);}
  else if(action==='reject')C.transition(p,id,'rejected');
  else if(action==='done')C.transition(p,id,'done');
  else if(action==='restore')C.transition(p,id,'pending');
  else if(action==='archive')C.transition(p,id,'archived');
  render();Q.toast('状態を更新しました。');
 }catch(err){Q.toast(err.message);}
};
$('projectSelect').onchange=()=>{const id=$('projectSelect').value;if(dirty&&!confirm('入力途中の記録を破棄して、作業を切り替えますか？')){$('projectSelect').value=store.activeProject;return;}store.activeProject=id;outputScope='全体';$('recordSearch').value='';clearForm();render();};
for(const [id,key]of [['projectGoal','goal'],['projectNext','next']])$(id).oninput=()=>{project()[key]=$(id).value;refreshOutput();persist();};
function projectDialog(edit){editProjectId=edit?project().id:null;if(!edit&&store.projects.length>=30)return Q.toast('作業は30個までです。');$('projectDialogTitle').textContent=edit?'作業の名前を変更':'新しい作業';$('projectNameInput').value=edit?project().name:'';$('projectDialog').showModal();$('projectNameInput').focus();}
$('newProject').onclick=()=>projectDialog(false);$('editProject').onclick=()=>projectDialog(true);$('cancelProject').onclick=()=>$('projectDialog').close();
$('projectForm').onsubmit=e=>{e.preventDefault();const name=$('projectNameInput').value.trim();if(!name)return;if(editProjectId){store.projects.find(p=>p.id===editProjectId).name=name;}else{if(dirty&&!confirm('入力途中の記録を破棄して新しい作業に切り替えますか？'))return;const p={id:Q.id(),name,goal:'',next:'',records:[]};store.projects.push(p);store.activeProject=p.id;outputScope='全体';clearForm();}$('projectDialog').close();render();};
document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.setAttribute('aria-pressed',String(x.dataset.filter===filter)));renderRecords();});
$('recordSearch').oninput=()=>{clearTimeout(renderTimer);renderTimer=setTimeout(renderRecords,80);};$('outputScope').onchange=()=>{outputScope=$('outputScope').value;refreshOutput();};for(const id of ['includeSources','includeRejected','includePending','includeHistory'])$(id).onchange=refreshOutput;
$('copyHandoff').onclick=()=>Q.copy($('handoffPreview').value,$('handoffPreview'));$('downloadHandoff').onclick=()=>Q.download(`${project().name}_${outputScope}_引き継ぎ.md`,$('handoffPreview').value);
$('autosave').onchange=()=>{clearTimeout(saveTimer);if(!Q.save(KEY,store,$('autosave').checked))$('autosave').checked=false;};
$('exportBackup').onclick=()=>Q.json('つづきから_全作業バックアップ.json',store);$('importBackup').onclick=()=>$('backupFile').click();$('backupFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const data=C.validateStore(await Q.readJSON(file,8*1024*1024));if(!confirm('全プロジェクトを読み込んだバックアップに置き換えます。現在の作業は保存しましたか？'))return;store=data;outputScope='全体';clearForm();render();Q.toast('バックアップを読み込みました。');}catch(err){Q.toast(err.message);}};
$('deleteProject').onclick=()=>{const p=project();if(!confirm(`「${p.name}」と、その全記録を削除します。元に戻せません。よろしいですか？`))return;store.projects=store.projects.filter(x=>x.id!==p.id);if(!store.projects.length)store=fresh();else store.activeProject=store.projects[0].id;outputScope='全体';clearForm();render();};
$('clearAll').onclick=()=>{if(!confirm('全作業・記録・このアプリの端末保存データを消去します。元に戻せません。よろしいですか？'))return;clearTimeout(saveTimer);store=fresh();$('autosave').checked=false;Q.save(KEY,null,false);outputScope='全体';clearForm();render();Q.toast('全データを消去しました。');};
function sample(){
 if((project().records.length||store.projects.length>1||dirty)&&!confirm('サンプルは新しい作業として追加します。入力途中のフォーム内容は破棄します。続けますか？'))return;if(store.projects.length>=30)return Q.toast('作業は30個までです。');
 const now=new Date().toISOString(),p={id:Q.id(),name:'サンプル：紹介記事の制作',goal:'初めて読む人に、身近な道具の便利さが伝わる紹介記事を完成させる。',next:'有効な文字数と文体を確認し、本文の構成案を作る。',records:[]};
 const mk=(title,content,status='active',author='user',scope='全体',kind='constraint',source='利用者が画面で登録したサンプル条件。')=>({id:Q.id(),title,content,status,author,scope,kind,source,approved:status==='active',createdAt:now,updatedAt:now,supersedes:null,history:[{at:now,event:'サンプル記録を作成',from:'',to:status}]});
 const old=mk('文字数','本文は2,000字以内にする。');C.addRecord(p,old);const current=mk('文字数','本文は1,200字以内にする。参考文献は字数に含めない。');current.supersedes=old.id;C.addRecord(p,current,true);
 C.addRecord(p,mk('文体','専門用語を必要以上に使わず、です・ます調で書く。'));
 C.addRecord(p,mk('タイトル案','「明日の仕事を変える魔法の道具」というタイトルにする。','pending','ai','全体','decision','AIが提案しただけで、まだ採用していない。'));
 C.addRecord(p,mk('採用しない表現','効果を検証せず「必ず成果が出る」と断言する。','rejected','user','全体','decision','裏づけのない断言は避けたい。'));
 C.addRecord(p,mk('文字数','SNS向けの紹介文は140字以内にする。','active','user','SNS用','constraint'));
 store.projects.push(p);store.activeProject=p.id;outputScope='全体';clearForm();$('recordSearch').value='';filter='current';document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));render();Q.toast('サンプルを追加しました。古い2,000字の条件と未承認のタイトル案は、有効な指示には含まれません。');
}
$('helpBtn').onclick=Q.help;$('closeHelp').onclick=()=>$('helpDialog').close();$('sampleBtn').onclick=sample;
const saved=Q.load(KEY,C.validateStore);if(saved){store=saved;$('autosave').checked=true;}render();
window.addEventListener('storage',e=>{if(e.key===KEY&&$('autosave').checked){clearTimeout(saveTimer);$('autosave').checked=false;Q.toast('別タブで保存データが変更されました。上書きを防ぐため自動保存を停止しました。必要な内容を書き出してから再読み込みしてください。');}});
window.addEventListener('pagehide',()=>{clearTimeout(saveTimer);if($('autosave').checked)Q.save(KEY,store,true);});
window.addEventListener('beforeunload',e=>{if(dirty||(!$('autosave').checked&&store.projects.some(p=>p.records.length))){e.preventDefault();e.returnValue='';}});
})();
