# LENEX Entries

Lokalna aplikacja internetowa do przygotowywania zgłoszeń na zawody pływackie i w pływaniu w płetwach. Wczytaj zaproszenie LENEX, wykorzystaj zawodników i czasy z wcześniejszych zgłoszeń lub wyników, wybierz starty i pobierz plik zgłoszenia klubu.

## Aplikacja online

[Otwórz LENEX Entries w GitHub Pages](https://michaldraminski.github.io/zgloszeniator/)

**Uwaga:** to docelowy adres, ale strona obecnie zwraca 404 — GitHub Pages nie zostało jeszcze włączone dla repozytorium, a pierwsze wdrożenie zakończyło się błędem konfiguracji. Właściciel repozytorium musi w [ustawieniach Pages](https://github.com/michaldraminski/zgloszeniator/settings/pages) wybrać **Build and deployment → Source → GitHub Actions**, a następnie ponowić nieudany workflow. Po udanym wdrożeniu powyższy link otworzy aplikację.

Projekt jest w trakcie rozwoju. Przed użyciem plików na prawdziwych zawodach zapoznaj się z uwagami o zgodności poniżej.

## Funkcje

- Wczytywanie plików `.lef` oraz archiwów `.lxf`.
- Import wcześniejszych zgłoszeń i ważnych wyników jako historii zawodników i czasów.
- Podpowiadanie czasów oraz ich ręczna, wygodna edycja.
- Dodawanie sztafet i opcjonalne przypisywanie zawodników do zmian.
- Eksport pliku `.lxf` w formacie LENEX 2.0 / Windows-1250.
- Automatyczny zapis bieżącego zgłoszenia w pamięci przeglądarki IndexedDB.
- Opcjonalny eksport i przywracanie kopii JSON w zwijanej sekcji ustawień zaawansowanych.

## Prywatność i bezpieczeństwo danych

Pliki są przetwarzane w przeglądarce. Aplikacja nie ma serwera, kont, analityki ani mechanizmu wysyłania danych zawodników do usługi. Zgłoszenie jest zapisywane w przeglądarce na bieżącym urządzeniu i profilu — nie synchronizuje się automatycznie z innymi urządzeniami.

Przeglądarka może usunąć swoje dane. Kopia JSON zawiera zaproszenie, historię, ręcznie dodanych zawodników, dane kontaktowe i wybory zgłoszenia. Traktuj ją jak plik zawierający dane osobowe i nie udostępniaj publicznie.

Przetwarzaj wyłącznie pliki, do których masz upoważnienie. Prawdziwe pliki zawodów mogą zawierać dane osobowe i nie wolno dodawać ich do tego publicznego repozytorium. Do programowania i testów używaj wyłącznie syntetycznych przykładów.

## Uruchomienie lokalne

Wymagania: Node.js z włączonym Corepack.

W katalogu głównym repozytorium uruchom:

```powershell
corepack pnpm install
corepack pnpm --filter @lenex-entries/web dev
```

Otwórz adres wyświetlony przez Vite (domyślnie `http://localhost:5173`).

## Sprawdzenia deweloperskie

```powershell
corepack pnpm -r run lint
corepack pnpm -r run typecheck
corepack pnpm -r run test
corepack pnpm -r run build
```

Monorepo zawiera `apps/web` (React + Vite) oraz `packages/core` (parsowanie LENEX, reguły domenowe i generowanie zgłoszeń w ścisłym TypeScript). Pakiet core nie korzysta z API przeglądarki.

## Uwagi o zgodności

- Domyślny eksport to LENEX 2.0 kodowany jako Windows-1250, zgodnie z przykładami plików Splash używanymi w projekcie.
- Przed użyciem zgłoszenia na zawodach sprawdź wygenerowany plik w wersji Splash Meet Manager używanej przez organizatora.
- Przypisania zawodników do sztafet są zapisywane w LENEX jako `RELAYPOSITIONS`. Właściciel projektu widział listy startowe Splash z przypisanymi zawodnikami sztafet.
- Tryb offline/PWA i stały, współdzielony katalog zawodników nie są jeszcze dostępne. Autosave zachowuje bieżące zgłoszenie w danej przeglądarce; kopia JSON służy do przenoszenia danych.

Zobacz [HANDOFF.md](HANDOFF.md), aby poznać potwierdzone fakty o LENEX, decyzje projektowe, etapy prac i otwarte kwestie zgodności.
