// Cloudflare Worker Push Notification Handler (Web Crypto Native)

function subKey(endpoint) {
  let h = 0;
  for (let i = 0; i < endpoint.length; i++) {
    h = Math.imul(31, h) + endpoint.charCodeAt(i) | 0;
  }
  return `sub_${Math.abs(h).toString(36)}`;
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

function base64UrlToBytes(b64url) {
  const pad = '='.repeat((4 - b64url.length % 4) % 4);
  const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

function bytesToBase64Url(bytes) {
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function hkdf(salt, ikm, info, length) {
  const key = await crypto.subtle.importKey('raw', ikm, { name: 'HKDF' }, false, ['deriveBits']);
  const derived = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    length * 8
  );
  return new Uint8Array(derived);
}

async function signVapidJwt(endpointUrl, subject, privateKeyB64Url) {
  const url = new URL(endpointUrl);
  const aud = `${url.protocol}//${url.host}`;
  const exp = Math.floor(Date.now() / 1000) + 12 * 3600;

  const header = { typ: 'JWT', alg: 'ES256' };
  const payload = { aud, exp, sub: subject };

  const encoder = new TextEncoder();
  const headerB64 = bytesToBase64Url(encoder.encode(JSON.stringify(header)));
  const payloadB64 = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const unsignedToken = `${headerB64}.${payloadB64}`;

  const jwk = {
    kty: 'EC',
    crv: 'P-256',
    d: privateKeyB64Url,
    ext: true
  };

  const key = await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign']
  );

  const sigBuffer = await crypto.subtle.sign(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    key,
    encoder.encode(unsignedToken)
  );

  const sigB64 = bytesToBase64Url(new Uint8Array(sigBuffer));
  return `${unsignedToken}.${sigB64}`;
}

async function encryptWebPushPayload(subscription, payloadText) {
  const clientP256dh = base64UrlToBytes(subscription.keys.p256dh);
  const clientAuth = base64UrlToBytes(subscription.keys.auth);

  const clientPublicKey = await crypto.subtle.importKey(
    'raw',
    clientP256dh,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    []
  );

  const localKeyPair = await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveBits']
  );

  const localPublicKeyRaw = new Uint8Array(await crypto.subtle.exportKey('raw', localKeyPair.publicKey));

  const sharedSecretBits = await crypto.subtle.deriveBits(
    { name: 'ECDH', public: clientPublicKey },
    localKeyPair.privateKey,
    256
  );
  const sharedSecret = new Uint8Array(sharedSecretBits);

  const salt = crypto.getRandomValues(new Uint8Array(16));

  const infoPrefix = new TextEncoder().encode('WebPush: info\0');
  const infoKey = new Uint8Array(infoPrefix.length + clientP256dh.length + localPublicKeyRaw.length);
  infoKey.set(infoPrefix, 0);
  infoKey.set(clientP256dh, infoPrefix.length);
  infoKey.set(localPublicKeyRaw, infoPrefix.length + clientP256dh.length);

  const ikm = await hkdf(clientAuth, sharedSecret, infoKey, 32);

  const cekInfo = new TextEncoder().encode('Content-Encoding: aes128gcm\0');
  const nonceInfo = new TextEncoder().encode('Content-Encoding: nonce\0');

  const cek = await hkdf(salt, ikm, cekInfo, 16);
  const nonce = await hkdf(salt, ikm, nonceInfo, 12);

  const payloadBytes = new TextEncoder().encode(payloadText);
  const recordBytes = new Uint8Array(payloadBytes.length + 1);
  recordBytes.set(payloadBytes, 0);
  recordBytes[payloadBytes.length] = 2; // Delimiter

  const cekKey = await crypto.subtle.importKey('raw', cek, { name: 'AES-GCM' }, false, ['encrypt']);
  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    cekKey,
    recordBytes
  );
  const ciphertext = new Uint8Array(ciphertextBuffer);

  const recordSize = ciphertext.length;
  const header = new Uint8Array(16 + 4 + 1 + 65);
  header.set(salt, 0);
  const view = new DataView(header.buffer);
  view.setUint32(16, recordSize, false);
  header[20] = 65;
  header.set(localPublicKeyRaw, 21);

  const body = new Uint8Array(header.length + ciphertext.length);
  body.set(header, 0);
  body.set(ciphertext, header.length);

  return body;
}

async function sendPushNotification(subscription, payloadObj, env) {
  const payloadText = JSON.stringify(payloadObj);
  const jwt = await signVapidJwt(subscription.endpoint, env.VAPID_SUBJECT, env.VAPID_PRIVATE_KEY);
  const body = await encryptWebPushPayload(subscription, payloadText);

  const res = await fetch(subscription.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      'Authorization': `vapid t=${jwt}, k=${env.VAPID_PUBLIC_KEY}`,
      'TTL': '60'
    },
    body
  });

  return res;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });

    const url = new URL(request.url);

    // POST /subscribe
    if (request.method === 'POST' && url.pathname === '/subscribe') {
      const { subscription, prayers, city } = await request.json();
      if (!subscription?.endpoint || !Array.isArray(prayers)) {
        return json({ error: 'Invalid body' }, 400);
      }

      const key = subKey(subscription.endpoint);
      if (env.SUBSCRIPTIONS) {
        await env.SUBSCRIPTIONS.put(key, JSON.stringify({
          subscription,
          prayers,
          city,
          updatedAt: Date.now(),
        }));
      }

      return json({ ok: true, message: 'Subscription saved successfully' });
    }

    // DELETE /unsubscribe
    if (request.method === 'DELETE' && url.pathname === '/unsubscribe') {
      const { endpoint } = await request.json();
      if (!endpoint) return json({ error: 'Invalid body' }, 400);

      if (env.SUBSCRIPTIONS) {
        await env.SUBSCRIPTIONS.delete(subKey(endpoint));
      }
      return json({ ok: true });
    }

    return new Response('Prayer Times Push Worker Online', { status: 200, headers: cors });
  },

  // Scheduled Cron Handler
  async scheduled(event, env) {
    if (!env.SUBSCRIPTIONS) return;

    const now = Date.now();
    const WINDOW_MS = 55_000;

    const { keys } = await env.SUBSCRIPTIONS.list({ prefix: 'sub_' });

    await Promise.all(keys.map(async ({ name: key }) => {
      const raw = await env.SUBSCRIPTIONS.get(key);
      if (!raw) return;

      let data;
      try { data = JSON.parse(raw); } catch { return; }

      for (const prayer of data.prayers) {
        if (Math.abs(prayer.ts - now) > WINDOW_MS) continue;

        const sentKey = `sent_${key}_${prayer.name}`;
        if (await env.SUBSCRIPTIONS.get(sentKey)) continue;

        try {
          const res = await sendPushNotification(
            data.subscription,
            {
              title: 'Prayer Time',
              body: `It's time for ${prayer.name} — ${prayer.time}`,
              tag: `prayer-${prayer.name}`,
              icon: '/icon-192.png',
              sound: '/adhan.mp3',
            },
            env
          );

          if (res.status === 410 || res.status === 404) {
            await env.SUBSCRIPTIONS.delete(key);
          } else {
            await env.SUBSCRIPTIONS.put(sentKey, '1', { expirationTtl: 300 });
          }
        } catch (err) {
          console.error('Push delivery error:', err);
        }
      }
    }));
  },
};
