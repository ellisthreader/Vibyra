import os,pathlib,subprocess,json,time,signal
out=pathlib.Path(__file__).parent
label='native-probe-counterbalanced'
profile=out/'native-profile'
for child in ['config/vibyra-desktop','data','cache','workspace']:(profile/child).mkdir(parents=True,exist_ok=True)
(profile/'config/vibyra-desktop/settings.json').write_text(json.dumps({'defaultShell':'/bin/sh','workspaceRoot':str(profile/'workspace'),'rendererMode':'auto'}))
env=os.environ.copy()
for key in list(env):
 if key.startswith(('VIBYRA_','APPIMAGE','APPDIR','TAURI_')):env.pop(key,None)
env.update({'XDG_CONFIG_HOME':str(profile/'config'),'XDG_DATA_HOME':str(profile/'data'),'XDG_CACHE_HOME':str(profile/'cache'),'DBUS_SESSION_BUS_ADDRESS':'unix:path='+str(profile/'absent-bus'),'VIBYRA_LATENCY_PROBE':'1','VIBYRA_PROBE_KEYS':'40','VIBYRA_PROBE_PHASES':'focus-paced,all-visible','HTTPS_PROXY':'http://127.0.0.1:9','HTTP_PROXY':'http://127.0.0.1:9','ALL_PROXY':'http://127.0.0.1:9','NO_PROXY':'127.0.0.1,localhost'})
binary=str(out/'vibyra-probe')
logpath=out/(label+'.log')
samples=[];started=time.time();captured=False
def children(pid):
 found={pid};again=True
 while again:
  again=False
  for d in pathlib.Path('/proc').iterdir():
   if not d.name.isdigit() or int(d.name) in found:continue
   try:
    parts=(d/'stat').read_text().rsplit(')',1)[1].split()
    if int(parts[1]) in found:found.add(int(d.name));again=True
   except (OSError,IndexError,ValueError):pass
 return found
with logpath.open('w') as log:
 p=subprocess.Popen([binary],env=env,cwd=profile/'workspace',stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 try:
  while p.poll() is None and time.time()-started<100:
   sample={'elapsed':time.time()-started,'processes':[]}
   for pid in children(p.pid):
    try:
     d=pathlib.Path('/proc')/str(pid);stat=(d/'stat').read_text().rsplit(')',1)[1].split();
     sample['processes'].append({'pid':pid,'name':(d/'comm').read_text().strip(),'cpuTicks':int(stat[11])+int(stat[12]),'rssBytes':int(stat[21])*os.sysconf('SC_PAGE_SIZE')})
    except (OSError,IndexError,ValueError):pass
   samples.append(sample)
   text=logpath.read_text(errors='replace')
   phases=[line.split('PHASE ',1)[1] for line in text.splitlines() if '[probe] PHASE ' in line]
   sample['phase']=phases[-1] if phases else 'startup'
   if 'PROBE-COMPLETE' in text or 'PROBE-FAILED' in text:break
   time.sleep(1)
  result={'elapsedSeconds':time.time()-started,'exitBeforeCleanup':p.poll(),'complete':'PROBE-COMPLETE' in logpath.read_text(errors='replace'),'clockTicksPerSecond':os.sysconf('SC_CLK_TCK'),'samples':samples,'kind':'Minified production frontend, debug native binary, isolated XDG and unavailable keyring, auto graphics'}
 finally:
  # Only terminate the diagnostic process tree created by this script.
  owned=children(p.pid)
  for pid in sorted(owned,reverse=True):
   try:os.kill(pid,signal.SIGTERM)
   except ProcessLookupError:pass
  try:p.wait(timeout=5)
  except subprocess.TimeoutExpired:p.kill();p.wait()
(out/(label+'.json')).write_text(json.dumps(result,indent=2));print({k:v for k,v in result.items() if k!='samples'});print('\n'.join(x for x in logpath.read_text(errors='replace').splitlines() if '[probe]' in x))
