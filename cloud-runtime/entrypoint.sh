#!/bin/sh
set -eu
# Fail closed if this image cannot enforce project egress isolation.
# nftables `meta skuid` is used because Fly's kernel has no iptables owner match.
rules="table inet vibyra_project {
  chain output {
    type filter hook output priority 0; policy accept;
    meta skuid != 1001 accept
    oif lo accept
"
for resolver in $(awk '$1 == "nameserver" {print $2}' /etc/resolv.conf); do
  case "$resolver" in
    *:*) rules="$rules    ip6 daddr $resolver udp dport 53 accept
    ip6 daddr $resolver tcp dport 53 accept
" ;;
    *) rules="$rules    ip daddr $resolver udp dport 53 accept
    ip daddr $resolver tcp dport 53 accept
" ;;
  esac
done
rules="$rules    ip daddr { 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.0.0/16 } reject
    ip6 daddr { fc00::/7, fe80::/10, ff00::/8 } reject
  }
}"
printf '%s\n' "$rules" | nft -f -
exec prlimit --nproc=256:256 --nofile=4096:4096 -- node /opt/vibyra/src/main.mjs
