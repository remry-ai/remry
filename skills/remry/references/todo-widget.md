# Todo list widget

The template for showing todos in chat as an inline widget (see "Showing todos" in SKILL.md). Fill
`TODOS` and `NOTEBOOK`, and keep the rest. Pass the result as the widget's code, with a title like
`remry_todos_work`.

- `TODOS`: one object per todo, from `todo.list`, `todo.forEntity` or `home.todos`:
  `{id, title, status, priority, targetDate, entityLabel, url}`. `targetDate` is the first ten
  characters of the todo's `targetDate` (`YYYY-MM-DD`) or `null`, and `url` is the todo's app link
  (see "Links to what you changed").
- `NOTEBOOK`: the notebook id, so the request it sends names the notebook.
- Order them overdue first, then by date (none last), then by priority (highest first).

The user ticks todos done, moves dates and changes priorities. Nothing is saved until they press
**Save changes**: that sends one message listing every change by todo id, and you make them with
`todo_update` (see SKILL.md).

```html
<h2 class="sr-only">Your open Remry todos, with controls to mark them done, change their dates and priorities</h2>
<style>
.rt-row{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:10px;align-items:center;padding:10px 0;border-bottom:0.5px solid var(--border)}
.rt-row.done .rt-title{text-decoration:line-through;color:var(--text-muted)}
.rt-title{font-size:15px;margin:0}
.rt-meta{font-size:13px;color:var(--text-secondary);margin:2px 0 0}
.rt-late{color:var(--text-danger)}
.rt-ctl{display:flex;gap:6px;align-items:center}
.rt-ctl select,.rt-ctl input[type=date]{font-size:13px;height:30px}
</style>
<div id="rt-list"></div>
<div style="display:flex;gap:12px;align-items:center;margin-top:1rem">
  <button id="rt-save">Save changes ↗</button>
  <span id="rt-status" style="font-size:13px;color:var(--text-secondary)"></span>
</div>
<script>
const NOTEBOOK = 'work';
const TODOS = [
  {id:'abc123',title:'Book 1:1 with Dana',status:'PENDING',priority:2,targetDate:'2026-10-09',entityLabel:'Dana Park',url:'http://127.0.0.1:5173/app/todos?popup=todo&todo=abc123&notebook=work'}
];
const PRIORITY = ['None','Low','Medium','High'];
const today = new Date().toLocaleDateString('en-CA');
const addDays = (d,n) => { const t = new Date((d||today)+'T00:00:00Z'); t.setUTCDate(t.getUTCDate()+n); return t.toISOString().slice(0,10); };
const label = d => new Date(d+'T00:00:00Z').toLocaleDateString(undefined,{month:'short',day:'numeric',timeZone:'UTC'});
const edits = {};
const list = document.getElementById('rt-list');
const status = document.getElementById('rt-status');
const changed = () => Object.values(edits).filter(e => Object.keys(e).length).length;
const show = () => { const n = changed(); status.textContent = n ? n + (n === 1 ? ' todo changed' : ' todos changed') : ''; };
const set = (id, field, value, original) => { edits[id] = edits[id] || {}; if (value === original) delete edits[id][field]; else edits[id][field] = value; show(); };
TODOS.forEach(t => {
  const row = document.createElement('div');
  row.className = 'rt-row';
  const late = t.targetDate && t.targetDate < today;
  const due = t.targetDate ? '<span class="' + (late ? 'rt-late' : '') + '">' + (late ? 'Overdue, ' : 'Due ') + label(t.targetDate) + '</span>' : 'No date';
  row.innerHTML =
    '<input type="checkbox" aria-label="Done">' +
    '<div><p class="rt-title"></p><p class="rt-meta">' + due + (t.entityLabel ? ' · <span class="rt-on"></span>' : '') + ' · <a href="' + t.url + '">Open</a></p></div>' +
    '<div class="rt-ctl"><select aria-label="Move the date"><option value="">Date</option><option value="1">Tomorrow</option><option value="7">In a week</option><option value="pick">Pick…</option><option value="clear">No date</option></select>' +
    '<input type="date" aria-label="New date" style="display:none"><select aria-label="Priority">' + PRIORITY.map((p,i) => '<option value="' + i + '"' + (i === t.priority ? ' selected' : '') + '>' + p + '</option>').join('') + '</select></div>';
  row.querySelector('.rt-title').textContent = t.title;
  if (t.entityLabel) row.querySelector('.rt-on').textContent = t.entityLabel;
  const [done, move, pick, prio] = row.querySelectorAll('input[type=checkbox], select, input[type=date]');
  done.onchange = () => { row.classList.toggle('done', done.checked); set(t.id, 'status', done.checked ? 'COMPLETE' : t.status, t.status); };
  move.onchange = () => {
    pick.style.display = move.value === 'pick' ? '' : 'none';
    if (move.value === 'pick') return;
    const next = move.value === '' ? t.targetDate : move.value === 'clear' ? null : addDays(today, Number(move.value));
    set(t.id, 'targetDate', next, t.targetDate);
  };
  pick.onchange = () => set(t.id, 'targetDate', pick.value || t.targetDate, t.targetDate);
  prio.onchange = () => set(t.id, 'priority', Number(prio.value), t.priority);
  list.appendChild(row);
});
document.getElementById('rt-save').onclick = () => {
  const lines = TODOS.filter(t => edits[t.id] && Object.keys(edits[t.id]).length).map(t =>
    '- ' + t.id + ' (' + t.title + '): ' + Object.entries(edits[t.id]).map(([k,v]) => k + ' ' + (v === null ? 'null' : v)).join(', '));
  if (!lines.length) { status.textContent = 'Change a todo first'; return; }
  sendPrompt('Update these Remry todos in notebook ' + NOTEBOOK + ' with todo_update:\n' + lines.join('\n'));
};
</script>
```
