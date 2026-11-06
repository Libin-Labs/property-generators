export type RandomSource = Readonly<{ next(): number }>;
export type Generator<T> = Readonly<{
  sample(random: RandomSource): T;
  shrink(value: T): Iterable<T>;
}>;
export type PropertyOptions = Readonly<{
  seed?: number;
  trials?: number;
  maxShrinks?: number;
  maxCandidatesPerShrink?: number;
}>;
export type PropertyResult<T> =
  | Readonly<{ ok: true; seed: number; trials: number }>
  | Readonly<{
      ok: false;
      seed: number;
      trial: number;
      counterexample: T;
      minimized: T;
      shrinkAttempts: number;
    }>;

const positive = (value: number | undefined, fallback: number, label: string): number => {
  const result = value ?? fallback;
  if (!Number.isSafeInteger(result) || result < 1)
    throw new RangeError(`${label} must be positive`);
  return result;
};

export function createSeededRandom(seed: number): RandomSource {
  if (!Number.isSafeInteger(seed) || seed < 0 || seed > 0xffffffff) {
    throw new RangeError('seed must be an unsigned 32-bit integer');
  }
  let state = seed >>> 0;
  return Object.freeze({
    next() {
      state = (state + 0x6d2b79f5) >>> 0;
      let value = state;
      value = Math.imul(value ^ (value >>> 15), value | 1);
      value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    },
  });
}

function boundedInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

export function integer(min: number, max: number): Generator<number> {
  boundedInteger(min, 'min');
  boundedInteger(max, 'max');
  if (min > max || max - min > 0xffffffff)
    throw new RangeError('integer range must be ordered and at most 2^32');
  return Object.freeze({
    sample(random: RandomSource) {
      const value = random.next();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new TypeError('Random source must return [0, 1)');
      return min + Math.floor(value * (max - min + 1));
    },
    *shrink(value: number) {
      if (!Number.isSafeInteger(value) || value < min || value > max)
        throw new TypeError('Value is outside generator range');
      if (value === 0 || (min > 0 && value === min) || (max < 0 && value === max)) return;
      let candidate = value;
      while (candidate !== 0 && candidate !== min) {
        candidate = candidate > 0 ? Math.floor(candidate / 2) : Math.ceil(candidate / 2);
        if (candidate >= min && candidate <= max) yield candidate;
        if (Math.abs(candidate) <= 1) break;
      }
      if (min <= 0 && max >= 0 && value !== 0) yield 0;
      if (min <= 0 && max >= 0 && value !== 0) {
        let towardZero = value;
        while (Math.abs(towardZero) > 1) {
          towardZero = towardZero > 0 ? Math.floor(towardZero / 2) : Math.ceil(towardZero / 2);
          if (towardZero !== 0 && towardZero >= min && towardZero <= max) yield towardZero;
        }
      }
    },
  });
}

export function boolean(): Generator<boolean> {
  return Object.freeze({
    sample(random) {
      const value = random.next();
      if (!Number.isFinite(value) || value < 0 || value >= 1)
        throw new TypeError('Random source must return [0, 1)');
      return value < 0.5;
    },
    *shrink(value) {
      if (value) yield false;
    },
  });
}

export function string(maxLength = 32): Generator<string> {
  const length = positive(maxLength, 32, 'maxLength');
  if (length > 4096) throw new RangeError('maxLength cannot exceed 4096');
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Object.freeze({
    sample(random) {
      const first = random.next();
      if (!Number.isFinite(first) || first < 0 || first >= 1)
        throw new TypeError('Random source must return [0, 1)');
      const size = Math.floor(first * (length + 1));
      let value = '';
      for (let i = 0; i < size; i++) {
        const next = random.next();
        if (!Number.isFinite(next) || next < 0 || next >= 1)
          throw new TypeError('Random source must return [0, 1)');
        const index = Math.floor(next * alphabet.length);
        value += alphabet[index];
      }
      return value;
    },
    *shrink(value) {
      if (typeof value !== 'string' || value.length > length)
        throw new TypeError('Value is outside string generator bounds');
      if (value.length > 0) yield '';
      if (value.length > 1) yield value.slice(0, Math.floor(value.length / 2));
    },
  });
}

export function arrayOf<T>(item: Generator<T>, maxLength = 20): Generator<readonly T[]> {
  const length = positive(maxLength, 20, 'maxLength');
  if (length > 1000) throw new RangeError('maxLength cannot exceed 1000');
  if (!item || typeof item.sample !== 'function' || typeof item.shrink !== 'function')
    throw new TypeError('item must be a generator');
  return Object.freeze({
    sample(random) {
      const next = random.next();
      if (!Number.isFinite(next) || next < 0 || next >= 1)
        throw new TypeError('Random source must return [0, 1)');
      const size = Math.floor(next * (length + 1));
      return Object.freeze(Array.from({ length: size }, () => item.sample(random)));
    },
    *shrink(value) {
      if (!Array.isArray(value) || value.length > length)
        throw new TypeError('Value is outside array generator bounds');
      if (value.length > 0) yield Object.freeze([]);
      if (value.length > 1) yield Object.freeze(value.slice(0, Math.floor(value.length / 2)));
      for (let index = 0; index < value.length; index++) {
        for (const candidate of item.shrink(value[index]!)) {
          const next = [...value];
          next[index] = candidate;
          yield Object.freeze(next);
        }
      }
    },
  });
}

export function runProperty<T>(
  generator: Generator<T>,
  property: (value: T) => boolean,
  options: PropertyOptions = {},
): PropertyResult<T> {
  if (
    !generator ||
    typeof generator.sample !== 'function' ||
    typeof generator.shrink !== 'function'
  ) {
    throw new TypeError('generator must provide sample and shrink functions');
  }
  if (typeof property !== 'function') throw new TypeError('property must be a function');
  if (!options || typeof options !== 'object') throw new TypeError('options must be an object');
  const seed = options.seed ?? 1;
  const random = createSeededRandom(seed);
  const trials = positive(options.trials, 100, 'trials');
  const maxShrinks = positive(options.maxShrinks, 100, 'maxShrinks');
  const maxCandidates = positive(options.maxCandidatesPerShrink, 1000, 'maxCandidatesPerShrink');
  if (trials > 100_000 || maxShrinks > 10_000 || maxCandidates > 10_000) {
    throw new RangeError('Property trial and shrink limits exceed hard limits');
  }
  if (maxShrinks * maxCandidates > 1_000_000) {
    throw new RangeError('Combined shrink candidate budget cannot exceed 1000000');
  }
  for (let trial = 1; trial <= trials; trial++) {
    const sample = generator.sample(random);
    const samplePasses = property(sample);
    if (typeof samplePasses !== 'boolean') throw new TypeError('property must return a boolean');
    if (samplePasses) continue;
    let minimized = sample;
    let attempts = 0;
    let improved = true;
    while (improved && attempts < maxShrinks) {
      improved = false;
      let candidates = 0;
      for (const candidate of generator.shrink(minimized)) {
        if (++candidates > maxCandidates) throw new RangeError('Shrinker candidate limit exceeded');
        if (attempts >= maxShrinks) break;
        attempts++;
        const candidatePasses = property(candidate);
        if (typeof candidatePasses !== 'boolean')
          throw new TypeError('property must return a boolean');
        if (!candidatePasses) {
          minimized = candidate;
          improved = true;
          break;
        }
      }
    }
    return Object.freeze({
      ok: false,
      seed,
      trial,
      counterexample: sample,
      minimized,
      shrinkAttempts: attempts,
    });
  }
  return Object.freeze({ ok: true, seed, trials });
}
