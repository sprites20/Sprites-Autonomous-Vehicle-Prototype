// noise.js
import { createNoise2D } from 'simplex-noise';

const seed = 'roblox'; // can use a UUID or random string
function mulberry32(seed) {
  let t = seed;
  return function() {
    t += 0x6D2B79F5;
    let z = Math.imul(t ^ (t >>> 15), t | 1);
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61);
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// Example usage
const seedNum = seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
const random = mulberry32(seedNum);
const noise2D = createNoise2D(random);

export default noise2D;
