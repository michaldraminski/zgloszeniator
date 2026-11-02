import { useState } from 'react';

import {
  DEFAULT_OUTPUT_FORMAT,
  normalizeOutputFormat,
  type OutputFormat,
} from '@lenex-entries/core';

import { pl } from './i18n/pl';

export default function App() {
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(DEFAULT_OUTPUT_FORMAT);

  return (
    <main className="app-shell">
      <header className="app-header">
        <p className="eyebrow">Lenex Entries</p>
        <h1>{pl.title}</h1>
      </header>

      <section className="panel">
        <h2>{pl.sections.roster}</h2>
        <p>{pl.appDescription}</p>
      </section>

      <section className="panel">
        <h2>{pl.sections.import}</h2>
        <ul>
          <li>{pl.importSteps.invitation}</li>
          <li>{pl.importSteps.results}</li>
          <li>{pl.importSteps.entry}</li>
        </ul>
      </section>

      <section className="panel">
        <h2>{pl.sections.export}</h2>
        <label className="choice-row">
          <input
            type="checkbox"
            checked={outputFormat === 'lenex2-windows1250'}
            onChange={(event) => {
              const next = normalizeOutputFormat(
                event.target.checked ? 'lenex2-windows1250' : 'lenex3-utf8',
              );
              setOutputFormat(next);
            }}
          />
          <span>{pl.outputFormat.label}</span>
        </label>

        <p className="format-note">
          {outputFormat === 'lenex2-windows1250' ? pl.outputFormat.v2 : pl.outputFormat.v3}
        </p>
      </section>
    </main>
  );
}
