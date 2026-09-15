import test from 'node:test';
import assert from 'node:assert/strict';
import { buildScaffoldRequest, describeSteps } from '../src/scaffold/command';
import { abbreviateHome, pascalCase, resolveDestination, slugify, suggestedName } from '../src/scaffold/destination';
import { kindForTemplate, stepAfterKind, stepAfterStack } from '../src/scaffold/flow';
import { PROJECT_KINDS } from '../src/scaffold/kinds';
import { plannedProject } from '../src/scaffold/planned';
import { searchTemplates } from '../src/scaffold/search';
import { additionsFor, allRequiredTools, canLayer, hasInstallStep, missingTools, PROJECT_TEMPLATES, templateById, templatesForKind } from '../src/scaffold/templates';
import { DEFAULT_TEMPLATE_OPTIONS } from '../src/scaffold/types';
import { initialWizard, wizardReducer, type WizardState } from '../src/scaffold/wizard';

test('the catalog is the desktop one: unique ids, a stack for every kind, the folder last', () => {
  const ids = PROJECT_TEMPLATES.map(entry => entry.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const kind of PROJECT_KINDS) assert.ok(templatesForKind(kind.id).length > 0, `${kind.id} has a stack`);
  assert.equal(PROJECT_KINDS.at(-1)?.id, 'empty');
  assert.deepEqual(templatesForKind('website').map(entry => entry.id), ['next', 'vite-react', 'vite-vue', 'astro', 'sveltekit', 'angular', 'plain-html', 'threejs']);
  assert.deepEqual(allRequiredTools().sort(), ['cargo', 'composer', 'flutter', 'go', 'node', 'npm', 'npx', 'python3', 'rails']);
  for (const entry of PROJECT_TEMPLATES) {
    for (const step of entry.steps) assert.ok(step.program && step.label, `${entry.id} steps are named`);
    for (const seed of entry.seeds) assert.ok(!seed.path.startsWith('/') && !seed.path.includes('..'), `${entry.id} seeds stay inside`);
  }
});

test('a pick becomes the exact commands the computer runs, and dependencies can be left off', () => {
  const next = buildScaffoldRequest(templateById('next')!, '/home/ellis/Projects/my-site', DEFAULT_TEMPLATE_OPTIONS);
  assert.equal(next.createDir, false, 'create-next-app makes its own folder');
  assert.equal(next.steps[0].cwd, '/home/ellis/Projects');
  assert.equal(next.steps[1].cwd, '/home/ellis/Projects/my-site');
  assert.equal(describeSteps(next)[0], 'npx --yes create-next-app@latest my-site --ts --app --eslint --tailwind --src-dir --import-alias @/* --use-npm --skip-install');
  assert.equal(describeSteps(next)[1], 'npm install');
  const bare = buildScaffoldRequest(templateById('next')!, '/home/ellis/Projects/my-site', { ...DEFAULT_TEMPLATE_OPTIONS, install: false, git: false });
  assert.deepEqual(bare.steps.map(step => step.label), ['Creating the Next.js app']);
  assert.equal(bare.gitInit, false);
  const native = buildScaffoldRequest(templateById('react-native')!, '/p/pocket-app', DEFAULT_TEMPLATE_OPTIONS);
  assert.ok(native.steps[0].args.includes('PocketApp'), 'React Native gets an identifier');
  const html = buildScaffoldRequest(templateById('plain-html')!, '/p/my-site', DEFAULT_TEMPLATE_OPTIONS);
  assert.equal(html.createDir, true);
  assert.equal(html.steps.length, 0);
  assert.match(html.seeds[0].body, /<title>my-site<\/title>/);
  assert.equal(describeSteps(buildScaffoldRequest(templateById('fastapi')!, '/p/api', DEFAULT_TEMPLATE_OPTIONS))[1],
    '{{venv}}/pip install fastapi uvicorn[standard]');
  assert.equal(hasInstallStep(templateById('express')!), true);
  assert.equal(hasInstallStep(templateById('laravel')!), false);
  assert.deepEqual(missingTools(templateById('tauri')!, { node: true, npm: true, cargo: false }), ['cargo']);
  assert.deepEqual(missingTools(templateById('tauri')!, {}), [], 'an unanswered preflight blocks nothing');
});

test('where a project lands is worked out from the name, and shown the way a prompt shows it', () => {
  assert.equal(slugify('  My Cool_App!! '), 'my-cool-app');
  assert.equal(slugify('Ünïcode Ñame'), 'unicode-name');
  assert.equal(pascalCase('3d viewer'), 'App3dViewer');
  assert.deepEqual(resolveDestination('~/Projects', 'My App', '/home/ellis'), { slug: 'my-app', path: '/home/ellis/Projects/my-app', error: null });
  assert.equal(resolveDestination('Projects', 'x', '/home/ellis').error, 'Choose a folder to put the project in.');
  assert.equal(resolveDestination('/p', '   ', '/home/ellis').error, 'Give the project a name.');
  assert.equal(resolveDestination('/p', '!!!', '/home/ellis').error, 'Use letters or numbers in the name.');
  assert.equal(resolveDestination('C:/Code', 'App', '').path, 'C:/Code/app');
  assert.equal(suggestedName(['/p/untitled', '/p/untitled-2'], '/p'), 'untitled-3');
  assert.equal(suggestedName(['/elsewhere/untitled'], '/p'), 'untitled');
  assert.equal(abbreviateHome('/home/ellis/Projects/x', '/home/ellis'), '~/Projects/x');
  assert.equal(abbreviateHome('/srv/x', '/home/ellis'), '/srv/x');
});

