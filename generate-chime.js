// Generator for a clean prayer notification chime (RIFF WAV format)
import fs from 'node:fs';

function generateChimeWav() {
  const sampleRate = 44100;
  const duration = 2.5; // seconds
  const numSamples = Math.floor(sampleRate * duration);
  const dataSize = numSamples * 2; // 16-bit PCM (2 bytes per sample)

  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size
  header.writeUInt16LE(1, 20); // AudioFormat PCM
  header.writeUInt16LE(1, 22); // NumChannels 1 (Mono)
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28); // ByteRate
  header.writeUInt16LE(2, 32); // BlockAlign
  header.writeUInt16LE(16, 34); // BitsPerSample
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  const data = Buffer.alloc(dataSize);

  // Harmonious eastern chime chord frequencies (E4, B4, E5)
  const freqs = [329.63, 493.88, 659.25];

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    let sample = 0;

    // Harmonic bell envelope
    const envelope = Math.exp(-t * 1.8);

    for (let f = 0; f < freqs.length; f++) {
      sample += Math.sin(2 * Math.PI * freqs[f] * t) * (0.3 / freqs.length);
    }

    const intVal = Math.floor(sample * envelope * 32767);
    const clamped = Math.max(-32768, Math.min(32767, intVal));
    data.writeInt16LE(clamped, i * 2);
  }

  return Buffer.concat([header, data]);
}

fs.writeFileSync('adhan.wav', generateChimeWav());
console.log('Chime sound generated: adhan.wav');
