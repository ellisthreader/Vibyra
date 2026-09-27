import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { demoAccount } from '../src/demo/data';
import { useDemoWorkspace } from '../src/demo/useDemoWorkspace';
import type { Account } from '../src/ui/types';

// The sample workspace holds no react-native imports, so it renders here exactly as the phone builds it.
function sample(account: Account | null, exitDemo = () => {}) {
  let workspace: ReturnType<typeof useDemoWorkspace> | undefined;
  renderToStaticMarkup(createElement(function Probe() {
    workspace = useDemoWorkspace({ account, themePreference: 'system', setTheme: () => {}, exitDemo });
    return null;
  }));
  return workspace!;
}
test('the test button signs in to a demo account that never reaches the network or storage', async () => {
  assert.match(demoAccount.email, /^demo@/);
  const signedIn = sample(demoAccount);
  assert.equal(signedIn.demo, true);
  assert.deepEqual(signedIn.account, demoAccount);
  // Only the sample transport is offered: the demo account can neither pair a computer nor call the backend.
  assert.equal(signedIn.actions.signUp, undefined);
  assert.equal(signedIn.actions.logIn, undefined);
  assert.equal(signedIn.actions.providerLogIn, undefined);
  await assert.rejects(signedIn.actions.connect('vibyra://pair'), /Leave the demo/);
});
test('logging out of the demo account leaves the sample workspace, and opening it from Settings stays signed out', async () => {
  let left = 0;
  const signedIn = sample(demoAccount, () => { left++; });
  await signedIn.actions.logOut!();
  assert.equal(left, 1, 'logging out returns to the real workspace');
  const anonymous = sample(null);
  assert.equal(anonymous.account, null);
  assert.equal(anonymous.actions.logOut, undefined, 'the sample workspace alone offers no account to log out of');
});
