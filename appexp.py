import csv,json,os,re,sys,requests
U=(os.environ.get('NEXT_PUBLIC_SUPABASE_URL') or '').rstrip('/')
K=os.environ.get('SUPABASE_SERVICE_ROLE_KEY') or ''
if not U or not K: sys.exit('missing supabase env vars')
O='app_export'; os.makedirs(O,exist_ok=True)
T=['transactions','transaction_internal_agents','transaction_external_brokerages',
'users','agent_form_submissions','checks_received','agent_debts','company_settings',
'processing_fee_types','commission_plans']
def grab(t):
    rows=[];off=0;tot=None
    while True:
        h={'apikey':K,'Authorization':'Bearer '+K,'Range-Unit':'items',
           'Range':'%d-%d'%(off,off+999),'Prefer':'count=exact'}
        r=requests.get(U+'/rest/v1/'+t,headers=h,params={'select':'*'},timeout=120)
        if not r.ok: return None,'HTTP %d %s'%(r.status_code,r.text[:80])
        m=re.match(r'\d+-\d+/(\d+)',r.headers.get('content-range',''))
        if m: tot=int(m.group(1))
        b=r.json()
        if not isinstance(b,list): return None,'bad shape'
        rows+=b
        if len(b)<1000: break
        off+=1000
    if tot is not None and len(rows)!=tot: return None,'row loss %d vs %d'%(len(rows),tot)
    return rows,None
print('='*58)
for t in T:
    rows,e=grab(t)
    if e: print('  %-34s SKIP %s'%(t,e)); continue
    c=[]
    for r in rows:
        for k in r:
            if k not in c: c.append(k)
    with open(O+'/'+t+'.csv','w',newline='',encoding='utf-8') as f:
        w=csv.DictWriter(f,fieldnames=c,extrasaction='ignore'); w.writeheader()
        for r in rows:
            w.writerow({k:(json.dumps(v) if isinstance(v,(dict,list)) else v) for k,v in r.items()})
    print('  %-34s %6d rows  %3d cols'%(t,len(rows),len(c)))
print('='*58)
