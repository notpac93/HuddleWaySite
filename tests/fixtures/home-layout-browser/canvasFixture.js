// An explicitly labeled message-transport fixture, not a consumer-app renderer.
// DOM identities remain stable so transport echoes never reset text selection.
export function mountCanvasFixture(initialPage) {
  document.body.innerHTML = '<main><small>LOCAL TRANSPORT FIXTURE · SCHEMATIC APP</small><h1>Home</h1><div id="sections"></div><div id="last-add"></div></main>';
  const css = document.createElement('style');
  css.textContent = `body{margin:0;background:#f8fafc;color:#10213d;font:16px/1.5 system-ui}main{padding:20px}small{font-size:10px;color:#64748b}h1{font-size:20px}.section{position:relative;margin:12px 0;padding:40px 20px 44px;background:white;border:1px solid #dce2eb;border-radius:14px}.editing .section{border:1px dashed #155eef}.wording{font-size:22px;font-weight:700;white-space:pre-wrap;min-height:30px}.editing .wording{outline:1px solid #155eef;outline-offset:3px;cursor:text}.wording:focus{background:#eff6ff;outline:2px solid #155eef}.actions{display:flex;gap:3px;justify-content:flex-end;margin-bottom:12px;font-size:11px}button,select{min-height:36px;padding:5px 8px;border:1px solid #dce2eb;border-radius:8px;background:white;color:#155eef;font:12px system-ui}.insertion{width:100%;border-style:dashed;border-color:#155eef}.actions[hidden]{display:none}`;
  document.head.append(css);
  const query = new URLSearchParams(location.search);
  const envelope = { protocolVersion: 1, tenantId: query.get('forcedTenant'), environment: 'dev', sessionId: query.get('previewSession'), nonce: query.get('previewNonce') };
  const parentOrigin = 'http://127.0.0.1:8892';
  const post = (type, extra = {}) => parent.postMessage(JSON.stringify({ ...envelope, type: `huddleway.crm.preview.${type}`, ...extra }), parentOrigin);
  let page = null, sequence = 0;
  const send = (action, detail = {}) => post('canvas-action', { sequence: ++sequence, action: { action, pageId: page.id, editSessionId: page.editSessionId, ...detail } });
  const roots = new Map();
  const button = (label, action) => { const node = document.createElement('button'); node.textContent = label; node.onclick = action; return node; };
  function insertion(beforeId) {
    const select = document.createElement('select'); select.className = 'insertion'; select.setAttribute('aria-label', 'Add component here');
    select.add(new Option('+ Add here…', ''));
    for (const item of page.availableComponents || []) select.add(new Option(item.label, item.id));
    select.onchange = () => { if (select.value) send('add', { beforeId, definitionId: select.value }); select.value = ''; };
    return select;
  }
  function render(next) {
    page = next; document.body.classList.toggle('editing', !!page.editMode);
    const list = document.getElementById('sections');
    const visible = page.components.filter((item) => item.enabled && item.isVisible);
    for (const [id, root] of roots) if (!visible.some((item) => item.id === id)) { root.remove(); roots.delete(id); }
    visible.forEach((item, index) => {
      let root = roots.get(item.id);
      if (!root) { root = document.createElement('article'); root.className = 'section'; root.insert = document.createElement('div'); root.actions = document.createElement('div'); root.actions.className = 'actions'; root.fields = document.createElement('div'); root.append(root.insert, root.actions, root.fields); roots.set(item.id, root); }
      root.insert.replaceChildren(); root.actions.replaceChildren(); root.actions.hidden = !page.editMode;
      const hero = item.type === 'hero_section';
      if (page.editMode && !hero && !page.provisionalId) root.insert.append(insertion(item.id));
      if (page.provisionalId === item.id) {
        root.actions.append('Not added yet', button('Cancel', () => send('cancel-add')), button('Add here', () => send('confirm-add')));
      } else if (hero) root.actions.append('Hero · Pinned');
      else root.actions.append(item.label, button('↑', () => send('move-up', { componentId: item.id })), button('↓', () => send('move-down', { componentId: item.id })), button('Remove', () => send('remove', { componentId: item.id })));
      const fields = page.editableFields?.[item.id] || [];
      for (const field of fields) {
        let target = root.fields.querySelector(`[data-field="${field.id}"]`);
        if (!target) {
          target = document.createElement('div'); target.className = 'wording'; target.dataset.field = field.id; target.setAttribute('aria-label', `Edit ${field.label}`); root.fields.append(target);
          let cancelling = false;
          const tools = document.createElement('div'); tools.className = 'actions'; tools.hidden = true;
          const done = button('Done', () => target.blur());
          const cancel = button('Cancel', () => { cancelling = true; send('text-cancel', { componentId: item.id, fieldId: field.id }); target.blur(); });
          for (const control of [cancel, done]) control.onpointerdown = (event) => event.preventDefault();
          tools.append(cancel, done); root.fields.append(tools);
          target.onfocus = () => { tools.hidden = false; send('text-begin', { componentId: item.id, fieldId: field.id }); };
          target.oninput = () => send('text-change', { componentId: item.id, fieldId: field.id, value: target.textContent.slice(0, field.maxLength || 20000) });
          target.onblur = () => { tools.hidden = true; if (!cancelling) send('text-end', { componentId: item.id, fieldId: field.id }); cancelling = false; };
          target.onkeydown = (event) => { if (event.key === 'Escape') { cancelling = true; send('text-cancel', { componentId: item.id, fieldId: field.id }); target.blur(); } };
        }
        target.contentEditable = page.editMode ? 'true' : 'false';
        if (document.activeElement !== target) target.textContent = String(item.content[field.id] || item.label);
      }
      if (list.children[index] !== root) list.insertBefore(root, list.children[index] || null);
    });
    const last = document.getElementById('last-add'); last.replaceChildren();
    if (page.editMode && !page.provisionalId) last.append(insertion(null));
  }
  addEventListener('message', (event) => {
    if (event.origin !== parentOrigin || event.source !== parent) return;
    let data; try { data = JSON.parse(event.data); } catch { return; }
    if (Object.entries(envelope).some(([key, value]) => data[key] !== value)) return;
    if (data.pageDraft) render(data.pageDraft);
    post('applied', { revision: data.revision });
  });
  render(initialPage);
  post('ready', { sourceCommit: 'local-unattested', releaseId: 'local-unattested', capabilities: ['page-layout-v1', 'canvas-edit-v1'] });
}
