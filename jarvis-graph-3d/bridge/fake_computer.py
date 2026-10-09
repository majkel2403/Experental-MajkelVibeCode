"""Atrapa clickera do testów mostu (JARVIS_COMPUTER_CMD): drukuje jak prawdziwy runner, zapisuje run.json, kończy się kodem.
Zachowanie wybiera początek celu: "hang…" wisi 2 min, "abort…" kończy jak przerwanie w rogu (130), "fail…" kod 1."""
import json
import sys
import time
from pathlib import Path

goal, out = sys.argv[1], Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
print(f"run folder: {out}", flush=True)
print("driving the machine. abort: Ctrl-C, or slam the mouse into the top-left corner", flush=True)
if goal.startswith("hang"):
    time.sleep(120)
for i in (1, 2):
    print(f"step {i}: click 'Zapisz' (0.91)", flush=True)
    time.sleep(0.25)
aborted = goal.startswith("abort")
(out / "run.json").write_text(json.dumps({
    "goal": goal, "outcome": "aborted (mouse in top-left corner)" if aborted else "done",
    "answer": "Gotowe: zrobiłem to, o co prosiłeś.", "goal_achieved": not aborted, "steps_taken": 2, "seconds": 0.5,
}, ensure_ascii=False), encoding="utf-8")
sys.exit(130 if aborted else 1 if goal.startswith("fail") else 0)
