export const pl = {
  title: 'Lenex Entries',
  appDescription:
    'Narzędzie do obsługi list startowych, historii wyników i eksportu zgłoszeń LENEX w trybie lokalnym.',
  sections: {
    roster: 'Zawodnicy',
    import: 'Import',
    export: 'Eksport',
  },
  importSteps: {
    invitation: 'Załaduj zaproszenie z organizatora (.lxf / .lef).',
    results: 'Dołącz wyniki i porównaj zawodników z rosterem.',
    entry: 'Eksportuj kompletne zgłoszenie do formatu Splash Entry Editor.',
  },
  fileImport: {
    heading: 'Wczytaj plik LENEX',
    choose: 'Wybierz plik .lxf lub .lef',
    hint: 'Plik jest odczytywany lokalnie. Typ rozpoznajemy automatycznie; sam podgląd niczego nie zapisuje.',
    loading: 'Odczytywanie pliku…',
    errorHeading: 'Nie udało się wczytać pliku',
    errorFallback: 'Plik jest nieprawidłowy lub ma nieobsługiwany format.',
    invitation: 'Zaproszenie',
    entry: 'Poprzednie zgłoszenie',
    results: 'Wyniki',
    events: 'Liczba konkurencji',
    disciplines: 'Liczba dyscyplin',
    clubs: 'Liczba klubów',
    athletes: 'Liczba zawodników',
    entries: 'Liczba zgłoszeń indywidualnych',
    relays: 'Liczba zgłoszeń sztafetowych',
    validResults: 'Liczba ważnych wyników',
  },
  outputFormat: {
    label: 'Format eksportu LENEX',
    v2: 'LENEX 2.0 / Windows-1250 (bezpieczny domyślny)',
    v3: 'LENEX 3.0 / UTF-8 (eksperymentalnie, jeśli organizator potwierdzi kompatybilność)',
  },
};
