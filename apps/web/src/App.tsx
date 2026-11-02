import { pl } from './i18n/pl';

export default function App() {
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
    </main>
  );
}
