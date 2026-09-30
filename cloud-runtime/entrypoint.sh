#!/bin/sh
set -eu
# Fail closed if this image cannot enforce project egress isolation.
for resolver in $(awk '/^nameserver / {print $2}' /etc/resolv.conf); do
  case "$resolver" in *:*) firewall=ip6tables ;; *) firewall=iptables ;; esac
  "$firewall" -A OUTPUT -m owner --uid-owner 1001 -p udp -d "$resolver" --dport 53 -j ACCEPT
  "$firewall" -A OUTPUT -m owner --uid-owner 1001 -p tcp -d "$resolver" --dport 53 -j ACCEPT
done
iptables -A OUTPUT -m owner --uid-owner 1001 -d 127.0.0.0/8 -j ACCEPT
for range in 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16 169.254.0.0/16; do
  iptables -A OUTPUT -m owner --uid-owner 1001 -d "$range" -j REJECT
done
ip6tables -A OUTPUT -m owner --uid-owner 1001 -d ::1/128 -j ACCEPT
ip6tables -A OUTPUT -m owner --uid-owner 1001 -d fc00::/7 -j REJECT
ip6tables -A OUTPUT -m owner --uid-owner 1001 -d fe80::/10 -j REJECT
ip6tables -A OUTPUT -m owner --uid-owner 1001 -d ff00::/8 -j REJECT
exec prlimit --nproc=256:256 --nofile=4096:4096 -- node /opt/vibyra/src/main.mjs
