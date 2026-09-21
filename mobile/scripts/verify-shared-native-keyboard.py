"""Run after serve-shared-chat-native.mjs on the dedicated test simulator."""
import json
import os
import subprocess
import time
import urllib.request

UDID = os.environ.get('VIBYRA_TEST_UDID', '53D994E2-A8F9-408C-BAB8-725EA9BB897A')
assert UDID not in ['CE6F7E36-B33A-4301-AFA4-5E7107F65AF6', '258E794C-4AA5-4FA8-AE7D-8ACB070786D5']
IDB = os.environ.get('VIBYRA_IDB', '/Users/ellis/Library/Python/3.9/bin/idb')
def describe():
    return json.loads(subprocess.check_output([IDB, 'ui', 'describe-all', '--udid', UDID, '--json']))
def tap(element):
    f = element['frame']
    subprocess.run([IDB, 'ui', 'tap', str(round(f['x']+f['width']/2)), str(round(f['y']+f['height']/2)), '--udid', UDID], check=True, capture_output=True)
def screenshot(name):
    subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', '/tmp/'+name], check=True, capture_output=True)
items = describe()
field = next(e for e in items if e.get('type') == 'TextArea')
assert not field.get('AXValue'), 'Start with an empty fixture draft'
tap(field)
for _ in range(30):
    items = describe()
    if any(e.get('AXLabel') == 'q' for e in items): break
    time.sleep(.1)
keys = {e.get('AXLabel'): e for e in items if e.get('type') == 'Button'}
assert 'q' in keys, 'Apple software keyboard must appear after tapping the native composer'
space = next(k for k in keys if k.strip() == '')
for char in 'say hello': tap(keys[space if char == ' ' else char])
items = describe()
field = next(e for e in items if e.get('type') == 'TextArea')
assert field['AXValue'] == 'say hello'
send = next(e for e in items if e.get('AXLabel') == 'Send prompt and Enter')
assert send['frame']['y']+send['frame']['height'] < keys['q']['frame']['y']-20, 'Send must sit above the keyboard'
screenshot('vibyra-shared-native-typed.png')
tap(send)
for _ in range(90):
    with urllib.request.urlopen('http://127.0.0.1:8094/desktop') as response: state=json.load(response)
    if state['turnState'] == 'completed': break
    time.sleep(1)
assert state['turnState'] == 'completed'
assert sum(i.get('role') == 'user' and i.get('text') == 'say hello' for i in state['items']) == 1
assert any(i.get('role') == 'assistant' and 'hello' in i.get('text', '').lower() for i in state['items'])
with open('/tmp/vibyra-shared-native-delivery.json', 'w') as out: json.dump(state, out, indent=2)
screenshot('vibyra-shared-native-completed.png')
print('PASS native software keyboard taps -> native composer -> encrypted Desktop backend -> real Codex reply; composer and Send remain above the keyboard')
