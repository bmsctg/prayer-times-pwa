import { generateKeyPairSync } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export function generateVapidKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
  });

  const pubJwk = publicKey.export({ format: 'jwk' });
  const privJwk = privateKey.export({ format: 'jwk' });

  const x = Buffer.from(pubJwk.x, 'base64url');
  const y = Buffer.from(pubJwk.y, 'base64url');
  const rawPublicKey = Buffer.concat([Buffer.from([0x04]), x, y]);

  const publicKeyBase64Url = rawPublicKey.toString('base64url');
  const privateKeyBase64Url = Buffer.from(privJwk.d, 'base64url').toString('base64url');

  return {
    publicKey: publicKeyBase64Url,
    privateKey: privateKeyBase64Url
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const keys = generateVapidKeys();
  console.log('--- VAPID Keys Generated ---');
  console.log('Public Key:', keys.publicKey);
  console.log('Private Key:', keys.privateKey);
}
