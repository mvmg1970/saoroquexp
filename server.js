const http = require('http');
const fs = require('fs');
const path = require('path');
const { webFallback } = require('./services/web_fallback');

const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const KNOWLEDGE_PATH = path.join(ROOT, 'knowledge', 'base.json');

let knowledge = null;

function loadKnowledge() {
  const raw = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
  knowledge = JSON.parse(raw);
  return knowledge;
}

function send(res, status, body, headers = {}) {
  const isObject = body && typeof body === 'object' && !Buffer.isBuffer(body);
  const payload = isObject ? JSON.stringify(body) : body;
  res.writeHead(status, {
    'Content-Type': isObject ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(payload);
}

function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
  };
  if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    return false;
  }
  const body = fs.readFileSync(filePath);
  res.writeHead(200, {
    'Content-Type': contentTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-store' : 'public, max-age=300',
  });
  res.end(body);
  return true;
}

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(/[^a-z0-9+]+/).filter(Boolean);
}

function inferProfile(message) {
  const t = normalize(message);
  if (/60\+|terceira idade|idos|senior|sênior/.test(t)) return 'perf-60plus';
  if (/casal|romant|lua de mel|namor/.test(t)) return 'perf-casais';
  if (/famil|crianc|kids/.test(t)) return 'perf-familias';
  if (/grupo|turma|amigos|galera/.test(t)) return 'perf-grupos';
  if (/vinho|degust|enotur|enologo|sommelier/.test(t)) return 'perf-amantes-vinho';
  if (/historia|patrimonio|igreja|relig/i.test(t)) return 'perf-historia';
  if (/comida|gastr|almoço|jantar|harmon/.test(t)) return 'perf-gastronomos';
  if (/empresa|corpor|team|evento/.test(t)) return 'perf-corporativo';
  return null;
}

function detectRoute(message) {
  const t = normalize(message);
  if (/centro|igreja|matriz|brasital|taboao|santo antonio/.test(t)) return 'RC';
  if (/sunset|pôr do sol|por do sol|saboo|mirante|morro/.test(t)) return 'RS';
  if (/vinho|vinic|goes|olivardo|bela aurora|palmeiras|degust/.test(t)) return 'RV';
  return null;
}

function scoreExperience(exp, profileId, routeId, message) {
  const profile = profileId ? knowledge.perfis_publico.find(p => p.id === profileId) : null;
  const messageTokens = new Set(tokenize(message));
  const expTags = new Set(exp.perfis_recomendados || []);
  let score = 0;
  if (profile) {
    for (const tag of profile.tags) if (expTags.has(tag)) score += 2;
  }
  if (routeId && exp.roteiro_id === routeId) score += 1;
  for (const tag of expTags) if (messageTokens.has(tag.replace(/_/g, ''))) score += 1;
  if (profileId === 'perf-60plus' && /leve|tranquilo|sem pressa|acess/.test(normalize(exp.descricao))) score += 1;
  if (profileId === 'perf-casais' && /romant|sunset|luar|jantar/.test(normalize(exp.descricao))) score += 1;
  if (profileId === 'perf-familias' && /famil|crian|fazend|passeio/.test(normalize(exp.descricao))) score += 1;
  return score;
}

function recommend(message) {
  const routeId = detectRoute(message);
  const profileId = inferProfile(message) || (routeId === 'RV' ? 'perf-amantes-vinho' : null);
  const entries = knowledge.experiencias
    .map(exp => ({ exp, score: scoreExperience(exp, profileId, routeId, message) }))
    .filter(item => item.score >= 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ exp, score }) => ({
      id: exp.id,
      nome: exp.nome,
      roteiro_id: exp.roteiro_id,
      descricao: exp.descricao,
      perfil_match: profileId,
      score,
      transacional: exp.transacional,
    }));

  const route = routeId ? knowledge.roteiros.find(r => r.id === routeId) : null;
  return { profileId, routeId, route, recommendations: entries, maxScore: entries[0]?.score || 0 };
}

