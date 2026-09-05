import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Keep original artwork; generate compact assets sized for badge displays.
const directory = 'resources/js/assets/achievements';
let before = 0;
let after = 0;
for (const file of await fs.readdir(directory)) {
    if (!file.endsWith('.png')) continue;
    const input = path.join(directory, file);
    const output = input.replace(/\.png$/, '.webp');
    const result = await sharp(input).resize({ width: 640, height: 640, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 85, alphaQuality: 100 }).toFile(output);
    before += (await fs.stat(input)).size;
    after += result.size;
}
console.log(`Achievement artwork: ${before} -> ${after} bytes`);
