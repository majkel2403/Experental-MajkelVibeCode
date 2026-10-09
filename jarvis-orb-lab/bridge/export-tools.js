/* Zapisuje definicje narzędzi z Command Registry do bridge/tools.json — migawka, którą most MCP
   pokazuje Hermesowi od startu (zanim otworzysz kartę Jarvis OS). Uruchom po zmianie js/commands.js:
     node bridge/export-tools.js            (zapis)
     node bridge/export-tools.js --check    (kod 1, gdy migawka jest nieaktualna — CI) */
'use strict';
const fs = require('fs'), path = require('path');
const { load } = require('../tests/harness');
const J = load();
const tools = J.registry.tools().map(t => t.function);
const out = JSON.stringify(tools, null, 1) + '\n';
const file = path.join(__dirname, 'tools.json');
if (process.argv.includes('--check')) {
  const cur = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  if (cur !== out) { console.error('bridge/tools.json jest nieaktualny — uruchom: node bridge/export-tools.js'); process.exit(1); }
  console.log('bridge/tools.json aktualny (' + tools.length + ' narzędzi)');
} else { fs.writeFileSync(file, out); console.log('Zapisano ' + tools.length + ' narzędzi do ' + file); }
