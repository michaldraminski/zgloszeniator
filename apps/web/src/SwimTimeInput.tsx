import { useState, type KeyboardEvent } from 'react';

import { splitSwimTimeInput } from './time-input';

interface SwimTimeInputProps {
  value: string;
  disabled?: boolean;
  invalid?: boolean;
  errorId?: string;
  athleteLabel: string;
  disciplineLabel: string;
  onChange: (value: string) => void;
}

type TimeSegment = 'minutes' | 'seconds' | 'centiseconds';

export function SwimTimeInput({
  value,
  disabled = false,
  invalid = false,
  errorId,
  athleteLabel,
  disciplineLabel,
  onChange,
}: SwimTimeInputProps) {
  const segments = splitSwimTimeInput(value);
  const [caretPosition, setCaretPosition] = useState<{ segment: TimeSegment; position: number } | null>(null);

  function updateSegment(segment: TimeSegment, nextValue: string): void {
    const next = { ...segments, [segment]: nextValue.replace(/\D/g, '') };
    if (!next.minutes && !next.seconds && !next.centiseconds) {
      onChange('');
      return;
    }
    onChange(`${next.minutes}:${next.seconds}.${next.centiseconds}`);
  }

  function handleSegmentKeyDown(
    event: KeyboardEvent<HTMLInputElement>,
    segment: TimeSegment,
    maxLength: number,
  ): void {
    if (disabled || !/^\d$/.test(event.key)) return;
    event.preventDefault();
    const input = event.currentTarget;
    const start = input.selectionStart ?? input.value.length;
    const end = input.selectionEnd ?? start;
    let nextValue: string;
    let nextCaret: number;

    if (start !== end) {
      nextValue = `${input.value.slice(0, start)}${event.key}${input.value.slice(end)}`;
      nextCaret = start + 1;
    } else if (start < input.value.length) {
      nextValue = `${input.value.slice(0, start)}${event.key}${input.value.slice(start + 1)}`;
      nextCaret = start + 1;
    } else if (input.value.length < maxLength) {
      nextValue = `${input.value}${event.key}`;
      nextCaret = nextValue.length;
    } else {
      nextValue = `${input.value.slice(0, -1)}${event.key}`;
      nextCaret = input.value.length;
    }

    updateSegment(segment, nextValue.slice(0, maxLength));
    setCaretPosition({ segment, position: nextCaret });
  }

  function handleKeyUp(segment: TimeSegment, input: HTMLInputElement): void {
    if (caretPosition?.segment !== segment) return;
    input.setSelectionRange(caretPosition.position, caretPosition.position);
    setCaretPosition(null);
  }

  const commonProps = {
    type: 'text' as const,
    inputMode: 'numeric' as const,
    disabled,
    'aria-invalid': invalid,
    'aria-describedby': invalid ? errorId : undefined,
    autoComplete: 'off' as const,
    spellCheck: false,
  };

  return (
    <div className={`time-segments${invalid ? ' time-segments-invalid' : ''}`}>
      <label className="time-segment">
        <span className="time-segment-unit">min</span>
        <input
          {...commonProps}
          className="time-segment-input time-segment-minutes"
          aria-label={`Minuty — ${disciplineLabel} — ${athleteLabel}`}
          value={segments.minutes}
          placeholder="00"
          onChange={(event) => updateSegment('minutes', event.target.value.slice(0, 4))}
          onKeyDown={(event) => handleSegmentKeyDown(event, 'minutes', 4)}
          onKeyUp={(event) => handleKeyUp('minutes', event.currentTarget)}
        />
      </label>
      <span className="time-segment-separator" aria-hidden="true">:</span>
      <label className="time-segment">
        <span className="time-segment-unit">sek</span>
        <input
          {...commonProps}
          className="time-segment-input time-segment-short"
          aria-label={`Sekundy — ${disciplineLabel} — ${athleteLabel}`}
          value={segments.seconds}
          placeholder="00"
          onChange={(event) => updateSegment('seconds', event.target.value.slice(0, 2))}
          onKeyDown={(event) => handleSegmentKeyDown(event, 'seconds', 2)}
          onKeyUp={(event) => handleKeyUp('seconds', event.currentTarget)}
        />
      </label>
      <span className="time-segment-separator" aria-hidden="true">.</span>
      <label className="time-segment">
        <span className="time-segment-unit">setne</span>
        <input
          {...commonProps}
          className="time-segment-input time-segment-short"
          aria-label={`Setne sekundy — ${disciplineLabel} — ${athleteLabel}`}
          value={segments.centiseconds}
          placeholder="00"
          onChange={(event) => updateSegment('centiseconds', event.target.value.slice(0, 2))}
          onKeyDown={(event) => handleSegmentKeyDown(event, 'centiseconds', 2)}
          onKeyUp={(event) => handleKeyUp('centiseconds', event.currentTarget)}
        />
      </label>
    </div>
  );
}
