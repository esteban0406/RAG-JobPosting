import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';

export function gitSha(): string {
  try {
    const sha = execSync('git rev-parse --short HEAD').toString().trim();
    const dirty = execSync('git status --porcelain').toString().trim();
    return dirty ? `${sha}-dirty` : sha;
  } catch {
    return 'unknown';
  }
}

// Each run gets its own directory under evaluation/runs so results stay
// attributable to the code and configuration that produced them.
export function createRunDir(label: string, root?: string): string {
  const base = root ?? resolve(process.cwd(), '..', 'evaluation', 'runs');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dir = join(base, `${stamp}-${gitSha()}-${label}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(dir: string, name: string, data: unknown): string {
  const path = join(dir, name);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n');
  return path;
}

export function percentile(values: number[], p: number): number {
  if (values.length === 0) return NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

// Small deterministic PRNG so samples are reproducible from the seed.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
