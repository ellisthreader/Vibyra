import type { Approval, Project, Session, WorkspaceModel } from '../ui/types';

export interface DemoMessage { id: string; role: 'user' | 'assistant'; text: string; result?: boolean }
export interface DemoWorkspace extends WorkspaceModel { demo: true; messages: DemoMessage[] }
export const isDemoWorkspace = (value: WorkspaceModel): value is DemoWorkspace => value.demo === true;
export const projects: Project[] = [
  { id: 'demo-studio', name: 'Studio', path: '~/Projects/studio', branch: 'feat/checkout' },
  { id: 'demo-orbit', name: 'Orbit', path: '~/Projects/orbit', branch: 'main' },
];
export const sessions: Session[] = [
  { id: 'demo-checkout', projectId: 'demo-studio', title: 'A calmer checkout', kind: 'claude', status: 'exited', exitCode: 0, createdAt: '2026-09-06T10:30:00Z' },
  { id: 'demo-shortcuts', projectId: 'demo-orbit', title: 'Add keyboard shortcuts', kind: 'codex', status: 'running', createdAt: '2026-09-06T09:30:00Z' },
  { id: 'demo-terminal', projectId: 'demo-studio', title: 'Development server', kind: 'shell', status: 'running', createdAt: '2026-09-06T09:00:00Z' },
  { id: 'demo-empty', projectId: 'demo-studio', title: 'Polish the empty states', kind: 'claude', status: 'exited', exitCode: 0, createdAt: '2026-09-05T15:00:00Z' },
];
export const approvals: Approval[] = [{ id: 'demo-checks', title: 'Run project checks',
  detail: 'Orbit · Add keyboard shortcuts\n\nnpm run check\n\nRuns the project’s lint and type checks in ~/Projects/orbit. Approval applies to this command once. No publishing or deployment is requested.' }];
export const conversations: Record<string, DemoMessage[]> = {
  'demo-checkout': [
    { id: 'a1', role: 'user', text: 'Make the checkout feel simpler. Give the order summary a little more breathing room.' },
    { id: 'a2', role: 'assistant', text: 'The checkout now gives each decision its own space. I simplified the form, made the order summary easier to scan, and kept the next step clear.', result: true },
  ],
  'demo-shortcuts': [
    { id: 'b1', role: 'user', text: 'Add keyboard shortcuts for search and creating a new project.' },
    { id: 'b2', role: 'assistant', text: 'The shortcuts are in place: ⌘K for search and ⌘N for a new project. Ready to run the project checks.' },
  ],
  'demo-empty': [
    { id: 'c1', role: 'user', text: 'Make the empty states clearer and more welcoming.' },
    { id: 'c2', role: 'assistant', text: 'Each empty state now explains what belongs here and offers one useful next step.', result: true },
  ],
};
export const demoDiff = `diff --git a/src/checkout.tsx b/src/checkout.tsx
--- a/src/checkout.tsx
+++ b/src/checkout.tsx
@@ -12,7 +12,9 @@ export function Checkout() {
   return (
-    <main className="checkout compact">
-      <h1>Complete your purchase</h1>
+    <main className="checkout spacious">
+      <p className="eyebrow">One last thing</p>
+      <h1>Make it yours.</h1>
       <CheckoutForm />
-      <OrderSummary dense />
+      <OrderSummary />
+      <SecureCheckoutNote />
     </main>
   );
`;
export const demoFile = `// Example project file — demo content only.
export function Checkout() {
  return (
    <main className="checkout spacious">
      <p className="eyebrow">One last thing</p>
      <h1>Make it yours.</h1>
      <CheckoutForm />
      <OrderSummary />
      <SecureCheckoutNote />
    </main>
  );
}
`;
