import { createPublicKey, verify } from 'node:crypto';
export class Lease {
  constructor(publicKey, scope, clock = () => Date.now()) {
    this.key = createPublicKey({ key: Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), Buffer.from(publicKey, 'base64')]), format: 'der', type: 'spki' });
    this.scope = scope; this.clock = clock; this.expires = 0;
  }
  accept(signed) {
    if (!signed || !verify(null, Buffer.from(signed.payload), this.key, Buffer.from(signed.signature, 'base64'))) throw Error('Invalid compute signature');
    const p = JSON.parse(Buffer.from(signed.payload, 'base64').toString());
    if (p.workspace !== this.scope.workspace || p.machine !== this.scope.machine || p.generation !== this.scope.generation
      || p.state !== 'ready' || !Number.isInteger(p.expires) || p.expires * 1000 <= this.clock()
      || p.expires * 1000 > this.clock() + 35000) throw Error('Expired or mismatched compute lease');
    if (p.network !== null && p.network !== undefined && (!Number.isSafeInteger(p.network.bytes) || p.network.bytes < 0 || p.network.bytes > 2097152)) throw Error('Invalid network lease');
    this.network = p.network ?? null; this.expires = p.expires * 1000;
  }
  active() { return this.clock() < this.expires; }
}
