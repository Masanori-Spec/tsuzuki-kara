from pathlib import Path
import os, shutil
from playwright.sync_api import sync_playwright
import json, sys, traceback
from browser_harness import mount
OUT=Path(__file__).resolve().parent; results=[]

def check(app,name,condition):
    ok=bool(condition);results.append({'app':app,'test':name,'pass':ok})
    print(('PASS' if ok else 'FAIL')+' '+app+' '+name,flush=True)
    if not ok: raise AssertionError(name)

def spy(page):
    page.evaluate('''()=>{window.__exports=[];Quiet.download=async(name,content,type)=>{const blob=content instanceof Blob?content:new Blob([content]);window.__exports.push({name,type:type||blob.type,text:blob.type==='image/png'?null:await blob.text(),signature:blob.type==='image/png'?Array.from(new Uint8Array(await blob.arrayBuffer()).slice(0,8)):null});};}''')

def exported(page,button,parse=True):
    old=page.evaluate('__exports.length');page.click(button)
    for _ in range(40):
        if page.evaluate('__exports.length')>old: break
        page.wait_for_timeout(50)
    x=page.evaluate('__exports.at(-1)');return json.loads(x['text']) if parse else x

def import_json(page,selector,data,name='backup.json'):
    buf=data if isinstance(data,bytes) else json.dumps(data,ensure_ascii=False).encode()
    page.locator(selector).set_input_files({'name':name,'mimeType':'application/json','buffer':buf})
    page.wait_for_timeout(180)

def boot(b,slug,storage=None):
    p=b.new_page(viewport={'width':1440,'height':1050})
    p.set_default_timeout(7000);errs=[];p.on('pageerror',lambda e:errs.append(str(e)))
    p.on('dialog',lambda d:d.accept());mount(p,slug,storage={} if storage is None else storage);spy(p)
    return p,errs

def storage(p):return p.evaluate('Object.fromEntries(__testStorage)')

def handoff(b):
    s='tsuzuki-kara';p,errs=boot(b,s);p.click('#sampleBtn')
    preview=p.locator('#handoffPreview').input_value()
    check(s,'sample exports current 1200 not superseded 2000','1,200' in preview and '2,000' not in preview)
    check(s,'pending title excluded by default','魔法の道具' not in preview)
    check(s,'other scope excluded from global handoff','140字' not in preview)
    p.locator('#outputScope').select_option('SNS用');pv=p.locator('#handoffPreview').input_value()
    check(s,'scope override exports 140 not global1200','140字' in pv and '1,200字' not in pv)
    p.locator('#outputScope').select_option('全体');p.locator('#includePending').check()
    check(s,'pending can be explicitly included with status','魔法の道具' in p.locator('#handoffPreview').input_value() and '未承認' in p.locator('#handoffPreview').input_value())
    p.locator('#includePending').uncheck();p.locator('#includeHistory').check()
    check(s,'history can be explicitly included','2,000字' in p.locator('#handoffPreview').input_value())
    p.locator('#includeHistory').uncheck()
    p.locator('#recordTitle').fill('色の指定');p.locator('#recordContent').fill('アクセントは青を使う。');p.locator('#recordAuthor').select_option('ai')
    check(s,'AI author defaults to pending',p.locator('#recordStatus').input_value()=='pending')
    p.locator('#recordStatus').select_option('active');p.click('#saveRecord')
    check(s,'AI active requires explicit approval',p.locator('#formError').is_visible() and 'チェック' in p.locator('#formError').inner_text())
    p.locator('#approvalCheck').check();p.click('#saveRecord')
    check(s,'approved AI record is exported','アクセントは青' in p.locator('#handoffPreview').input_value())
    p.locator('article.record').filter(has=p.locator('h3',has_text='色の指定')).locator('[data-action="replace"]').click()
    p.locator('#recordContent').fill('アクセントは紫を使う。');p.click('#saveRecord')
    pv=p.locator('#handoffPreview').input_value()
    check(s,'replacement excludes old text','アクセントは紫' in pv and 'アクセントは青' not in pv)
    backup=exported(p,'#exportBackup');proj=next(x for x in backup['projects'] if x['id']==backup['activeProject']);rs=[x for x in proj['records'] if x['title']=='色の指定']
    check(s,'replacement preserves old record and lineage',len(rs)==2 and {x['status'] for x in rs}=={'active','superseded'} and any(x['supersedes'] for x in rs))
    p.locator('#recordTitle').fill('<img src=x onerror=alert(1)>');p.locator('#recordContent').fill('<b>text</b>');p.click('#saveRecord')
    check(s,'record content is safe text',p.locator('#records img').count()==0 and p.locator('#records b').count()==0)
    before=p.locator('#recordCount').inner_text();import_json(p,'#backupFile',{'app':'wrong','version':1})
    check(s,'invalid backup leaves record count unchanged',p.locator('#recordCount').inner_text()==before)
    p.locator('#autosave').check();p.wait_for_timeout(350);saved=storage(p);p2,err2=boot(b,s,saved)
    check(s,'restores complete ledger using saved fixture',p2.locator('#recordCount').inner_text()==before and p2.locator('#autosave').is_checked())
    p2.evaluate("dispatchEvent(new StorageEvent('storage',{key:'quiet.tsuzuki-kara.v1'}))")
    check(s,'cross-tab notice stops competing saves',not p2.locator('#autosave').is_checked())
    p.click('#newProject');p.locator('#projectNameInput').fill('Isolated work');p.locator('#projectForm').evaluate('e=>e.requestSubmit()')
    check(s,'new project does not leak other decisions','アクセント' not in p.locator('#handoffPreview').input_value() and p.locator('#recordCount').inner_text()=='0件')
    import_json(p,'#backupFile',backup)
    check(s,'backup restores selected project and records','アクセントは紫' in p.locator('#handoffPreview').input_value())
    text=exported(p,'#downloadHandoff',False)
    check(s,'Markdown export equals preview',text['text']==p.locator('#handoffPreview').input_value())
    p.click('#clearAll');check(s,'clear all resets storage and project',p.locator('#recordCount').inner_text()=='0件' and 'quiet.tsuzuki-kara.v1' not in storage(p))
    check(s,'no JavaScript errors',not errs and not err2);p.close();p2.close()

with sync_playwright() as tool:
    executable=os.environ.get('QUIET_CHROMIUM') or shutil.which('chromium')
    kwargs={'headless':True}
    if executable: kwargs['executable_path']=executable
    browser=tool.chromium.launch(**kwargs)
    try:
        handoff(browser)
    except Exception as e:
        results.append({'app':'tsuzuki-kara','test':'unexpected harness error','pass':False,'detail':str(e)});traceback.print_exc()
    finally:
        browser.close()
(OUT/'integration-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
print('TOTAL',len(results),'PASS',sum(r['pass'] for r in results),'FAIL',sum(not r['pass'] for r in results),flush=True)
sys.exit(int(any(not r['pass'] for r in results)))
