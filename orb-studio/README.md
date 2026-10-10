# ORB Studio

Projektor puchatych stworków (w duchu „Mały stworek. Twój styl.”). Jeden plik HTML, zero zależności, bez builda.

```
open orb-studio/index.html      # albo wystaw statycznie; wymaga przeglądarki z WebGL
```

## Co tu jest

- **Futro w WebGL** — shell texturing: 16–38 warstw skorupy, każda odcina pasma wg szumu 3D, z ciemnym podkładem, gradientem AO, rim lightingiem i połyskiem. Puszystość steruje gęstością i długością włosów; wiatr wygina warstwy.
- **Twarz na nakładce 2D** — oczy, buźka, rumieniec i dodatki są rzutowane z kotwic 3D na powierzchnię, więc obracają się i ściskają razem z ciałem. Twarze za bliższym stworkiem są wygaszane.
- **Animacje** — oddech, podskoki z sprężyną, mruganie, mrugnięcie okiem, spojrzenie za kursorem, pochylanie, sprężyste ściśnięcie po kliknięciu, serduszka i iskry, linie „akcji”, cienie kontaktowe, pył/gwiazdy w tle.
- **Interakcje** — przeciągnij, by obrócić; kliknij, by pogłaskać; kliknij sąsiada, by go wybrać; strzałki klawiatury; do 5 stworków na scenie.
- **Tryb ciemny** — przycisk w nagłówku oraz w Ustawieniach: jasny, ciemny lub „jak system”. Tło sceny jest niezależne od motywu.
- **Szablony** — osiem gotowych stworków w zakładce Zapisane; klik wczytuje go do aktywnego stworka.
- **Układ** — desktop: boczne szyny; tablet: szyny jako wiersze; telefon: dolny pasek nawigacji.
- **Zapisywanie** — „Zapisz awatar” pobiera PNG (z tłem) i dodaje miniaturę do Zapisanych (localStorage, z obsługą błędów).

## Ograniczenia

- Obsługa WebGL 1; bez WebGL projektowanie działa, futra nie widać.
- Jakość „Lekka/Standard/Maksymalna” zmienia liczbę warstw i DPR.
- Zapisane awatary są tylko w przeglądarce tego użytkownika.
