# Vibyra

Vibyra is a mobile command center for AI software workflows running on a user's own machine.

## Run locally

Open **Vibyra Desktop** first:

- Double-click the **Vibyra Desktop** shortcut on your Desktop, or double-click `Vibyra Desktop` in this folder.
- The desktop app shows a large pairing code.
- Leave the desktop app open.

Then start the iOS app:

```bash
npm install
npm start
```

Open the Expo URL with the Expo Go iOS app, or run a native iOS build from macOS with Xcode/EAS.

On the Vibyra pairing screen, enter only the code shown in Vibyra Desktop. The desktop app asks for permission, then the phone asks for permission. After both approve, the phone can list local projects, start a preview session, send prompts to the desktop workflow, receive applied diff metadata, run the safe command set, and show live updates.
