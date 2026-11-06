import { arrayOf, createSeededRandom, type RandomSource } from '@lp-labs/property-generators';

const random: RandomSource = createSeededRandom(7);
const values: readonly string[] = arrayOf({
  sample: (source) => String(source.next()),
  shrink: () => [],
}).sample(random);
void values;