test('search reaches every stack by name, keyword or kind', () => {
  assert.equal(searchTemplates('godot')[0].id, 'godot');
  assert.deepEqual(searchTemplates('phone').map(entry => entry.id).sort(), ['expo', 'flutter', 'react-native']);
  assert.ok(searchTemplates('api').some(entry => entry.id === 'axum'));
  assert.equal(searchTemplates('react')[0].id, 'vite-react', 'a name prefix outranks a keyword');
  assert.deepEqual(searchTemplates('zzz-nothing'), []);
  assert.equal(searchTemplates('   ').length, PROJECT_TEMPLATES.length);
});

test('a skipped question never asks a follow-up, and every path reaches a folder', () => {
  assert.equal(stepAfterKind(null), 'where');
  assert.equal(stepAfterKind('empty'), 'where');
  assert.equal(stepAfterKind('game'), 'stack');
  assert.equal(stepAfterStack(null), 'where');
  assert.equal(stepAfterStack('plain-html'), 'where', 'nothing to set up when nothing runs');
  assert.equal(stepAfterStack('next'), 'options');
  assert.equal(kindForTemplate('game', 'next'), 'website', 'Making: Game / With: Next.js is never printed');
  assert.equal(kindForTemplate('webapp', 'next'), 'webapp');
  assert.equal(kindForTemplate('game', null), 'game');
});

test('the wizard walks the questions, remembers the way back, and plans the build', () => {
  let state: WizardState = initialWizard('run-1');
  state = wizardReducer(state, { type: 'preflight', tools: { node: true }, home: '/home/ellis', parent: '/home/ellis/Code', projectPaths: ['/home/ellis/Code/untitled'] });
  assert.equal(state.name, 'untitled-2');
  state = wizardReducer(state, { type: 'chooseKind', kind: 'website' });
  assert.equal(state.step, 'stack');
  state = wizardReducer(state, { type: 'chooseTemplate', templateId: 'next' });
  // Picking a stack no longer leaves the step: more than one can be chosen here.
  assert.equal(state.step, 'stack');
  state = wizardReducer(state, { type: 'continue' });
  assert.equal(state.step, 'options');
  state = wizardReducer(state, { type: 'setOptions', patch: { install: false } });
  state = wizardReducer(state, { type: 'go', step: 'where' });
  state = wizardReducer(state, { type: 'setName', name: 'Site' });
  state = wizardReducer(state, { type: 'go', step: 'review' });
  const planned = plannedProject(state);
  assert.equal(planned.destination.path, '/home/ellis/Code/site');
  assert.deepEqual(planned.commands, ['npx --yes create-next-app@latest site --ts --app --eslint --tailwind --src-dir --import-alias @/* --use-npm --skip-install']);
  state = wizardReducer(state, { type: 'back' });
  assert.equal(state.step, 'where');
  state = wizardReducer(state, { type: 'back' });
  assert.equal(state.step, 'options');
  state = wizardReducer(state, { type: 'log', lines: ['a', 'b'] });
  state = wizardReducer(state, { type: 'run', patch: { phase: 'failed', error: 'no' } });
  state = wizardReducer(state, { type: 'restart' });
  assert.deepEqual([state.phase, state.log, state.error], ['idle', [], null]);
  const skipped = wizardReducer(initialWizard('run-2'), { type: 'chooseKind', kind: null });
  assert.equal(skipped.step, 'where');
  assert.equal(plannedProject({ ...skipped, home: '/h', parent: '/h/p' }).entry.id, 'empty');
  assert.equal(wizardReducer(state, { type: 'reset', runId: 'run-3' }).runId, 'run-3');
});

test('one stack owns the folder, and the rest are layered inside it', () => {
  // Only one scaffolder can own a new folder, so the additions offered are the
  // ones whose work happens inside a folder that already exists.
  assert.equal(canLayer(templateById('next')!), false, 'create-next-app makes the folder');
  assert.equal(canLayer(templateById('express')!), true, 'an Express server goes into one');
  assert.equal(additionsFor('website', null).some(entry => entry.id === 'next'), false,
    'a stack that owns the folder is never offered as an addition');
  assert.ok(additionsFor('website', null).some(entry => entry.id === 'express'),
    'a server is worth adding to a website');
  assert.equal(additionsFor('backend', null).some(entry => entry.id === 'express'), false,
    'the question is not asked twice: a backend stack is not an addition to a backend');

  let state: WizardState = initialWizard('run-4');
  state = wizardReducer(state, { type: 'preflight', tools: { node: true }, home: '/h', parent: '/h/Code', projectPaths: [] });
  state = wizardReducer(state, { type: 'chooseKind', kind: 'website' });
  state = wizardReducer(state, { type: 'chooseTemplate', templateId: 'next' });
  state = wizardReducer(state, { type: 'toggleExtra', templateId: 'express' });
  state = wizardReducer(state, { type: 'setName', name: 'Shop' });
  const planned = plannedProject(state);
  assert.deepEqual(planned.extras.map(entry => entry.id), ['express']);
  // The base runs first and makes the folder; the addition follows it inside.
  assert.ok(planned.commands[0]!.includes('create-next-app'), 'the base scaffolds first');
  assert.ok(planned.commands.length > 1, 'the addition contributes its own work');
  assert.equal(planned.request.dir, '/h/Code/shop');

  // Toggling it off takes it back out of the plan.
  state = wizardReducer(state, { type: 'toggleExtra', templateId: 'express' });
  assert.deepEqual(plannedProject(state).extras, []);
  // Swapping the base keeps what was added on top of it.
  state = wizardReducer(state, { type: 'toggleExtra', templateId: 'express' });
  state = wizardReducer(state, { type: 'chooseTemplate', templateId: 'astro' });
  assert.equal(state.templateId, 'astro');
  assert.deepEqual(state.extraIds, ['express'], 'an addition survives changing the stack under it');
});
