# @lp-labs/property-generators

Small seeded generators, property execution, and bounded greedy shrinking for deterministic
property checks. This is a deliberately small primitive set rather than a full property-testing
framework. It has zero runtime or peer dependencies.

## Install

```bash
npm install @lp-labs/property-generators
```

## Quickstart

```js
import { integer, runProperty } from '@lp-labs/property-generators';

const result = runProperty(integer(-100, 100), (value) => value < 10, {
  seed: 42,
  trials: 50,
});
if (!result.ok && !Number.isSafeInteger(result.minimized))
  throw new Error('Expected an integer failure');
```

## Public API and types

- `createSeededRandom(seed)` makes a reproducible `RandomSource`; seed must be an unsigned 32-bit
  safe integer. `RandomSource.next()` yields values in `[0, 1)`.
- `integer(min, max)` samples an inclusive safe-integer interval and shrinks toward zero.
- `boolean()` samples booleans and shrinks `true` to `false`.
- `string(maxLength?)` samples lowercase ASCII alphanumeric strings and offers empty/half-prefix
  shrink candidates. Length defaults to 32 and is bounded at 4096.
- `arrayOf(generator, maxLength?)` creates bounded arrays (default maximum 20, hard maximum 1000)
  and offers empty/half-prefix and per-element shrink candidates.
- A `Generator<T>` provides `sample(random)` and an iterable `shrink(value)`.
- `runProperty(generator, property, options?)` returns a `PropertyResult<T>`. Success reports seed
  and completed trials. Failure reports the reproducible seed, one-based trial, original sample,
  greedy minimized value, and shrink attempt count.
- `PropertyOptions` supports `seed` (default 1), `trials` (100, hard maximum 100000), `maxShrinks`
  (100, hard maximum 10000), and `maxCandidatesPerShrink` (1000, hard maximum 10000). The attempt
  and candidate limits make shrinking stop safely; the product of the two shrink limits is capped
  at 1000000 candidate checks.

Runtime exports: `createSeededRandom`, `integer`, `boolean`, `string`, `arrayOf`, and `runProperty`.
`RandomSource`, `Generator<T>`, `PropertyOptions`, and `PropertyResult<T>` are type-only exports.

## Customization, limits, and errors

Implement `Generator<T>` to add domain-specific samples and shrink candidates, then provide a
synchronous property returning a boolean. Reproducibility requires the same seed, generator,
property behavior, and runtime execution. Shrinking greedily accepts the first failing candidate
and restarts; it does not promise a globally minimal counterexample. Generator and property
callbacks are trusted. Exceptions propagate. An infinite or excessive shrink iterable is stopped
with a `RangeError` after the configured candidate cap.

Invalid seeds, ranges, values, callbacks, random outputs, or non-boolean property outcomes throw
`TypeError` or `RangeError`. Limits must be positive safe integers. Collection/primitive generators
are bounded, but custom generator values are the caller's responsibility.

## Support

If this library is useful to you, consider supporting its maintenance with a [donation via PayPal](https://www.paypal.me/LibinPrasanth).

## Author

Created by [Libin Prasanth](https://www.linkedin.com/in/libinprasanth/). Connect on LinkedIn for updates and discussion.
