#!/usr/bin/env python3
"""
LinkFlow — regenerate data/directories.yaml from all sources.
Idempotent: rebuilds from backlink-pilot + travel baseline, merges external lists.

Dedupe rules:
  - Within a category: by (name, submitUrl) normalized
  - Cross-category: same submitUrl domain AND same submitUrl path → keep highest-priority cat
  - Reddit/awesome/community sub-entries share root domains but distinct paths → kept
"""
import re, os, yaml
from urllib.parse import urlparse

# Source lists: prefer repo's scripts/sources/, fall back to /tmp cache
_HERE = os.path.dirname(os.path.abspath(__file__))
_REPO = os.path.abspath(os.path.join(_HERE, '..'))
SRC_LIST = os.path.join(_REPO, 'scripts', 'sources')
if not os.path.isdir(SRC_LIST):
    SRC_LIST = '/tmp/linkflow-sources'
BP = os.path.join(SRC_LIST, 'backlink-pilot-targets.yaml')
DB = os.path.join(_REPO, 'data', 'directories.yaml')

# ─── helpers ─────────────────────────────────────────────────────────────────
def norm_domain(url):
    if not url: return None
    u = url.strip().strip('"').strip("'")
    if not u.startswith(('http://','https://')): u = 'https://'+u
    try: net = urlparse(u).netloc.lower()
    except: return None
    net = net.split('@')[-1].split(':')[0].removeprefix('www.')
    parts = net.split('.')
    if len(parts)>=3 and parts[-1] in ('uk','au','ca','nz') and parts[-2] in ('co','com','org','net','gov'):
        return '.'.join(parts[-3:])
    return '.'.join(parts[-2:]) if len(parts)>=2 else net

def parse_table_row(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]

def extract_name_url(cell):
    m = re.match(r'\[([^\]]+)\]\(([^)]+)\)', cell)
    return (m.group(1).strip(), m.group(2).strip()) if m else (cell.strip(), None)

def cell_is_separator(line):
    return bool(re.match(r'^\s*\|?\s*:?-{3,}', line))

def parse_ultimate_submit_list(path):
    out=[]; in_t=False
    for line in open(path):
        if cell_is_separator(line): in_t=True; continue
        if in_t and line.strip().startswith('|'):
            cells=parse_table_row(line)
            if cells and cells[0].lower().startswith('no'): continue
            if len(cells)>=5:
                name,url=extract_name_url(cells[1]); price=cells[2]; typ=cells[3]
                _,su=extract_name_url(cells[4])
                if name and (url or su): out.append({'name':name,'site_url':url,'submit_url':su,'price':price,'type':typ.lower()})
        elif in_t and line.strip() and not line.strip().startswith('|'): in_t=False
    return out

def parse_md_table(path, cols, first_col=0):
    out=[]; in_t=False
    for line in open(path):
        if cell_is_separator(line): in_t=True; continue
        if in_t and line.strip().startswith('|'):
            cells=parse_table_row(line)
            if len(cells)>=cols:
                name,url=extract_name_url(cells[first_col])
                if name: out.append({'name':name,'site_url':url})
        elif in_t and line.strip() and not line.strip().startswith('|'): in_t=False
    return out

def parse_bullet_list(path):
    out=[]
    for line in open(path):
        m=re.match(r'^\s*[-*]\s+\[([^\]]+)\]\(([^)]+)\)(?:\s*[-–—]\s*(.*))?$', line)
        if m: out.append({'name':m.group(1).strip(),'site_url':m.group(2).strip(),'desc':(m.group(3) or '').strip()})
    return out

def parse_name_url_list(path):
    """mmccaff/PlacesToPostYourStartup — '* Name - URL' lines (Reddit + Websites)."""
    out = []
    for line in open(path):
        m = re.match(r'^\s*\*\s+(.+?)\s+-\s+(https?://\S+)\s*$', line)
        if m:
            name = m.group(1).strip().lstrip('/').replace('*','').strip()
            url = m.group(2).strip().rstrip(')').rstrip('.').strip()
            if name and url:
                out.append({'name': name, 'site_url': url})
    return out

