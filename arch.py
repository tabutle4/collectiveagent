import csv,json,os,sys,time,requests
K=os.environ['BM_API_KEY'];B='https://my.brokermint.com/api';L='arch_log.csv'
RO={'id','created_at','updated_at','closed_at','custom_id','commissions_finalized_at',
'total_gross_commission','sales_volume','buying_side_representer','listing_side_representer'}
t0=[0.0]
def c(m,e,b=None):
    for _ in range(8):
        w=1.5-(time.time()-t0[0])
        if w>0: time.sleep(w)
        t0[0]=time.time()
        r=requests.request(m,B+e,params={'api_key':K},json=b,timeout=120)
        if r.status_code==429: print('  throttled 60s'); time.sleep(60); continue
        return r.status_code, (r.json() if r.ok and r.text[:1] in '{[' else None)
    return 0,None
def st(i,s):
    k,f=c('GET','/v2/transactions/%s'%i)
    if k!=200 or not isinstance(f,dict): return 0
    d={x:y for x,y in f.items() if x not in RO}; d['status']=s
    return c('PUT','/v2/transactions/%s'%i,d)[0]
idx=json.load(open('bm_api_out/transactions_index.json',encoding='utf-8'))
done=set()
if os.path.exists(L):
    done={r['id'] for r in csv.DictReader(open(L,newline=''))}
print('deals %d, already done %d, writes needed %d'%(len(idx),len(done),2*(len(idx)-len(done))))
if 'run' not in sys.argv: print('dry run - rerun with: python3 arch.py run'); sys.exit()
n=not os.path.exists(L); fh=open(L,'a',newline=''); w=csv.DictWriter(fh,fieldnames=['id','orig','address','result'])
if n: w.writeheader()
ok=er=0
for j,t in enumerate(idx,1):
    i=str(t['id'])
    if i in done: continue
    o=t.get('status') or ''
    a=st(i,'pending'); b=st(i,'closed')
    g=a in (200,201,204) and b in (200,201,204)
    ok+=g; er+=(not g)
    w.writerow({'id':i,'orig':o,'address':t.get('address'),'result':'ok' if g else 'FAILED'}); fh.flush()
    if j%25==0 or j==len(idx): print('  %d/%d  ok %d  failed %d'%(j,len(idx),ok,er))
fh.close(); print('done. ok %d failed %d. log %s'%(ok,er,L))
