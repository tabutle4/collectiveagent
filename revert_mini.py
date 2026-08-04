import csv,os,sys,time,requests
K=os.environ['BM_API_KEY'];B='https://my.brokermint.com/api'
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
        return r.status_code,(r.json() if r.ok and r.text[:1] in '{[' else None)
    return 0,None
want={}
for r in csv.DictReader(open('arch_log.csv',newline='')):
    o=(r['orig'] or '').strip()
    if o and o!='closed': want[r['id']]=o
done=set()
if os.path.exists('revert_log.csv'):
    done={r['id'] for r in csv.DictReader(open('revert_log.csv',newline='')) if r['result'] in ('restored','already')}
todo={k:v for k,v in want.items() if k not in done}
from collections import Counter
print('moved off original %d, already handled %d, to do %d'%(len(want),len(done),len(todo)))
print('  targets:',dict(Counter(todo.values())))
if 'run' not in sys.argv: print('dry run - rerun with: python3 revert_mini.py run'); sys.exit()
n=not os.path.exists('revert_log.csv'); fh=open('revert_log.csv','a',newline='')
w=csv.DictWriter(fh,fieldnames=['id','target','was','result'])
if n: w.writeheader()
ok=sk=er=0
for j,(i,t) in enumerate(sorted(todo.items()),1):
    k,d=c('GET','/v2/transactions/%s'%i)
    if k!=200 or not isinstance(d,dict):
        w.writerow({'id':i,'target':t,'was':'','result':'FAILED'}); fh.flush(); er+=1; continue
    cur=(d.get('status') or '').strip()
    if cur==t:
        w.writerow({'id':i,'target':t,'was':cur,'result':'already'}); fh.flush(); sk+=1
    else:
        p={x:y for x,y in d.items() if x not in RO}; p['status']=t
        s=c('PUT','/v2/transactions/%s'%i,p)[0]; g=s in (200,201,204)
        w.writerow({'id':i,'target':t,'was':cur,'result':'restored' if g else 'FAILED'}); fh.flush()
        ok+=g; er+=(not g)
    if j%25==0 or j==len(todo): print('  %d/%d  restored %d  already %d  failed %d'%(j,len(todo),ok,sk,er))
fh.close(); print('done. restored %d, already correct %d, failed %d'%(ok,sk,er))
