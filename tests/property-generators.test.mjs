import assert from 'node:assert/strict';
import test from 'node:test';
import {
  arrayOf,
  boolean,
  createSeededRandom,
  integer,
  runProperty,
  string,
} from '../dist/esm/index.js';

test('repeats seeded samples and produces bounded built-in values', () => {
  const first = createSeededRandom(42);
  const second = createSeededRandom(42);
  assert.deepEqual(
    Array.from({ length: 10 }, () => first.next()),
    Array.from({ length: 10 }, () => second.next()),
  );
  const sample = integer(-5, 5).sample(createSeededRandom(3));
  assert.ok(sample >= -5 && sample <= 5);
  assert.equal(typeof boolean().sample(createSeededRandom(1)), 'boolean');
  assert.ok(string(8).sample(createSeededRandom(2)).length <= 8);
  const arrays = arrayOf(integer(1, 20), 3);
  assert.ok(arrays.sample(createSeededRandom(3)).length <= 3);
  assert.deepEqual([...arrays.shrink([9])], [[], [4], [2], [1]]);
});

test('runs passing properties and greedily shrinks a real failing sample', () => {
  assert.deepEqual(
    runProperty(integer(0, 5), (value) => value >= 0, { seed: 5, trials: 20 }),
    {
      ok: true,
      seed: 5,
      trials: 20,
    },
  );
  const result = runProperty(integer(0, 100), (value) => value < 10, { seed: 9, trials: 100 });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.ok(result.counterexample >= 10);
    assert.ok(result.minimized >= 10);
    assert.ok(result.minimized <= result.counterexample);
    assert.ok(result.shrinkAttempts <= 100);
  }
});

test('stops hostile shrink iterables and reports invalid seeds/callbacks', () => {
  const hostile = {
    sample: () => 0,
    *shrink() {
      while (true) yield 1;
    },
  };
  assert.throws(
    () => runProperty(hostile, (value) => value === 1, { trials: 1, maxCandidatesPerShrink: 3 }),
    /candidate limit/,
  );
  assert.throws(() => createSeededRandom(-1), RangeError);
  assert.throws(
    () =>
      runProperty(integer(0, 1), () => true, {
        maxShrinks: 10_000,
        maxCandidatesPerShrink: 10_000,
      }),
    /Combined shrink candidate budget/,
  );
  assert.throws(() => runProperty(integer(0, 1), () => 1), /boolean/);
  assert.throws(() => integer(0, 1).sample({ next: () => 1 }), /Random source/);
});
