// Fixed locations for the cloud-computer mode. Every one can be overridden in tests.
export const PATHS = {
  run: '/run/vibyra', socket: '/run/vibyra/git.sock', tokenFile: '/run/vibyra/runtime-token',
  home: '/data/home', hostState: '/data/host', projects: '/data/projects',
  hostBin: '/usr/local/bin/vibyra-host', gitconfig: '/etc/gitconfig',
  helper: '/opt/vibyra/bin/git-credential-vibyra', hooks: '/opt/vibyra/hooks',
  // Cloud sync (docs/cloud-sync-contract.md): VM key + state, bare shadow repos, scratch space. All uid-1001 directories directly under /data.
  syncDir: '/data/.vibyra-sync', shadow: '/data/.vibyra-shadow', syncTmp: '/data/.vibyra-tmp',
};
export const PROJECT_UID = 1001;
export const PROJECT_GID = 1001;
export const ACTIVITY_SECONDS = 15;
