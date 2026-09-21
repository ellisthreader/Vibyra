"""Dedicated simulator only. Disable Expo Fast Refresh and its floating Tools button
before this check; reload the fixture with a newly issued invitation after a cold
restart. The final native acceptance was also performed through CUA AX controls.
"""
import json,subprocess,time
u='0772D2B8-CEFD-4DAF-A28E-7A9A124C3461'
i='/Users/ellis/Library/Python/3.9/bin/idb'
def ax(): return json.loads(subprocess.check_output([i,'ui','describe-all','--udid',u,'--json']))
def tap(label):
 for _ in range(80):
  es=ax(); e=next((e for e in es if (e.get('AXLabel') or '').startswith(label)),None)
  if e: break
  time.sleep(.15)
 assert e, 'Missing accessible control: '+label
 f=e['frame'];subprocess.run([i,'ui','tap',str(round(f['x']+f['width']/2)),str(round(f['y']+f['height']/2)),'--udid',u],check=True,capture_output=True)
def snap(name): subprocess.run(['xcrun','simctl','io',u,'screenshot','/tmp/vibyra-redesign-native-'+name+'.png'],check=True,capture_output=True)
for theme in ['dark','light']:
 subprocess.run(['xcrun','simctl','ui',u,'appearance',theme],check=True,capture_output=True)
 time.sleep(.7);snap(theme)
 for command in ['usage','model','effort','status']:
  print(theme,command,flush=True)
  tap('Open commands');time.sleep(.7)
  tap('/'+command);time.sleep(1.2)
  es=ax();assert any((e.get('AXLabel') or '').startswith('Close') for e in es)
  assert not any('Loading' in (e.get('AXLabel') or '') for e in es)
  snap(theme+'-'+command)
  tap('Close');time.sleep(.6)
print('PASS native dark/light commands: usage, model, effort, status with accessible controls')
