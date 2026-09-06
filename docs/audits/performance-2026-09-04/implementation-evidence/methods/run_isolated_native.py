from pathlib import Path
import os,subprocess,json,time,signal,hashlib,shutil
out=Path(__file__).parent
evidence=Path('/home/ellis/Desktop/Vibyra/docs/audits/performance-2026-09-04/implementation-evidence')
base=os.environ.copy()
for key in list(base):
 if key.startswith(('VIBYRA_','APPIMAGE','APPDIR','TAURI_')):base.pop(key,None)
base|={'DBUS_SESSION_BUS_ADDRESS':'unix:path='+str(out/'absent-bus'),'VIBYRA_LATENCY_PROBE':'1','VIBYRA_PROBE_KEYS':'100','HTTPS_PROXY':'http://127.0.0.1:9','HTTP_PROXY':'http://127.0.0.1:9','ALL_PROXY':'http://127.0.0.1:9','NO_PROXY':'127.0.0.1,localhost'}
def children(pid):
 found={pid}
 for _ in range(8):
  previous=len(found)
  for d in Path('/proc').iterdir():
   if not d.name.isdigit() or int(d.name) in found:continue
   try:
    stat=(d/'stat').read_text().rsplit(')',1)[1].split()
    if int(stat[1]) in found:found.add(int(d.name))
   except (OSError,IndexError,ValueError):pass
  if len(found)==previous:break
 return found
results=[]
for kind,order in [('baseline','all-visible,focus-paced'),('bounded','all-visible,focus-paced'),('bounded','focus-paced,all-visible'),('baseline','focus-paced,all-visible')]:
 label=f'ab-{kind}-'+('forward' if order.startswith('all-visible') else 'reverse');profile=out/label
 for sub in ['config/vibyra-desktop','data','cache','workspace']:(profile/sub).mkdir(parents=True,exist_ok=True)
 (profile/'config/vibyra-desktop/settings.json').write_text(json.dumps({'defaultShell':'/bin/sh','workspaceRoot':str(profile/'workspace'),'rendererMode':'auto'}))
 env=base|{'XDG_CONFIG_HOME':str(profile/'config'),'XDG_DATA_HOME':str(profile/'data'),'XDG_CACHE_HOME':str(profile/'cache'),'VIBYRA_PROBE_PHASES':order}
 binary=out/('ab-'+kind);logpath=out/(label+'.log');start=time.monotonic();text=''
 with logpath.open('w') as log:
  process=subprocess.Popen([str(binary)],cwd=profile/'workspace',env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  try:
   while process.poll() is None and time.monotonic()-start<110:
    text=logpath.read_text(errors='replace')
    if 'PROBE-COMPLETE' in text or 'PROBE-FAILED' in text:break
    time.sleep(.25)
   phases=[json.loads(line.split('[probe] ',1)[1]) for line in text.splitlines() if '[probe] {' in line]
   row={'kind':kind,'order':order,'complete':'PROBE-COMPLETE' in text,'seconds':time.monotonic()-start,'hostLoadAtEnd':os.getloadavg(),'binarySha256':hashlib.sha256(binary.read_bytes()).hexdigest(),'phases':phases}
   results.append(row);print(json.dumps(row),flush=True)
  finally:
   owned=children(process.pid)
   for pid in sorted(owned,reverse=True):
    try:os.kill(pid,signal.SIGTERM)
    except ProcessLookupError:pass
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:process.kill();process.wait()
 report={'kind':'Frozen native source and identical minified frontend; only writer.rs differs; debug native, real WebKitGTK, auto graphics; 100 markers per phase; no continuous process sampling','results':results}
 (out/'native-controlled-comparison.json').write_text(json.dumps(report,indent=2))
 shutil.copy2(out/'native-controlled-comparison.json',evidence/'native-controlled-comparison.json')
 shutil.copy2(logpath,evidence/logpath.name)
 assert row['complete'] and len(phases)==2
 assert all(phase['dropped']==0 for phase in phases)
