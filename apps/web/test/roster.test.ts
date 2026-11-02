import { describe, expect, it } from 'vitest';

import { filterAthletes } from '../src/roster';

const athletes = [
  { firstName: 'Żaneta', lastName: 'Łącka', birthYear: 2011, gender: 'F' as const },
  { firstName: 'Jan', lastName: 'Nowak', birthYear: 2012, gender: 'M' as const },
  { firstName: 'Ada', lastName: 'Kowalska', birthYear: 2010, gender: 'F' as const },
];

describe('filterAthletes', () => {
  it('searches names without case or surrounding whitespace sensitivity', () => {
    expect(filterAthletes(athletes, '  ŁĄCKA ')).toEqual([athletes[0]]);
    expect(filterAthletes(athletes, 'jan')).toEqual([athletes[1]]);
  });

  it('searches by birth year and normalizes composed Unicode', () => {
    expect(filterAthletes(athletes, '2010')).toEqual([athletes[2]]);
    expect(filterAthletes(athletes, 'Z\u0307aneta')).toEqual([athletes[0]]);
  });

  it('returns a copy of the full list when the query is empty', () => {
    const result = filterAthletes(athletes, '   ');
    expect(result).toEqual(athletes);
    expect(result).not.toBe(athletes);
  });
});
