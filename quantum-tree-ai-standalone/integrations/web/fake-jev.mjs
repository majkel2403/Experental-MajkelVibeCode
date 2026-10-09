/* Atrapa Jeva do testów i prób „na sucho” (JARVIS_FAKE_JEV=1) — deterministyczne reguły zamiast modelu.
   Zwraca odpowiedzi w dokładnie takim kształcie, jaki daje prawdziwy Jev (choice / noul / score), więc cała reszta
   (polityka, egzekutor Playwright, warstwa HTTP) działa naprawdę. NIE służy do codziennej pracy. */
const ch = (c, conf = 0.95, extra = {}) => ({ type: 'choice', choice: c, confidence: conf, probabilities: { [c]: conf, ...extra } });
const SITES = ['google', 'duckduckgo', 'youtube', 'wikipedia', 'github', 'amazon', 'reddit', 'hacker_news', 'example_com'];
const words = s => String(s || '').toLowerCase().match(/[a-z0-9ąćęłńóśźż]+/g) || [];

export function makeFakeDecide(buildRequest) {
  return async function fakeDecide(input, { signal } = {}) {
    if (signal?.aborted) { const e = new Error('aborted'); e.name = 'AbortError'; throw e; }
    const { state, candidates } = buildRequest(input);
    const t = String(input.transcript || '').toLowerCase().trim();
    const els = input.snapshot?.elements || [];
    let intent = ch('none', 0.9), target = ch('none', 0.9), site = ch('none'), destructive = 0.02;
    let m;
    if (/^(confirm|yes|do it|go ahead)\b/.test(t)) intent = ch('confirm');
    else if (/^(cancel|never mind|stop)\b/.test(t)) intent = ch('cancel');
    else if ((m = /^(?:go to|open|visit|take me to)\s+(.+)$/.exec(t))) {
      intent = ch('navigate_url');
      const s = SITES.find(x => m[1].replace(/\s+/g, '_').startsWith(x.replace('_com', '')) || m[1].includes(x));
      if (s) site = ch(s);
    } else if ((m = /^(?:search|look up|google|find)\s+(?:for\s+)?(.+)$/.exec(t))) {
      intent = ch('search_web');
      const s = SITES.find(x => new RegExp('\\b(on|in)\\s+' + x.replace('_', ' ') + '\\b').test(t) || t.includes(x + ' for'));
      if (s) site = ch(s);
    } else if ((m = /^click\s+(.+)$/.exec(t))) {
      intent = ch('click_element');
      const ORD = { first: 0, '1st': 0, second: 1, '2nd': 1, third: 2, '3rd': 2 };
      const ord = words(m[1]).find(w => w in ORD);
      const want = words(m[1]).filter(w => !['the', 'a', 'on', 'link', 'button', 'result', ...Object.keys(ORD)].includes(w));
      let scored = els.map(e => ({ id: e.id, s: want.filter(w => words(e.text + ' ' + (e.placeholder || '')).includes(w)).length })).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
      if (ord !== undefined && !want.length) {   // „pierwszy / drugi wynik”: n-ty link (z „result” w opisie, jeśli tak powiedziano)
        const pool = els.filter(e => e.role === 'link' && (!/result/.test(m[1]) || /result/i.test(e.text)));
        scored = pool[ORD[ord]] ? [{ id: pool[ORD[ord]].id, s: 1 }] : [];
      }
      if (scored.length === 1 || (scored.length > 1 && scored[0].s > scored[1].s)) target = ch(scored[0].id);
      else if (scored.length > 1) target = ch(scored[0].id, 0.2, { [scored[1].id]: 0.4, none: 0.2 });
      if (/\b(buy|delete|remove|send|pay|checkout|order|post)\b/.test(t) || /\b(buy|delete|send|pay|checkout|order)\b/i.test(els.find(e => e.id === target.choice)?.text || '')) destructive = 0.9;
    } else if (/^(?:type|enter|write)\b/.test(t)) intent = ch('type_into_field');
    else if (/^scroll down|^page down|^go to the bottom/.test(t)) intent = ch('scroll_down');
    else if (/^scroll up|^page up|^back to the top/.test(t)) intent = ch('scroll_up');
    else if (/^(?:go back|back|undo|previous page)\b/.test(t)) intent = ch('go_back');
    else if (/^(?:go forward|forward)\b/.test(t)) intent = ch('go_forward');
    else if (/^(?:reload|refresh)\b/.test(t)) intent = ch('reload');
    else if (/^(?:open a new tab|new tab)\b/.test(t)) intent = ch('open_new_tab');
    else if (/^close (?:this )?tab\b/.test(t)) intent = ch('close_tab');
    else if (/^(?:next tab|switch tab)\b/.test(t)) intent = ch('switch_tab');
    const answers = {
      intent, target, site,
      complete: { noul: 0.95 },
      is_command: { noul: intent.choice === 'none' ? 0.05 : 0.95 },
      destructive: { noul: destructive },
      scroll_amount: { score: /a bit|little/.test(t) ? 0 : /bottom|top|end/.test(t) ? 2 : 1, confidence: 0.9, probabilities: {} },
      tab_direction: ch('none')
    };
    if (candidates.text.length) answers.text_span = ch(candidates.text[0]);
    if (candidates.url.length) answers.url_span = ch(candidates.url[0]);
    return { answers, candidates, latencyMs: 4, usage: { input_tokens: 0, output_tokens: 0 }, costUsd: 0, model: 'fake-jev', requestId: 'fake', state, questionCount: Object.keys(answers).length };
  };
}
