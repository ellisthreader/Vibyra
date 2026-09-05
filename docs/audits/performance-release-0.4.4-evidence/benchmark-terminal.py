from pathlib import Path
import os,sys,time,json,subprocess,psutil
cache=Path(__file__).parent;label=sys.argv[1];out=cache/'device'/label;events=out/'terminal-events.jsonl';env=dict(os.environ,DISPLAY=':94');runs=[]
def observed():return [json.loads(l) for l in events.read_text().splitlines()]
def send(value,mode='typing'):
 start=time.monotonic();before=len(observed())
 if mode=='paste':
  subprocess.run(['xclip','-selection','clipboard','-loops','1'],input=value.encode(),env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
  subprocess.run(['xdotool','key','ctrl+shift+v'],env=env,check=True)
  time.sleep(.5) # Allow asynchronous clipboard acquisition before Enter.
 else:subprocess.run(['xdotool','type','--clearmodifiers','--delay','1',value],env=env,check=True)
 subprocess.run(['xdotool','key','Return'],env=env,check=True)
 deadline=time.monotonic()+20
 while time.monotonic()<deadline:
  new=[x for x in observed()[before:] if x['kind']=='input']
  if new:
   assert new[0]['text']==value,('Input mismatch',len(new[0]['text']),len(value))
   runs.append({'mode':mode,'characters':len(value),'injectionToPtyReadMs':(new[0]['monotonic']-start)*1000,'exact':True});return
  time.sleep(.005)
 raise RuntimeError('Input did not arrive')
for n in range(10):send('FAST_'+str(n)+'_'+('aB09_-'*20))
send('PASTE_'+('xY09_'*400),'paste')
send('BURST');send('AFTER_BURST_'+('b8_'*40))
assert any(x['kind']=='burst-done' for x in observed())
time.sleep(4)
def snapshot():
 result={}
 for p in psutil.process_iter(['name']):
  try:
   if ('vibyra' in p.name().lower() or 'webkit' in p.name().lower()) and p.environ().get('XDG_CONFIG_HOME')==str(out/'config'):
    c=p.cpu_times();result[p.pid]={'name':p.name(),'cpu':c.user+c.system,'rss':p.memory_info().rss}
  except (psutil.Error,OSError):pass
 return result
start=snapshot();t=time.monotonic();time.sleep(15);end=snapshot();elapsed=time.monotonic()-t
assert start and end
result={'label':label,'display':'Xephyr nested X11 on actual i7-6700K Linux PC','cpuScope':'Native app and WebKit descendants; excludes nested X server','load':os.getloadavg(),'runs':runs,'burstLines':5000,'idleSeconds':elapsed,'idleCpuPercentOneCore':100*sum(max(0,p['cpu']-start.get(pid,p)['cpu']) for pid,p in end.items())/elapsed,'rssBytes':sum(p['rss'] for p in end.values()),'processes':end}
(out/'terminal-benchmark.json').write_text(json.dumps(result,indent=2));print(json.dumps({k:v for k,v in result.items() if k not in ['runs','processes']}))
