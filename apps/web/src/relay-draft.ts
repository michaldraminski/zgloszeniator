export interface RelayMemberAssignment {
  assignMembers: boolean;
  memberAthleteKeys: Array<string | null>;
}

export function toggleRelayMemberAssignment(
  current: RelayMemberAssignment,
  enabled: boolean,
  positionCount: number,
): RelayMemberAssignment {
  const memberAthleteKeys = enabled
    ? Array.from(
        { length: positionCount },
        (_, index) => current.memberAthleteKeys[index] ?? null,
      )
    : [];
  return { assignMembers: enabled, memberAthleteKeys };
}

export function setRelayMemberAtPosition(
  current: RelayMemberAssignment,
  position: number,
  athleteKey: string,
): RelayMemberAssignment {
  const memberAthleteKeys = [...current.memberAthleteKeys];
  memberAthleteKeys[position] = athleteKey || null;

  if (!athleteKey) {
    for (let nextPosition = position + 1; nextPosition < memberAthleteKeys.length; nextPosition += 1) {
      memberAthleteKeys[nextPosition] = null;
    }
  }

  return { ...current, memberAthleteKeys };
}

export function relayMemberKeys(
  current: RelayMemberAssignment,
): string[] {
  return current.memberAthleteKeys.filter((key): key is string => key !== null);
}