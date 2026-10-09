/* Atrapa usługi Jev (OpenRouter /systemone) do testów: odpowiada według reguł, zapisuje wywołania, potrafi symulować awarie.
   Reguły: [{ re, intent, conf, alts:{id:p}, destructive, clarify, current, act, slots:{prop:wartość}, slotConf }] — dopasowanie po polu utterance. */
'use strict';
function makeJev(rules = [], opts = {}) {
  const calls = []; const ctl = { fail: null, status: 200, delay: 0, aligned: .9, overreach: .05, inj: .05, durable: .9, sensitive: .05, answer: null, answerConf: .95, grounded: .9, score: 1, ...opts };
  const fetch = async (url, init) => {
    const body = JSON.parse(init.body); calls.push({ url, body, auth: init.headers.Authorization });
    if (ctl.delay) await new Promise((res, rej) => { const t = setTimeout(res, ctl.delay); init.signal?.addEventListener('abort', () => { clearTimeout(t); const e = new Error('aborted'); e.name = 'AbortError'; rej(e); }); });   // jak prawdziwy fetch: przerwanie kończy żądanie
    if (ctl.fail === 'network') throw new TypeError('sieć');
    if (ctl.status !== 200) return { ok: false, status: ctl.status, json: async () => ({ error: { message: 'błąd testowy' } }) };
    if (ctl.fail === 'garbage') return { ok: true, status: 200, json: async () => ({ answers: { intent: { type: 'choice', choice: 'nie_ma_takiej_opcji', confidence: .99 } } }) };
    /* reguły piszemy bez polskich znaków */
    const u = String(body.state.utterance || '').toLowerCase().replace(/[ąćęłńóśźż]/g, c => ({ ą: 'a', ć: 'c', ę: 'e', ł: 'l', ń: 'n', ó: 'o', ś: 's', ź: 'z', ż: 'z' })[c]); const rule = rules.find(r => r.re.test(u)) || {};
    const answers = {};
    for (const [id, q] of Object.entries(body.questions)) {
      const optKeys = q.type === 'choice' ? Object.keys(q.criteria) : [];
      if (id === 'intent') { const intent = optKeys.includes(rule.intent) ? rule.intent : 'unclear', conf = rule.conf ?? .95; answers[id] = { type: 'choice', choice: intent, confidence: conf, probabilities: { [intent]: conf, ...(rule.alts || {}) } }; }
      else if (id === 'destructive') answers[id] = { type: 'noul', noul: rule.destructive ?? .05 };
      else if (id === 'clarify') answers[id] = { type: 'noul', noul: rule.clarify ?? .05 };
      else if (id === 'current') answers[id] = { type: 'noul', noul: rule.current ?? .05 };
      else if (id === 'act') answers[id] = { type: 'choice', choice: rule.act || 'new_request', confidence: rule.actConf ?? .9, probabilities: {} };
      else if (id.startsWith('slot_')) { const v = rule.slots?.[id.slice(5)]; answers[id] = { type: 'choice', choice: v && optKeys.includes(v) ? v : 'none', confidence: rule.slotConf ?? .95, probabilities: {} }; }
      else if (id === 'aligned') answers[id] = { type: 'noul', noul: ctl.aligned };
      else if (id === 'overreach') answers[id] = { type: 'noul', noul: ctl.overreach };
      else if (id === 'inj') answers[id] = { type: 'noul', noul: ctl.inj };
      else if (id === 'durable') answers[id] = { type: 'noul', noul: ctl.durable };
      else if (id === 'sensitive') answers[id] = { type: 'noul', noul: ctl.sensitive };
      else if (id === 'grounded') answers[id] = { type: 'noul', noul: ctl.grounded };
      else if (id === 'ans') { const c = ctl.answer && optKeys.includes(ctl.answer) ? ctl.answer : 'unclear'; answers[id] = { type: 'choice', choice: c, confidence: ctl.answerConf, probabilities: {} }; }
      else if (id === 'urgency' || /^n\d+$/.test(id)) answers[id] = { type: 'score', score: typeof ctl.score === 'function' ? ctl.score(id) : ctl.score, confidence: .8, probabilities: {} };
      else if (id === 'pick') answers[id] = { type: 'choice', choice: optKeys[0], confidence: .9, probabilities: {} };
      else if (id === 'lang') answers[id] = { type: 'noul', noul: .99 };
    }
    return { ok: true, status: 200, json: async () => ({ model: 'jev-1.13.0', answers, usage: { input_tokens: 3000, output_tokens: 20, cost: 0.000126 } }) };
  };
  return { fetch, calls, ctl };
}
module.exports = { makeJev };
