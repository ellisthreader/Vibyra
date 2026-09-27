"""Tap both approval routes in the dedicated native iOS fixture."""
import json
import os
import subprocess
import time

UDID = os.environ.get('VIBYRA_TEST_UDID', '0772D2B8-CEFD-4DAF-A28E-7A9A124C3461')
IDB = os.environ.get('VIBYRA_IDB', '/Users/ellis/Library/Python/3.9/bin/idb')
assert UDID not in ('CE6F7E36-B33A-4301-AFA4-5E7107F65AF6',
                    '258E794C-4AA5-4FA8-AE7D-8ACB070786D5')

def elements():
    return json.loads(subprocess.check_output([IDB, 'ui', 'describe-all', '--udid', UDID, '--json']))

def find(label):
    for element in elements():
        if element.get('AXLabel') == label:
            return element
    raise AssertionError(f'Missing native element: {label}')

def tap(label):
    frame = find(label)['frame']
    x = round(frame['x'] + frame['width'] / 2)
    y = round(frame['y'] + frame['height'] / 2)
    subprocess.run([IDB, 'ui', 'tap', str(x), str(y), '--udid', UDID], check=True, capture_output=True)

def selected(value):
    label = f'Selected approval: {value}'
    for _ in range(30):
        if any(item.get('AXLabel') == label for item in elements()):
            return
        time.sleep(.1)
    raise AssertionError(f'Expected native approval result: {label}')

def shot(name):
    subprocess.run(['xcrun', 'simctl', 'io', UDID, 'screenshot', f'/tmp/{name}.png'],
                   check=True, capture_output=True)

find('Environment: local\nReason: Let your iPhone open the website?\n$ HKE_ALLOW_LAN=1 npm run start:website')
shot('vibyra-native-terminal-approval')
for label, key in [('Yes, proceed (y)', 'y'),
                   ("Yes, and don't ask again for this command (p)", 'p'),
                   ('No, and tell Codex what to do differently (esc)', '\x1b')]:
    tap(label)
    selected(json.dumps(key))
    tap('Reset approval')
    selected('none')

tap('Shared chat approval')
find('Codex needs approval')
find('Remembering skips future approval for this prefix:')
find('HKE_ALLOW_LAN=1 npm run start:website')
selected('none')
shot('vibyra-native-shared-approval')
for label, decision in [('Allow once', 'accept'),
                        ('Allow and remember', 'acceptWithExecpolicyAmendment'),
                        ('Decline', 'decline')]:
    tap(label)
    selected(decision)
    tap('Reset approval')
    selected('none')

print('PASS native iOS approval: terminal y/p/Esc and structured Allow once/remember/Decline')
