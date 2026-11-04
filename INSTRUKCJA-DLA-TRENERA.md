# Krótka instrukcja dla trenera

## Przygotowanie zgłoszenia

1. W sekcji **Import** wczytaj zaproszenie organizatora na bieżące zawody. To ono określa konkurencje, kategorie i wymagany basen.
2. Opcjonalnie wczytaj poprzednie zgłoszenia i pliki wyników, aby uzyskać listę zawodników i podpowiedzi czasów.
3. Jeśli w pliku wyników brakuje nazw konkurencji, dołącz także zaproszenie z **tych samych zawodów** do plików historycznych. Aplikacja połączy eventy tylko dla zgodnego spotkania i basenu; nie zgaduje między różnymi zawodami. Wyniki bez rozpoznanej konkurencji nie będą podpowiadane.
4. Gdy ponownie wybierzesz ten sam plik, aplikacja pominie duplikat.

## Zawodnicy i starty

1. W sekcji **Zawodnicy i zgłoszenie** wyszukaj po nazwisku, imieniu, roku urodzenia lub nazwie klubu. Nazwa klubu pojawia się pod nazwiskiem; rok pomaga odróżnić osoby o tych samych danych imię/nazwisko.
2. Zaznacz zawodników, których zgłaszasz. Przy każdym sprawdź zaznaczone konkurencje i zaproponowane czasy. Możesz odznaczyć lub dodać starty dostępne dla wieku i płci zawodnika.
3. Czas wpisuj jako **minuty:sekundy.setne**, na przykład `1:02.34`. Nie wpisuj godzin. Przyciski **+** i **−** zaokrąglają lub zmieniają czas o sekundę. Strzałka **↶** przywraca czas odczytany z importu.
4. Jeśli zawodnik występuje w historii pod nazwą innego klubu niż wpisana do zgłoszenia, pojawi się ostrzeżenie. Sprawdź je — nie blokuje eksportu.
5. Sztafety dodaj w sekcji **Sztafety**. Przypisanie zawodników do zmian jest opcjonalne.

## Kontrola i eksport

1. Sprawdź podsumowanie startów i dane kontaktowe klubu.
2. Wybierz **Pobierz plik .lxf** i zapisz plik na urządzeniu. Plik jest przygotowywany lokalnie.
3. Przed wysłaniem organizatorowi otwórz plik w używanym przez niego programie Splash i sprawdź poprawność zgłoszenia.

## Kopia zapasowa i prywatność

W sekcji **Import** rozwiń narzędzia pamięci i kopii zapasowej, aby pobrać lub przywrócić plik JSON. Kopia zawiera dane zawodników, historię, dane klubu i wybory zgłoszenia — przechowuj ją jak dokument z danymi osobowymi. Aplikacja działa lokalnie i nie wysyła danych zawodników do serwera.
