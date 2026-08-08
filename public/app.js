const log = document.getElementById('chat-log');
const form = document.getElementById('composer');
const input = document.getElementById('message');
const profilesList = document.getElementById('profiles-list');
const modePill = document.getElementById('mode-pill');
const statusTitle = document.getElementById('status-title');
const statusSubtitle = document.getElementById('status-subtitle');

let knowledge = null;

function addMessage(role, text) {
  const row = document.createElement('div');
  row.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = text.replace(/\n/g, '<br>');
  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function loadKnowledge() {
  const res = await fetch('/api/knowledge');
  knowledge = await res.json();
  profilesList.innerHTML = knowledge.perfis_publico.map(p => `<li><strong>${p.nome}</strong><br><small>${p.tags.join(' · ')}</small></li>`).join('');
}

async function sendMessage(message) {
  addMessage('user', message);
  statusTitle.textContent = 'Analisando interesse...';
  statusSubtitle.textContent = 'Buscando roteiros e experiências compatíveis.';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  const data = await res.json();
  addMessage('bot', data.reply || 'Sem resposta.');
  statusTitle.textContent = data.recommendations?.length ? 'Sugestões geradas' : 'Pronto para nova busca';
  statusSubtitle.textContent = data.cta ? `Próximo passo: ${data.cta}` : 'Base carregada.';
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const message = input.value.trim();
  if (!message) return;
  input.value = '';
  sendMessage(message);
});

document.querySelectorAll('[data-q]').forEach(btn => {
  btn.addEventListener('click', () => sendMessage(btn.dataset.q));
});

(async function init() {
  addMessage('bot', 'Olá! Eu sou o SAOROQUE_XP. Me diga se você quer vinho, casal, família, 60+, sunset ou história em São Roque.');
  await loadKnowledge();
  modePill.textContent = 'Modo local ativo';
})();
