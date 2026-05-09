# App - Pairing And Connection

Read this for PC reachable/not reachable, Wi-Fi pairing, remembered desktops, token reconnect, desktop discovery, and the shared desktop folder picker.

## Folder Browser Modal

`src/screens/workspace/inline/FolderBrowserModal.tsx` is the shared component for picking a folder from the paired desktop. Generic interface: `{ visible, onClose, onSelect(folder), browseDesktopPath, label? }`. Two callers today:

- **AI Chat recovery** (`chunk9.tsx`): triggered when the user says "wrong folder"; on select it calls `onAcceptFolderProposal(proposalId, folder)`.
- **Projects page Browse PC button** (`chunk8.tsx`): only renders when `props.connected`; on select it calls `app.adoptProject(folder)` then `props.onOpenProjectPreview(folder.id, folder.name)` to navigate into the project — no chat round-trip required. This is the non-AI folder-pick path.

When adding a third caller, reuse this modal — do not inline a copy. The modal owns its own listing/search state and uses `app.browseDesktopPath` (passed in) to walk the desktop tree.

**Stability gotcha:** `app.browseDesktopPath` from `useDesktopFolders.ts` is *not* memoized — its reference changes every render. The modal must keep it in a `useRef` and the open-on-visible `useEffect` must depend only on `visible`, otherwise the effect re-fires on every parent render and you get an infinite request loop (a 405/401 from the desktop spams the console). Guard fetches with `try/catch` so transport errors surface as an in-modal error string instead of an unhandled rejection.

## Main Files

- `src/context/usePairingActions.ts`
- `src/context/pairingDiscovery.ts`
- `src/context/pairingScans.ts`
- `src/context/pairingHelpers.ts`
- `src/utils/network.ts`
- `src/utils/persistence.ts`
- `src/screens/onboarding/steps/ConnectStepTwo.tsx`

## Pairing Flow

`usePairingActions` scans Wi-Fi candidates for a desktop pair code, posts `/pair`, waits on `/pair/status`, stores `{ url, token, machineName }` as `connection`, then loads desktop projects and first project files after approval.

The app persists the desktop bearer token locally for fast reconnect, but `useCloudSync` strips that token before sending remembered desktops to the cloud API.

## Reachability Rules

Remembered desktop scan results can include offline/stale PCs for display, but only `online`/`current` entries count as reachable. Offline entries should not make onboarding look connected.

Desktop `/health` advertises `connectionUrls`. The app persists those alternates on `RememberedDesktop` and uses them as fallbacks for tap-to-pair and token reconnect. Merging health results must not wipe an existing remembered token when the health payload has no token.

## Cross-Boundary Notes

Connection bugs usually cross mobile and desktop. Also read `Vibyra Desktop Memory.md` when the fix may involve desktop routes, discovery, port binding, or `/health`.
