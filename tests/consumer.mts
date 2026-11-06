import {
  integer,
  runProperty,
  type Generator,
  type PropertyResult,
} from '@lp-labs/property-generators';

const numbers: Generator<number> = integer(0, 10);
const result: PropertyResult<number> = runProperty(numbers, (value) => value >= 0);
void result;
