# Code X iOS

Code X is a mobile command center for AI coding workflows running on a user's own machine.

## Run locally

Open **Code X Desktop** first:

- Double-click the **Code X Desktop** shortcut on your Desktop, or double-click `Code X Desktop` in this folder.
- The desktop app shows a large pairing code.
- Leave the desktop app open.

Then start the iOS app:

```bash
npm install
npm start
```

Open the Expo URL with the Expo Go iOS app, or run a native iOS build from macOS with Xcode/EAS.

On the Code X pairing screen, enter only the code shown in Code X Desktop. The desktop app asks for permission, then the phone asks for permission. After both approve, the phone can list local projects, start a preview session, send prompts to the desktop workflow, receive applied diff metadata, run the safe command set, and show live updates.
