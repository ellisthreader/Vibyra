# Vibyra 0.4.4 performance release

Candidate based on 287bfa0 (live signed 0.4.3 source 4abe896), preserving Agent
and Chat functionality absent from the original 0.2.8 audit checkout.

Includes coalesced mobile persistence, guarded cloud deltas, bounded native
input and watcher work, dictation cleanup, recovered PNG assets and the
Nginx/PHP-FPM production launcher. No database migration is introduced.

The older watcher registration reduction is already present in live 0.4.3;
it is excluded from incremental performance claims. No whole-app percentage
or physical-phone improvement is established by synthetic benchmarks.

Deployment and device verification are pending completion of release gates.
