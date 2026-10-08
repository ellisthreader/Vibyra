import fs from 'node:fs/promises';
import { spawn as nodeSpawn } from 'node:child_process';
export async function egressCounter() {
  const n = Number((await fs.readFile('/sys/class/net/eth0/statistics/tx_bytes','utf8')).trim());
  if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid VM network counter');
  return n;
}
/** Small, signed byte windows. The project cannot reset the root-owned firewall. */
export class EgressLimit {
  constructor({counter=egressCounter,spawn=nodeSpawn}={}) {this.counter=counter;this.spawn=spawn;this.installed=false;}
  async apply(network, reported) {
    if (!network || !Number.isSafeInteger(network.bytes) || network.bytes < 0 || network.bytes > 2097152) throw Error('Invalid signed network allowance');
    const extra = Math.max(0, network.bytes - Math.max(0,(await this.counter()) - reported));
    // The transaction replaces the old quota atomically. Only leased UID1001
    // is limited: the root control plane can still settle and stop the VM.
    const rules = `${this.installed ? 'delete table inet vibyra_preview_egress\n' : ''}table inet vibyra_preview_egress {
      chain output { type filter hook output priority 10; policy accept;
        meta skuid 1001 oifname != "lo" quota over ${extra} bytes drop
      }
    }\n`;
    await new Promise((resolve,reject)=>{
      const p=this.spawn('/usr/sbin/nft',['-f','-'],{stdio:['pipe','ignore','ignore']});
      const timer=setTimeout(()=>{p.kill('SIGKILL');reject(Error('Network quota timed out'));},2000);
      p.once('error',error=>{clearTimeout(timer);reject(error);});
      p.once('exit',code=>{clearTimeout(timer);code === 0 ? resolve() : reject(Error('Network quota failed'));});
      p.stdin.on('error',()=>{}); p.stdin.end(rules);
    });
    this.installed=true;
  }
}