def parse_startup_launch_list(path):
    out=[]
    for line in open(path):
        m=re.match(r'^\s*\|?\s*\[([^\]]+)\]\(([^)]+)\)', line)
        if m and 'http' in m.group(2): out.append({'name':m.group(1).strip(),'site_url':m.group(2).strip()})
    return out

def parse_awesome_saas(path):
    out=[]; in_t=False
    for line in open(path):
        if cell_is_separator(line): in_t=True; continue
        if in_t and line.strip().startswith('|'):
            cells=parse_table_row(line)
            if len(cells)>=5:
                name=cells[1].strip('*').strip(); dr=cells[3].strip(); _,su=extract_name_url(cells[4])
                if name: out.append({'name':name,'submit_url':su or (extract_name_url(cells[1])[1] or ''),'dr':int(dr) if dr.isdigit() else None,'price':'Free'})
        elif in_t and line.strip() and not line.strip().startswith('|'): in_t=False
    return out

def parse_submitdirectories(path, category):
    out=[]; in_t=False
    for line in open(path):
        if cell_is_separator(line): in_t=True; continue
        if in_t and line.strip().startswith('|'):
            cells=parse_table_row(line)
            if len(cells)>=5:
                cat,typ,da,url,su=[c.strip() for c in cells[:5]]
                if url.startswith('http'):
                    name=urlparse(url).netloc.replace('www.','')
                    out.append({'name':name,'site_url':url,'submit_url':su if su.startswith('http') else url,'da':int(da) if da.isdigit() else None,'type':typ.lower(),'price':typ,'category':cat})
        elif in_t and line.strip() and not line.strip().startswith('|'): in_t=False
    return out

# ─── 1. Parse backlink-pilot baseline ────────────────────────────────────────
sections={}; current=None; entries=[]; entry=None
for line in open(BP):
    m=re.match(r'^([a-z_]+):\s*$',line)
    if m:
        if current and entries: sections[current]=entries
        current=m.group(1); entries=[]; entry=None; continue
    m=re.match(r'^\s*-\s*name:\s*(.*)$',line)
    if m and current: entry={'name':m.group(1).strip()}; entries.append(entry); continue
    m=re.match(r'^\s+([a-z_]+):\s*(.*)$',line)
    if m and entry is not None and current: entry[m.group(1)]=m.group(2).strip().strip('"')
if current and entries: sections[current]=entries

CAT={'overseas_ai_directories':'ai','overseas_general':'general','overseas_directories':'startup',
     'chinese_ai_directories':'ai-zh','chinese_general':'general-zh','communities_manual':'community',
     'awesome_lists':'awesome','reddit':'reddit'}

db={}
for sec,ents in sections.items():
    cat=CAT.get(sec,sec); db.setdefault(cat,[])
    for e in ents:
        auto=e.get('auto','manual')
        if auto not in ('yes','manual','no'): auto='manual'
        item={'name':e.get('name',''),'submitUrl':e.get('submit_url',''),'type':e.get('type','form'),'auto':auto,'lang':e.get('lang','en')}
        if e.get('notes'): item['notes']=e['notes']
        st=e.get('status','active')
        if st!='active': item['status']=st if st in ('dead','paid') else 'unknown'
        if item['name']: db[cat].append(item)

# travel baseline — preserve from current DB (curated) even on domain collisions
cur=yaml.safe_load(open(DB))
if cur.get('travel'): db['travel']=cur['travel']

domains=set()
for cat,ents in db.items():
    for e in ents:
        d=norm_domain(e.get('submitUrl') or '')
        if d: domains.add(d)

