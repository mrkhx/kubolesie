export const MOCK_CONSOLE_HTML = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Куболесье — mock VK</title>
  <style>
    :root {
      --bg: #0e1621;
      --panel: #17212b;
      --bubble: #182533;
      --mine: #2b5278;
      --text: #e8eef4;
      --muted: #8ba0b3;
      --accent: #6ab2f2;
      --line: #23303d;
      --ok: #71d28a;
    }
    * { box-sizing: border-box; }
    html, body { margin: 0; height: 100%; background: var(--bg); color: var(--text); font-family: "Segoe UI", system-ui, sans-serif; }
    body { display: grid; grid-template-columns: 1fr 320px; min-height: 100%; }
    header { padding: 14px 18px; border-bottom: 1px solid var(--line); display: flex; gap: 12px; align-items: center; }
    .avatar { width: 40px; height: 40px; border-radius: 50%; background: #3d6b99; display: grid; place-items: center; font-weight: 700; }
    .sub { color: var(--muted); font-size: 12px; }
    .chat { display: flex; flex-direction: column; min-height: 100vh; }
    .log { flex: 1; overflow: auto; padding: 18px; display: flex; flex-direction: column; gap: 12px; }
    .msg { max-width: 640px; background: var(--bubble); padding: 12px 14px; border-radius: 12px; white-space: pre-wrap; line-height: 1.45; }
    .msg.me { align-self: flex-end; background: var(--mine); }
    .btns { display: flex; flex-wrap: wrap; gap: 8px; max-width: 640px; }
    button, .chip {
      background: #1e2c3a; color: var(--text); border: 1px solid #31485c;
      border-radius: 10px; padding: 8px 12px; cursor: pointer; font: inherit;
    }
    button:hover { border-color: var(--accent); color: var(--accent); }
    .composer { display: flex; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
    input, select {
      background: #121b24; color: var(--text); border: 1px solid #31485c;
      border-radius: 10px; padding: 10px 12px; font: inherit; width: 100%;
    }
    aside { background: var(--panel); border-left: 1px solid var(--line); padding: 18px; overflow: auto; }
    aside h2 { font-size: 14px; margin: 18px 0 8px; color: var(--accent); text-transform: uppercase; letter-spacing: .06em; }
    aside h2:first-child { margin-top: 0; }
    pre { white-space: pre-wrap; font-size: 12px; color: #c9d7e4; margin: 0; }
    .ok { color: var(--ok); }
    @media (max-width: 900px) {
      body { grid-template-columns: 1fr; }
      aside { border-left: 0; border-top: 1px solid var(--line); }
    }
  </style>
</head>
<body>
  <section class="chat">
    <header>
      <div class="avatar">К</div>
      <div>
        <div>Куболесье</div>
        <div class="sub">Mock VK Adapter · Prototype 0.0.12 · чат-RPG, не Mini App</div>
      </div>
    </header>
    <div class="log" id="log"></div>
    <div class="btns" id="btns"></div>
    <form class="composer" id="form">
      <input id="vk" value="1001" style="max-width:120px" title="vk_user_id" />
      <input id="text" placeholder="текст: /start, лагерь, добыча, крафт, назад" />
      <button type="submit">Отправить</button>
    </form>
  </section>
  <aside>
    <h2>Событие</h2>
    <div class="sub">Каждое действие получает новый event_id. Повтор того же id ничего не делает второй раз.</div>
    <h2>Игрок</h2>
    <pre id="player">ещё нет</pre>
    <h2>Быстрые команды</h2>
    <div class="btns">
      <button type="button" data-cmd='START_GAME'>START_GAME</button>
      <button type="button" data-cmd='OPEN_CRATE'>OPEN_CRATE</button>
      <button type="button" data-cmd='GATHER_WOOD'>GATHER_WOOD</button>
      <button type="button" data-cmd='GATHER_STONE'>GATHER_STONE</button>
      <button type="button" data-cmd='GATHER_IRON'>GATHER_IRON</button>
      <button type="button" data-cmd='INSPECT_TOKEN'>INSPECT_TOKEN</button>
      <button type="button" data-cmd='BUILD_TEMP_SHELTER'>BUILD_TEMP_SHELTER</button>
      <button type="button" data-cmd='OPEN_CAMP'>OPEN_CAMP / меню</button>
      <button type="button" data-cmd='OPEN_INVENTORY'>OPEN_INVENTORY</button>
      <button type="button" data-cmd='EXPLORE'>EXPLORE</button>
    </div>
    <h2>Как пройти День 1</h2>
    <div class="sub">Ящик → рубить дерево (жетон) → осмотреть жетон → к дыму → помочь Рему → осыпь / кирка → штольня → железо ×8 → сдать → ночь. Отладка HP/флагов — только в этой панели, не в GameResponse.</div>
  </aside>
  <script>
    const log = document.getElementById('log');
    const btns = document.getElementById('btns');
    const playerBox = document.getElementById('player');
    const vkInput = document.getElementById('vk');
    const textInput = document.getElementById('text');

    function add(text, mine = false) {
      const el = document.createElement('div');
      el.className = 'msg' + (mine ? ' me' : '');
      el.textContent = text;
      log.appendChild(el);
      log.scrollTop = log.scrollHeight;
    }

    async function inspect() {
      const vk = vkInput.value.trim();
      const res = await fetch('/v1/players/' + encodeURIComponent(vk));
      if (!res.ok) { playerBox.textContent = 'игрок ещё не создан'; return; }
      const data = await res.json();
      playerBox.textContent = JSON.stringify(data, null, 2);
    }

    async function send(action, payload = {}, text = '') {
      const vk = vkInput.value.trim() || '1001';
      const event_id = crypto.randomUUID();
      const body = { event_id, vk_user_id: vk, action, payload, text, name: 'Путник' };
      add((text || action) + '', true);
      const res = await fetch('/v1/mock/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        add('ошибка: ' + (data.message || res.status));
        return;
      }
      add(data.game.text);
      btns.innerHTML = '';
      for (const button of data.game.buttons || []) {
        const b = document.createElement('button');
        b.textContent = button.label;
        b.onclick = () => send(button.action, button.payload || {});
        btns.appendChild(b);
      }
      await inspect();
    }

    document.getElementById('form').addEventListener('submit', (e) => {
      e.preventDefault();
      const text = textInput.value.trim();
      textInput.value = '';
      send(text ? undefined : 'START_GAME', {}, text);
    });
    document.querySelectorAll('[data-cmd]').forEach((el) => {
      el.addEventListener('click', () => send(el.dataset.cmd));
    });
    add('VK — только интерфейс. Игровая логика живёт в Game Core.\\nНажми START_GAME или напиши /start.\\nPrototype 0.0.12: Week 6 Заброшенный стан.');
  </script>
</body>
</html>
`;
