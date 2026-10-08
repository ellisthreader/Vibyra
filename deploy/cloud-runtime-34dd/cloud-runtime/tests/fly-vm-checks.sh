#!/bin/sh
# Runs INSIDE a real Fly Machine (root) built from cloud-runtime/Dockerfile. Driven by scripts/fly-cloud-computer-image-test.sh.
# Usage: fly-vm-checks.sh image | net | node | resources.   Prints "PASS|FAIL <id> <detail>" lines; never prints secrets.
set -u
as1001() { setpriv --reuid 1001 --regid 1001 --init-groups env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/data/home "$@"; }
res() { echo "$1 $2 ${3:-}"; }
phase_image() {
  vibyra-host --help >/dev/null 2>&1 && res PASS image.host "$(vibyra-host --help 2>&1 | head -1)" || res FAIL image.host "vibyra-host --help failed"
  for t in "claude --version" "codex --version" "gh --version" "git --version" "node --version"; do
    out=$($t 2>&1 | head -1); [ -n "$out" ] && res PASS "image.${t%% *}" "$out" || res FAIL "image.${t%% *}" "no output"; done
  [ -x /opt/vibyra/bin/git-credential-vibyra ] && res PASS image.helper "$(stat -c '%U:%G %a' /opt/vibyra/bin/git-credential-vibyra)" || res FAIL image.helper missing
  [ -x /opt/vibyra/hooks/pre-push ] && res PASS image.hook "$(stat -c '%U:%G %a' /opt/vibyra/hooks/pre-push)" || res FAIL image.hook missing
  res INFO image.gitconfig "$(stat -c '%U:%G %a' /etc/gitconfig) helper=$(git config --system credential.helper) hooksPath=$(git config --system core.hooksPath)"
  [ "$(stat -c %u /etc/gitconfig)" = 0 ] && [ -z "$(find /opt/vibyra /etc/gitconfig -perm /022 2>/dev/null | head -1)" ] && res PASS image.rootowned "/opt/vibyra and /etc/gitconfig root-owned, not group/other writable" || res FAIL image.rootowned "writable paths: $(find /opt/vibyra /etc/gitconfig -perm /022 | head -3)"
  res INFO image.user "$(id project)"; res INFO image.tools "nft=$(nft --version) setpriv=$(command -v setpriv) prlimit=$(command -v prlimit) python3=$(python3 --version 2>&1)"
  as1001 git --version >/dev/null && res PASS image.git1001 "git runs as uid 1001"
}
phase_net() {
  # The real rule text from entrypoint.sh (everything before the final exec line), so the shipped rules are what runs here.
  sed '$d' /opt/vibyra/entrypoint.sh > /tmp/entry-rules.sh
  sh /tmp/entry-rules.sh && res PASS net.rules_load "entrypoint.sh rules and tmpfs step ran" || { res FAIL net.rules_load "entrypoint rules failed"; return; }
  nft list ruleset | grep -c "skuid" | xargs -I{} echo "INFO net.rules {} skuid rules"
  mount | grep -q ' /run/vibyra type tmpfs' && res PASS net.tmpfs "/run/vibyra is tmpfs ($(findmnt -no OPTIONS /run/vibyra))" || res FAIL net.tmpfs "/run/vibyra not tmpfs"
  code=$(as1001 curl -sS -m 10 -o /dev/null -w '%{http_code}' https://example.com 2>&1); case "$code" in 2*|3*) res PASS net.uid1001_public "https://example.com -> $code";; *) res FAIL net.uid1001_public "$code";; esac
  as1001 curl -sS -m 5 -o /dev/null http://127.0.0.1:1 >/dev/null 2>&1; [ $? -eq 7 ] && res PASS net.uid1001_loopback "loopback not rejected by rules (connection refused by closed port, exit 7)" 
  for t in 10.0.0.1 100.64.0.1 0.0.0.1 172.16.0.1 192.168.1.1 169.254.169.254 "[fdaa::3]" "[fe80::1]" "[fc00::1]"; do
    for who in 1001 root; do
      s=$(date +%s%N); if [ $who = 1001 ]; then as1001 curl -g -sS -m 4 -o /dev/null "http://$t:80/" >/tmp/n.err 2>&1; rc=$?; else curl -g -sS -m 4 -o /dev/null "http://$t:80/" >/tmp/n.err 2>&1; rc=$?; fi
      ms=$(( ($(date +%s%N) - s) / 1000000 )); echo "$who $t rc=$rc ${ms}ms $(head -c 90 /tmp/n.err | tr '\n' ' ')" >> /tmp/net.matrix
      if [ $who = 1001 ]; then if [ $rc -eq 7 ] && [ $ms -lt 3000 ]; then res PASS "net.refused.$t" "uid1001 rc=7 in ${ms}ms (rejected)"; else res FAIL "net.refused.$t" "uid1001 rc=$rc in ${ms}ms: $(head -c 80 /tmp/n.err)"; fi
      else res INFO "net.root.$t" "root rc=$rc in ${ms}ms (not blocked by the project rules if not a fast reject: $(head -c 60 /tmp/n.err | tr '\n' ' '))"; fi
    done; done
  nameserver=$(awk '$1=="nameserver"{print $2;exit}' /etc/resolv.conf); res INFO net.resolver "$nameserver (resolv.conf separator is $(grep -m1 nameserver /etc/resolv.conf | od -c | sed -n 1p | grep -c '\\t') tab)"
  as1001 getent hosts example.com >/dev/null && res PASS net.dns1001 "uid1001 resolves names via the allowed resolver"
}
phase_node() {
  mkdir -p /tmp/project && chown 1001:1001 /tmp/project
  cat > /opt/test/fakehost.sh <<'H'
#!/bin/sh
env > /tmp/project/host.env; id -u > /tmp/project/host.uid
exec sleep 3600
H
  chmod 755 /opt/test/fakehost.sh
  FLY_API_TOKEN=CANARY-fly-api CLOUD_BOOTSTRAP_TOKEN=CANARY-bootstrap CLOUD_LEASE_PRIVATE_KEY=CANARY-lease FLY_MACHINE_ID_CANARY=1 AWS_SECRET_ACCESS_KEY=CANARY-s3 ANTHROPIC_API_KEY=CANARY-anthropic \
    node /opt/test/fly-vm-harness.mjs
}
phase_resources() {
  res INFO res.cpu "nproc=$(nproc) load=$(cut -d' ' -f1-3 /proc/loadavg)"
  res INFO res.mem "$(free -m | awk 'NR==2{print "total="$2"MiB used="$3"MiB avail="$7"MiB"}')"
  res INFO res.disk "$(df -h /data | awk 'NR==2{print $2" size, "$3" used at /data"}') mount=$(findmnt -no SOURCE,FSTYPE /data)"
  res INFO res.procs "$(ps -e --no-headers | wc -l) processes; kernel $(uname -r)"
  avail=$(free -m | awk 'NR==2{print $7}'); [ "$avail" -gt 3000 ] && res PASS res.headroom "idle headroom ${avail} MiB available of 4096" || res FAIL res.headroom "only ${avail} MiB available"
}
"phase_$1"
