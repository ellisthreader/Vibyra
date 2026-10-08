#!/bin/sh
set -eu
# Fail closed if this image cannot enforce project egress isolation.
# nftables `meta skuid` is used because Fly's kernel has no iptables owner match. Every rule MATCHES uid 1001
# positively: kernel-originated packets (IPv6 neighbour discovery, router solicitation) carry no socket and so no
# skuid, and a negated skuid guard does not match them, so they fell into the ff00::/8 and fe80::/10
# rejects and broke IPv6/DNS (fdaa::3) for every user once the neighbour cache expired.
rules="table inet vibyra_project {
  chain output {
    type filter hook output priority 0; policy accept;
    oif lo accept
"
for resolver in $(awk '$1 == "nameserver" {print $2}' /etc/resolv.conf); do
  case "$resolver" in
    *:*) rules="$rules    meta skuid 1001 ip6 daddr $resolver udp dport 53 accept
    meta skuid 1001 ip6 daddr $resolver tcp dport 53 accept
" ;;
    *) rules="$rules    meta skuid 1001 ip daddr $resolver udp dport 53 accept
    meta skuid 1001 ip daddr $resolver tcp dport 53 accept
" ;;
  esac
done
rules="$rules    meta skuid 1001 ip daddr { 0.0.0.0/8, 10.0.0.0/8, 100.64.0.0/10, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 } reject
    meta skuid 1001 ip6 daddr { fc00::/7, fe80::/10, ff00::/8 } reject
  }
}"
printf '%s\n' "$rules" | nft -f -
# RAM-backed directory for the runtime token file and git credential socket (cloud-computer mode).
# If the mount is refused the files fall back to the guest root filesystem; the token is single-generation.
mkdir -p /run/vibyra
mount -t tmpfs -o mode=0750,size=1m tmpfs /run/vibyra 2>/dev/null || echo 'warning: /run/vibyra is not tmpfs' >&2
exec prlimit --nproc=256:256 --nofile=4096:4096 -- node /opt/vibyra/src/main.mjs
