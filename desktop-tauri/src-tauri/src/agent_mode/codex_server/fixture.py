#!/usr/bin/python3
import json
import os
import sys


def send(value):
    print(json.dumps(value), flush=True)


for line in sys.stdin:
    request = json.loads(line)
    method = request.get('method')
    if 'id' not in request:
        continue
    params = request.get('params', {})
    result = {}
    if method == 'config/read':
        result = {'config': {}}
    if method in ['thread/start', 'thread/resume']:
        assert params['config']['model_reasoning_effort'] == 'low'
        assert params['config']['approval_policy'] != 'untrusted', 'Codex 0.153.4 rejects the retired config setting'
        assert params['approvalPolicy'] == 'untrusted', 'The structured approval boundary must remain explicit'
        profile = ':workspace' if os.environ.get('FIXTURE_WRONG_PROFILE') else params['permissions']
        result = {'thread': {'id': 'thread-1'}, 'activePermissionProfile': {'id': profile}, 'approvalPolicy': 'untrusted'}
    if method == 'turn/start':
        assert params['effort'] == 'low'
        assert params['approvalPolicy'] == 'untrusted'
        assert 'permissions' not in params, 'Inherit the verified thread profile; re-selection discards inline definitions'
        # A notification may race the reply. It must survive request().
        send({'method': 'item/completed', 'params': {'threadId': 'thread-1', 'turnId': 'turn-1', 'item': {'id': 'answer-1', 'type': 'agentMessage', 'text': 'Fixture task complete.'}}})
        result = {'turn': {'id': 'turn-1'}}
    send({'id': request['id'], 'result': result})
    if method == 'turn/start':
        send({'method': 'thread/tokenUsage/updated', 'params': {'threadId': 'thread-1', 'tokenUsage': {'last': {'inputTokens': 12, 'outputTokens': 6}}}})
        send({'method': 'turn/completed', 'params': {'threadId': 'thread-1', 'turn': {'id': 'turn-1', 'status': 'completed'}}})
