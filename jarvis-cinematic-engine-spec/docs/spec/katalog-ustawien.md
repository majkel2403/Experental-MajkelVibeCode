# Katalog ustawień (wygenerowany z kodu)

> Generuje `node tools/gen-spec.js` z `js/core.js`. Nie edytuj ręcznie.

Kolumna „w adresie” = klucz można podać w `index.html#klucz=wartość` (lista `ALLOW`). Klucze tajne nigdy nie trafiają do modelu (`settings_get`) ani do eksportu.

| sekcja | klucz | domyślnie | typ | w adresie | tajny |
|---|---|---|---|---|---|
| Agent i proaktywność | `briefingTime` | `""` | string | tak | — |
| Agent i proaktywność | `proactive` | `"quiet"` | string | tak | — |
| Agent i proaktywność | `proactiveMax` | `4` | number | — | — |
| Agent i proaktywność | `quietFrom` | `""` | string | — | — |
| Agent i proaktywność | `quietTo` | `""` | string | — | — |
| Agent i proaktywność | `summaryTime` | `""` | string | tak | — |
| Głos i dźwięk | `silentVoice` | `false` | boolean | — | — |
| Głos i dźwięk | `sound` | `true` | boolean | — | — |
| Głos i dźwięk | `speech` | `true` | boolean | — | — |
| Głos i dźwięk | `speechRate` | `1` | number | — | — |
| Głos i dźwięk | `voiceName` | `""` | string | — | — |
| Głos i dźwięk | `wakeWord` | `false` | boolean | tak | — |
| Hermes (mózg) | `hermesDailyBudget` | `0` | number | — | — |
| Hermes (mózg) | `hermesKey` | — | string | tak | tak |
| Hermes (mózg) | `hermesMode` | `"auto"` | string | tak | — |
| Hermes (mózg) | `hermesModel` | `"hermes-agent"` | string | tak | — |
| Hermes (mózg) | `hermesModelLite` | `""` | string | — | — |
| Hermes (mózg) | `hermesOn` | `true` | boolean | tak | — |
| Hermes (mózg) | `hermesPreset` | `"balanced"` | string | — | — |
| Hermes (mózg) | `hermesProvider` | `"agent"` | string | tak | — |
| Hermes (mózg) | `hermesUrl` | `"http://localhost:8642/v1"` | string | tak | — |
| Hermes (mózg) | `toolFormat` | `"auto"` | string | — | — |
| Inne | `bridgeOn` | `true` | boolean | tak | — |
| Inne | `bridgeToken` | `""` | string | — | — |
| Inne | `bridgeUrl` | `"http://127.0.0.1:8651"` | string | tak | — |
| Inne | `dockOrder` | `[]` | object | — | — |
| Inne | `favCities` | `[]` | object | — | — |
| Inne | `filmOn` | `true` | boolean | — | — |
| Inne | `filmScen` | `{"telegram":"auto","cron":"auto","chat":"auto"}` | object | — | — |
| Inne | `flags` | `{}` | object | — | — |
| Inne | `fxLevel` | `"standard"` | string | — | — |
| Inne | `keys` | — | object | — | tak |
| Inne | `layoutStartup` | `"none"` | string | — | — |
| Inne | `minimap` | `false` | boolean | — | — |
| Inne | `notif` | `{}` | object | — | — |
| Inne | `offlineMode` | `false` | boolean | — | — |
| Inne | `startMode` | `"work"` | string | — | — |
| Inne | `sttLang` | `"pl-PL"` | string | — | — |
| Inne | `uiScale` | `100` | number | — | — |
| Inne | `units` | `{"temp":"C","wind":"kmh"}` | object | — | — |
| Inne | `volume` | `60` | number | — | — |
| Inne | `watchlist` | `["BTC","ETH","SOL","BNB"]` | object | — | — |
| Inne | `wfFilm` | `"ask"` | string | — | — |
| OpenRouter | `openrouterKey` | — | string | tak | tak |
| Sędzia Jev | `jevA2` | `0.92` | number | — | — |
| Sędzia Jev | `jevA3` | `0.8` | number | — | — |
| Sędzia Jev | `jevAsk` | `0.5` | number | — | — |
| Sędzia Jev | `jevAutonomy` | `"auto"` | string | tak | — |
| Sędzia Jev | `jevBudget` | `5` | number | tak | — |
| Sędzia Jev | `jevDestructive` | `0.8` | number | — | — |
| Sędzia Jev | `jevExecute` | `0.85` | number | — | — |
| Sędzia Jev | `jevFast` | `true` | boolean | — | — |
| Sędzia Jev | `jevInterrupt` | `0.6` | number | — | — |
| Sędzia Jev | `jevKey` | — | string | tak | tak |
| Sędzia Jev | `jevLogText` | `false` | boolean | — | — |
| Sędzia Jev | `jevModel` | `"typesafe/jev-1.13"` | string | tak | — |
| Sędzia Jev | `jevOn` | `false` | boolean | tak | — |
| Sędzia Jev | `jevPrivacy` | `"P1"` | string | tak | — |
| Sędzia Jev | `jevShadow` | `false` | boolean | tak | — |
| Sędzia Jev | `jevUrl` | `""` | string | — | — |
| Sędzia Jev | `jevVerify` | `0.4` | number | — | — |
| Użytkownik i start | `city` | `"Wrocław"` | string | tak | — |
| Użytkownik i start | `lat` | `51.1079` | number | — | — |
| Użytkownik i start | `lon` | `17.0385` | number | — | — |
| Użytkownik i start | `skipBoot` | `false` | boolean | tak | — |
| Użytkownik i start | `user` | `"JD"` | string | tak | — |
| Wygląd | `accent` | `"#33d6ff"` | string | — | — |
| Wygląd | `accent2` | `"#a25cff"` | string | — | — |
| Wygląd | `look` | `4` | number | — | — |
| Wygląd | `particles` | `true` | boolean | — | — |
| Wygląd | `wall` | `"photo"` | string | — | — |
