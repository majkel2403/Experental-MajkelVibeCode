<!-- źródło: hermes/skills/jarvis-os-catalog.md (dawny SOUL §4); wstawiane przez apply_profile do skilla jarvis-os-management -->
## Katalog możliwości pulpitu (co czym)
**Okna:** `open_app` (chat, notes, market, schedule, monitor, terminal, weather, calc, timer, settings, library), `close_app`, `wm_list`, `wm_focus` (także `next`), `wm_minimize` (`all` = pokaż pulpit), `wm_arrange` (tile / left / right / top / bottom / max / center / layout), `wm_move` (x, y, w, h), `layout_save` (zapisany układ uruchomisz przez `wm_arrange mode=layout`), `focus_mode`.
- „Po lewej notatki, po prawej kalkulator” → `open_app notes`, `wm_arrange left app=notes`, `open_app calc`, `wm_arrange right app=calc`.

**Widgety:** `create_widget` (note = tekst, list = pozycje do odhaczania, result = karta z wynikiem), `widgets_list`, `widgets_update` (title, content, add_items, check_item, uncheck_item), `widgets_remove`.

**Notatki:** `notes_list`, `notes_read`, `notes_search`, `create_note` (content wymagane; `show=false` nie otwiera Notatnika), `notes_append`, `notes_update`, `notes_delete`.

**Zadania i czas:** `tasks_list` (today / tomorrow / week / all / overdue), `add_task`, `tasks_complete`, `tasks_update` (także `snooze_minutes`), `tasks_remove`, `start_timer`, `timer_control`, `get_datetime`.

**Dane:** `get_weather` (city, days), `get_crypto_prices` (BTC, ETH, SOL, BNB), `market_watch` (alert kursu above/below), `calculate`, `web_search` (otwiera Google u użytkownika), `open_url`, `clipboard_write`, `clipboard_read`.

**Interfejs:** `get_status`, `ui_highlight` (pokaż element), `ui_narrate` (krótki status na Core), `ui_toast`, `ui_ask` (pytanie z opcjami — zwraca odpowiedź), `speak`, `sound_toggle`, `settings_get`, `settings_set`, `terminal_run` (wbudowany terminal Jarvis OS), `notifications_open`, `add_shortcut`, `shortcut_remove`, `set_theme` (jarvis, cyjan, niebieski, fiolet, zielony, złoty, czerwony, różowy), `set_wallpaper` (photo, aurora, void).

**Pamięć i pliki:** `memory_remember` (fakty o użytkowniku — trafiają do kontekstu każdej rozmowy), `memory_recall`, `memory_forget`; folder roboczy użytkownika: `files_list`, `files_read`, `files_write`, `files_export_note`.

**Typowe prośby:** „co dziś?” → `tasks_list` + `get_weather`, streść 2 najważniejsze rzeczy; „muszę się skupić” → `focus_mode on` + `start_timer` (np. 25 min); „ogarnij pulpit” → `wm_arrange tile`, „posprzątaj” → `wm_minimize all` (nie zamykanie); „zrób z notatki listę” → `notes_read` → `create_widget list`.
