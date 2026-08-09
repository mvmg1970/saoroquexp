const TAVILY_BASE = 'https://api.tavily.com';
const TRUSTED_DOMAINS = [
  'saoroque.sp.gov.br',
  'turismo.saoroque.sp.gov.br',
  'roteirodovinho.com.br',
  'vinicolagoes.com.br',
  'quintadoolivardo.com.br',
  'emsaoroque.com.br',
  'rotasaboocastello.com.br',
  'melhoresdestinos.com.br',
  'instagram.com',
  'tripadvisor.com.br',
];

function normalize(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

function tokenize(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter(Boolean);
}

function clip(text, max = 220) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trim()}…`;
}

function domainOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function trustedBoost(url) {
  const domain = domainOf(url);
  if (!domain) return 0;
  if (TRUSTED_DOMAINS.some((d) => domain === d || domain.endsWith(`.${d}`))) return 0.35;
  return 0;
}

function termScore(text, queryTerms) {
  const hay = tokenize(text);
  if (!hay.length || !queryTerms.length) return 0;
  const set = new Set(hay);
  let score = 0;
  for (const term of queryTerms) {
    if (set.has(term)) score += 1;
  }
  return score / Math.max(queryTerms.length, 1);
}

function summarize(text, query) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return '';

  const terms = tokenize(query).filter((t) => t.length > 2);
  const sentences = clean
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 35);

  if (!sentences.length) return clip(clean, 240);

  const scored = sentences
    .map((sentence, index) => ({
      sentence,
      index,
      score: termScore(sentence, terms) + Math.min(sentence.length / 240, 0.35),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  return clip(scored.join(' '), 260);
}

async function tavilyPost(endpoint, payload) {
  const headers = {
    'Content-Type': 'application/json',
  };

  const accessMode = (process.env.TAVILY_ACCESS_MODE || (process.env.TAVILY_API_KEY ? 'api_key' : 'keyless')).toLowerCase();
  if (accessMode === 'keyless') {
    headers['X-Tavily-Access-Mode'] = 'keyless';
  } else if (process.env.TAVILY_API_KEY) {
    headers.Authorization = `Bearer ${process.env.TAVILY_API_KEY}`;
  } else {
    headers['X-Tavily-Access-Mode'] = 'keyless';
  }

  const response = await fetch(`${TAVILY_BASE}${endpoint}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });

  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`Tavily ${endpoint} HTTP ${response.status}: ${raw.slice(0, 500)}`);
  }

  return JSON.parse(raw);
}

function rankResults(results, query) {
  const queryTerms = tokenize(query).filter((t) => t.length > 2);
  return (results || [])
    .map((item, index) => {
      const snippet = item.content || item.raw_content || '';
      const domainBonus = trustedBoost(item.url);
      const relevance = termScore(`${item.title || ''} ${snippet}`, queryTerms);
      const score = (Number(item.score) || 0) + relevance + domainBonus + Math.max(0, (6 - index) * 0.01);
      return {
        ...item,
        score,
        excerpt: summarize(snippet, query) || clip(snippet, 220),
      };
    })
    .sort((a, b) => b.score - a.score);
}

async function searchAndSummarize(message) {
  const query = `${message} São Roque turismo`;
  const search = await tavilyPost('/search', {
    query,
    max_results: 5,
  });

  const ranked = rankResults(search.results || [], query).slice(0, 3);
  if (!ranked.length) {
    return null;
  }

  const extractTargets = ranked.slice(0, 2).map((item) => item.url).filter(Boolean);
  let extractedByUrl = new Map();
  if (extractTargets.length) {
    try {
      const extract = await tavilyPost('/extract', { urls: extractTargets });
      extractedByUrl = new Map((extract.results || []).map((item) => [item.url, item]));
    } catch (err) {
      console.warn('Tavily extract failed:', err.message);
    }
  }

  const sources = ranked.map((item) => {
    const extracted = extractedByUrl.get(item.url);
    const raw = extracted?.raw_content || item.raw_content || item.content || '';
    return {
      title: item.title || item.url,
      url: item.url,
      excerpt: summarize(raw, query) || clip(item.content || raw, 220),
      score: Number(item.score || 0).toFixed(2),
      domain: domainOf(item.url),
    };
  });

  const lines = [
    'Não achei isso na base local, então busquei na internet em fontes confiáveis.',
    '',
  ];

  sources.forEach((item, index) => {
    lines.push(`${index + 1}. **${item.title}** — ${item.excerpt}`);
  });

  lines.push('', 'Fontes:');
  sources.forEach((item) => {
    lines.push(`- ${item.title} — ${item.url}`);
  });

  return {
    source_mode: 'web',
    reply: lines.join('\n'),
    sources,
    query,
    request_id: search.request_id || null,
  };
}

async function webFallback(message) {
  try {
    return await searchAndSummarize(message);
  } catch (err) {
    console.error('webFallback failed:', err.message);
    return null;
  }
}

module.exports = { webFallback };
