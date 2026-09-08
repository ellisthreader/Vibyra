from pathlib import Path
import time,json,sys,os,threading
out=Path(__file__).parent/'device'/sys.argv[1];out.mkdir(exist_ok=True)
f=(out/'terminal-events.jsonl').open('w',buffering=1)
def record(kind,**data): f.write(json.dumps(dict(kind=kind,monotonic=time.monotonic(),**data))+'\n')
record('ready');print('FIXTURE_READY',flush=True)
for line in sys.stdin:
 value=line.rstrip('\n');record('input',text=value);print('RECEIVED '+str(len(value)),flush=True)
 if value=='BURST':
  for n in range(5000):print('OUTPUT '+str(n)+' '+'.'*120)
  print('BURST_DONE',flush=True);record('burst-done')
 if value=='EXIT':break
record('finished')
