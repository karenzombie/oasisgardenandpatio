/**
 * Parse the Slate Image Assignments text file and build a clean SKU→image mapping.
 * Run: pnpm --filter @workspace/scripts exec tsx src/parseSlateImageMapping.ts
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const text = readFileSync(resolve(process.cwd(), "../attached_assets/Pasted-Slate-Image-Assignments-All-filenames-are-in-the-Homecr_1783558656681.txt"), "utf-8");

const mapping: Record<string, string> = {};

// Split by sections (each starts with a heading line like "Fire Tables...")
const lines = text.split('\n');
let currentImage: string | null = null;
let currentSku = '';

for (const rawLine of lines) {
  const line = rawLine.trim();
  if (!line || line.startsWith('Slate Image Assignments') || line.includes('All filenames')) continue;
  
  // Section header like "Fire Tables (use closest top image)"
  if (line.includes('Base') || line.includes('Tables') || line.includes('Adjustable') || line.includes('Fire')) {
    // Skip section headers for now
    continue;
  }
  
  // The format is: SKU1Image1SKU2Image2... with no delimiters
  // Example: "42SQSLTT+89SNCC4242SSL.jpg893252XSLTT+89XNCC3252XSL.jpg"
  // We need to split by finding .jpg occurrences
  if (line.includes('.jpg')) {
    // This is a data line
    const parts = line.split(/(?=\b[A-Z0-9])/); // Split before uppercase/number sequences
    // Actually simpler: extract all .jpg filenames, then everything before each is the SKU
    const jpgMatches = [...line.matchAll(/([^.]+\.jpg)/g)];
    let remaining = line;
    for (const match of jpgMatches) {
      const jpg = match[1];
      const idx = remaining.indexOf(jpg);
      if (idx !== -1) {
        const skuPart = remaining.slice(0, idx).trim();
        remaining = remaining.slice(idx + jpg.length);
        if (skuPart) {
          mapping[skuPart] = jpg;
        }
      }
    }
  }
}

// Actually let me just manually parse the known sections
console.log('Parsing Slate Image Assignments...');

// Let me use a regex-based approach
const cleaned = text.replace(/\n/g, ' ').replace(/\s+/g, ' ');
console.log('Cleaned text length:', cleaned.length);

// Find all SKU → image pairs using regex
// Pattern: SKU contains letters, numbers, +, maybe ends before a filename like C*.jpg or *.jpg
const pairs = [...cleaned.matchAll(/([A-Z0-9+]+)\s+([A-Z0-9_\-]+\.jpg)/g)];
console.log('Found pairs:', pairs.length);
for (const [_, sku, img] of pairs) {
  mapping[sku] = img;
}

// But the text format is compressed without spaces in the data lines
// Let me try another approach: extract all jpg filenames, and split the text around them
const allJpgs = [...new Set([...text.matchAll(/([A-Za-z0-9_\-]+\.jpg)/g)].map(m => m[1]))];
console.log('Unique images:', allJpgs.length);
console.log(allJpgs.join('\n'));
