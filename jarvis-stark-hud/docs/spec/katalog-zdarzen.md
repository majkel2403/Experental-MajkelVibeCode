# Katalog zdarzeń (wygenerowany z kodu)

> Generuje `node tools/gen-spec.js`. Dwa kanały: **bus** (`J.ev.emit` — zdarzenia agenta, zasilają rdzeń, karty HUD i Process Log; mają `task_id`) i **ui** (`J.emit` — odświeżanie widoków).

| kanał | zdarzenie | gdzie powstaje |
|---|---|---|
| bus | `approval.requested` | main.js |
| bus | `approval.resolved` | main.js |
| bus | `judge.completed` | judge.js |
| bus | `judge.failed` | judge.js |
| bus | `judge.started` | judge.js |
| bus | `model.completed` | ai.js |
| bus | `model.failed` | ai.js |
| bus | `model.started` | ai.js |
| bus | `plan.created` | ai.js |
| bus | `plan.step` | process.js |
| bus | `security.injection` | ai.js |
| bus | `signal` | context.js |
| bus | `task.created` | ai.js, bridge.js, workflows.js |
| bus | `task.paused` | ai.js |
| bus | `task.recovering` | ai.js |
| bus | `task.resumed` | ai.js |
| bus | `task.verified` | ai.js |
| bus | `task.verifying` | ai.js |
| bus | `tool.completed` | ai.js, workflows.js |
| bus | `tool.failed` | ai.js, workflows.js |
| bus | `tool.started` | ai.js, bridge.js, workflows.js |
| ui | `action` | core.js |
| ui | `agent-ui` | registry.js |
| ui | `app-view` | apps-settings.js, apps.js, commands-ext.js |
| ui | `attach` | commands-w4.js |
| ui | `bridge` | bridge.js |
| ui | `dictation` | commands-w4.js |
| ui | `ear` | core.js |
| ui | `ear-standby` | core.js |
| ui | `files` | commands.js |
| ui | `fx` | main.js |
| ui | `hermes` | ai.js |
| ui | `history` | ai.js |
| ui | `judge` | judge.js |
| ui | `market` | apps.js |
| ui | `market-alert` | context.js |
| ui | `market-list` | apps.js |
| ui | `memory` | context.js |
| ui | `notes` | apps.js, commands-data.js, commands-w4.js, commands.js |
| ui | `plan` | commands-w4.js, events.js |
| ui | `proc-end` | process.js |
| ui | `routine-step` | commands-w4.js |
| ui | `routines` | commands-w4.js |
| ui | `settings` | apps-settings.js, apps.js, bridge.js, commands-ext.js, commands-w4.js, commands.js, core.js, main.js |
| ui | `shortcuts` | apps.js, commands-ext.js, commands.js |
| ui | `signal` | context.js |
| ui | `task-due` | context.js |
| ui | `task-overdue` | context.js |
| ui | `tasks` | apps.js, commands-data.js, commands.js |
| ui | `thread` | apps.js, commands-ext.js |
| ui | `timer` | apps.js, commands.js |
| ui | `timer-ended` | apps.js |
| ui | `ui-mode` | commands-ext.js |
| ui | `undo-done` | undo.js |
| ui | `undo-offer` | undo.js |
| ui | `undo-stack` | undo.js |
| ui | `voice` | core.js |
| ui | `voice-command` | core.js |
| ui | `weather` | apps.js |
| ui | `wm` | commands-data.js, core.js, main.js |
| ui | `wm-resize` | core.js |
| ui | `workflows` | workflows.js |
