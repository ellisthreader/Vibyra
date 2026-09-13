# Vibyra Host preview

The standalone Host keeps terminal sessions on your computer while the phone
or web client observes them. This preview is separate from Vibyra Desktop:
existing Desktop chats are not synchronized into it.

Open **Vibyra Desktop → Settings → Phone companion (WIP)** for downloads
and a setup command using your project folder and private Wi-Fi address.
Download the Host binary for your OS from the
[Vibyra Host preview release](https://github.com/ellisthreader/Vibyra/releases/tag/v0.6.0-host-preview). On Linux,
make it executable with `chmod +x Vibyra-Host-0.6.0-preview-linux-x86_64`.
Run it with an explicit project folder and generate a short-lived invitation:

```sh
./Vibyra-Host-0.6.0-preview-linux-x86_64 --project /absolute/project/path --pair
```

On Windows use the `.exe` binary and a full Windows project path. Default
listening is loopback only. For a phone on your LAN, add
`--listen 0.0.0.0:4318 --public-url ws://YOUR_LAN_IP:4318` and allow that port
only on your trusted local network. Paste the invitation in the mobile client,
then approve the displayed device key in the Host console. `help` lists local
approval and device revocation commands. Never share a pairing invitation.

A paired device can operate your computer-user shell. Project file browsing is
restricted, but the shell is not a project sandbox. Pair only devices you own
and trust. Stop the Host with Ctrl+C; sessions persist across phone disconnects,
but a Host restart records interruption rather than replaying commands.

The web client is at https://vibyra.expo.app. HTTPS browsers require a reachable
secure WebSocket endpoint for remote connections. `--relay wss://YOUR_RELAY`
and `--relay-token-file /private/token-file` use a separately provisioned relay;
there is no public self-service relay registration in this preview. Native
phone distribution and physical-device acceptance remain pending.

Developers can build with `cargo +1.97.1 build --release --locked -p vibyra-host`
from `host/`. See `docs/protocol.md` and `../mobile/README.md` for the transport,
local pairing and mobile development workflow.
