import { describe, expect, it } from 'vitest';

import {
  relayMemberKeys,
  setRelayMemberAtPosition,
  toggleRelayMemberAssignment,
} from '../src/relay-draft';

describe('relay member assignments', () => {
  it('creates optional empty slots after relay creation and removes them when disabled', () => {
    const savedRelay = { assignMembers: false, memberAthleteKeys: [] as Array<string | null> };
    const assigned = toggleRelayMemberAssignment(savedRelay, true, 4);

    expect(assigned).toEqual({
      assignMembers: true,
      memberAthleteKeys: [null, null, null, null],
    });
    expect(toggleRelayMemberAssignment(assigned, false, 4)).toEqual({
      assignMembers: false,
      memberAthleteKeys: [],
    });
  });

  it('keeps member order, omits blank slots and clears following legs after a gap', () => {
    let assignment = toggleRelayMemberAssignment(
      { assignMembers: false, memberAthleteKeys: [] },
      true,
      4,
    );
    assignment = setRelayMemberAtPosition(assignment, 0, 'athlete-a');
    assignment = setRelayMemberAtPosition(assignment, 1, 'athlete-b');
    assignment = setRelayMemberAtPosition(assignment, 3, 'athlete-d');

    expect(relayMemberKeys(assignment)).toEqual(['athlete-a', 'athlete-b', 'athlete-d']);
    assignment = setRelayMemberAtPosition(assignment, 1, '');
    expect(assignment.memberAthleteKeys).toEqual(['athlete-a', null, null, null]);
    expect(relayMemberKeys(assignment)).toEqual(['athlete-a']);
  });

  it('uses the same roster record for a person with individual and relay entries', () => {
    const roster = [{ key: 'athlete-a', entries: [{ eventId: 'individual-1', timeCs: 3125 }] }];
    const relayAssignment = toggleRelayMemberAssignment(
      { assignMembers: false, memberAthleteKeys: [] },
      true,
      4,
    );
    const withRelayMember = setRelayMemberAtPosition(relayAssignment, 0, 'athlete-a');
    const includedKeys = new Set(['athlete-a']);
    const members = relayMemberKeys(withRelayMember).map((key) => {
      if (!includedKeys.has(key)) {
        throw new Error('member missing from roster');
      }
      return roster.find((athlete) => athlete.key === key);
    });

    expect(roster[0].entries).toEqual([{ eventId: 'individual-1', timeCs: 3125 }]);
    expect(members).toEqual([roster[0]]);
  });
});