# ─── 2. Parse external sources ───────────────────────────────────────────────
sources={
 'ultimate-submit-list':parse_ultimate_submit_list(f'{SRC_LIST}/BossChow_ultimate-submit-list_main.md'),
 'awesome-saas-directories':parse_awesome_saas(f'{SRC_LIST}/theshubh77_awesome-saas-directories.md'),
 'directory-submission-sites':parse_md_table(f'{SRC_LIST}/rushout09_directory-submission-sites_main.md',4),
 'startup-launch-list':parse_startup_launch_list(f'{SRC_LIST}/volodstaimi_Startup-Launch-List_main.md'),
 'startup-directories':parse_md_table(f'{SRC_LIST}/nilandev_startup-directories.md',2),
 'mahseema-saas':parse_bullet_list(f'{SRC_LIST}/mahseema_awesome-saas-directories_main.md'),
 'launch-platforms':parse_bullet_list(f'{SRC_LIST}/DirectorySurf_awesome-launch-platforms_main.md'),
 'best-of-ai':parse_bullet_list(f'{SRC_LIST}/best-of-ai_ai-directories_main.md'),
 'placestopost':parse_name_url_list(f'{SRC_LIST}/mmccaff_PlacesToPostYourStartup.md'),
 'submitdir-ai':parse_submitdirectories(f'{SRC_LIST}/submitdirectories_AI.md','ai'),
 'submitdir-saas':parse_submitdirectories(f'{SRC_LIST}/submitdirectories_SaaS.md','saas'),
 'submitdir-tool':parse_submitdirectories(f'{SRC_LIST}/submitdirectories_Tool.md','tool'),
 'submitdir-startup':parse_submitdirectories(f'{SRC_LIST}/submitdirectories_Startup.md','startup'),
}
for name,ents in sources.items(): print(f'  {name}: {len(ents)} raw')

def guess_category(name,url,src):
    n=name.lower(); u=(url or '').lower()
    if src in ('submitdir-ai',) or 'ai' in n or 'ai-' in u or 'tool' in n: return 'ai'
    if src in ('submitdir-saas','submitdir-startup','directory-submission-sites','startup-launch-list','ultimate-submit-list','awesome-saas-directories','mahseema-saas'): return 'startup'
    if src in ('launch-platforms','submitdir-tool'): return 'general'
    if src == 'placestopost':
        return 'reddit' if '/r/' in u or n.startswith('/r/') else 'startup'
    return 'general'

# ─── 3. Merge with correct dedupe ────────────────────────────────────────────
added=0
for src,ents in sources.items():
    for e in ents:
        url=e.get('submit_url') or e.get('site_url')
        d=norm_domain(url)
        if not d or d in domains: continue
        item={'name':e['name'].replace('(','').replace(')','').strip(),
              'submitUrl':e.get('submit_url') or url,'type':e.get('type') or 'form',
              'auto':'manual','lang':'en','notes':f'[from {src}]'}
        price=e.get('price','').lower()
        if 'paid' in price or '$' in price: item['status']='paid'
        elif 'free' in price: item['status']='active'
        if e.get('dr'): item['dr']=e['dr']
        cat=guess_category(item['name'],item['submitUrl'],src)
        db.setdefault(cat,[]).append(item)
        domains.add(d); added+=1

# ─── 4. Within-category dedupe (name+submitUrl) ──────────────────────────────
for cat in db:
    seen=set(); kept=[]
    for e in db[cat]:
        key=(e['name'].lower(), norm_domain(e.get('submitUrl','')))
        if key in seen: continue
        seen.add(key); kept.append(e)
    db[cat]=kept

with open(DB,'w') as f:
    yaml.safe_dump(db,f,sort_keys=False,allow_unicode=True,default_flow_style=False)

total=sum(len(v) for v in db.values())
print(f'\nAdded {added} new. Final: {total} across {len(db)} categories')
for k,v in db.items(): print(f'  {k}: {len(v)}')