function buildLocalReply(message, rec) {
  const routeName = rec.route ? rec.route.nome : null;
  const profileLabel = rec.profileId ? (knowledge.perfis_publico.find(p => p.id === rec.profileId)?.nome || rec.profileId) : 'público geral';

  const introParts = [];
  if (routeName) introParts.push(`Pelo que você pediu, o roteiro mais indicado é **${routeName}**.`);
  introParts.push(`Pensei no perfil **${profileLabel}**.`);

  let reply = introParts.join(' ');
  if (rec.recommendations.length) {
    const lines = rec.recommendations.map((item, i) => `${i + 1}. **${item.nome}** — ${item.descricao}`);
    reply += `\n\nMinhas melhores sugestões:\n${lines.join('\n')}`;
  } else {
    reply += '\n\nNão achei uma experiência com match forte na base local. Posso filtrar por vinho, sunset, família, casais ou história.';
  }

  return {
    reply,
    profile: rec.profileId,
    route: routeName,
    recommendations: rec.recommendations,
    cta: rec.recommendations.length ? 'Quero atendimento humano' : 'Refinar busca',
    source_mode: 'local',
    sources: [],
  };
}

async function buildReply(message) {
  const text = String(message || '').trim();
  if (!text) {
    return {
      reply: 'Me diga seu perfil ou interesse — por exemplo: vinhos, casais, família, 60+ ou sunset.',
      cta: 'Explorar sugestões',
      profile: null,
      route: null,
      recommendations: [],
      source_mode: 'local',
      sources: [],
    };
  }

  const rec = recommend(text);
  const strongLocalMatch = rec.recommendations.length > 0 || rec.route || rec.maxScore >= 3;

  if (strongLocalMatch) {
    return buildLocalReply(text, rec);
  }

  const web = await webFallback(text);
  if (web) {
    return {
      reply: web.reply,
      profile: rec.profileId,
      route: rec.route ? rec.route.nome : null,
      recommendations: [],
      cta: 'Quero atendimento humano',
      source_mode: 'web',
      sources: web.sources || [],
    };
  }

  return {
    reply: 'Não encontrei cobertura suficiente na base local nem em fontes web confiáveis agora. Tente reformular com mais detalhes, como local, atração ou período do passeio.',
    cta: 'Refinar busca',
    profile: rec.profileId,
    route: rec.route ? rec.route.nome : null,
    recommendations: [],
    source_mode: 'local',
    sources: [],
  };
}

function jsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1e6) {
        reject(new Error('payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });
}

async function handler(req, res) {
  if (!knowledge) loadKnowledge();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const { pathname } = url;

  if (req.method === 'GET' && pathname === '/health') {
    return send(res, 200, { ok: true, service: 'saoroque_xp' });
  }

  if (req.method === 'GET' && pathname === '/api/knowledge') {
    return send(res, 200, knowledge);
  }

  if (req.method === 'GET' && pathname === '/api/suggestions') {
    const q = url.searchParams.get('q') || '';
    return send(res, 200, await buildReply(q));
  }

  if (req.method === 'POST' && pathname === '/api/chat') {
    try {
      const body = await jsonBody(req);
      const message = body.message || body.text || '';
      return send(res, 200, await buildReply(message));
    } catch (err) {
      return send(res, 400, { ok: false, error: 'invalid_json', message: err.message });
    }
  }

  if (req.method === 'GET' && pathname === '/') {
    const indexPath = path.join(PUBLIC_DIR, 'index.html');
    if (serveFile(res, indexPath)) return;
  }

  const filePath = path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ''));
  if (pathname !== '/' && serveFile(res, filePath)) return;

  return send(res, 404, { ok: false, error: 'not_found', path: pathname });
}

loadKnowledge();
const server = http.createServer((req, res) => {
  handler(req, res).catch(err => {
    console.error(err);
    send(res, 500, { ok: false, error: 'internal_error', message: err.message });
  });
});

server.listen(PORT, () => {
  console.log(`SAOROQUE_XP listening on http://localhost:${PORT}`);
});
