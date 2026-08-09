const log = document.getElementById('chat-log');
const form = document.getElementById('composer');
const input = document.getElementById('message');
const profilesList = document.getElementById('profiles-list');
const modePill = document.getElementById('mode-pill');
const statusTitle = document.getElementById('status-title');
const statusSubtitle = document.getElementById('status-subtitle');

let knowledge = null;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMarkup(text) {
  const escaped = escapeHtml(text);
  const withLinks = escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noreferrer noopener">$1</a>');
  const withBold = withLinks.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const withItalic = withBold.replace(/(^|[^*])\*(?!\s)(.+?)(?<!\s)\*(?!\*)/g, '$1<em>$2</em>');
  return withItalic.replace(/\n/g, '<br>');
}

function addMessage(role, text) {
  const row = document.createElement('div');
  row.className = `msg ${role}`;
  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.innerHTML = renderMarkup(text);
  row.appendChild(bubble);
  log.appendChild(row);
  log.scrollTop = log.scrollHeight;
}

async function loadKnowledge() {
  const res = await fetch('/api/knowledge');
  knowledge = await res.json();
  profilesList.innerHTML = knowledge.perfis_publico.map(p => `<li><strong>${p.nome}</strong><br><small>${p.tags.join(' · ')}</small></li>`).join('');
}

function updateStatus(data) {
  if (data.source_mode === 'web') {
    modePill.textContent = 'Modo online';
    statusTitle.textContent = 'Resposta buscada na web';
    statusSubtitle.textContent = 'A resposta veio só de fontes confiáveis e foi salva para curadoria.';
    return;
  }
  if (data.source_mode === 'local' && !data.recommendations?.length) {
    modePill.textContent = 'Modo local';
    statusTitle.textContent = 'Sem cobertura local';
    statusSubtitle.textContent = 'A pergunta foi registrada para virar nova base de conhecimento.';
    return;
  }

  modePill.textContent = 'Modo local';
  statusTitle.textContent = data.recommendations?.length ? 'Sugestões geradas' : 'Pronto para nova busca';
  statusSubtitle.textContent = data.cta ? `Próximo passo: ${data.cta}` : 'Base carregada.';
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

  if (Array.isArray(data.sources) && data.sources.length) {
    const sourceLines = data.sources.map((s) => `• ${s.title} — ${s.url}`);
    addMessage('bot', `Fontes usadas:\n${sourceLines.join('\n')}`);
  }

  updateStatus(data);
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
  modePill.textContent = 'Modo local';
})();
