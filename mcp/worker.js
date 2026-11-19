// Remote MCP server (Streamable HTTP, không cần auth) cho Thời khóa biểu.
// Chạy trên Cloudflare Workers, đọc dữ liệu public từ GitHub Pages của repo tkb.

const BASE = 'https://tuanphong3108.github.io/tkb/asset';
const WEEK1_START = Date.UTC(2026, 8, 7); // 07/09/2026 (thứ 2) = tuần 1
const DAY_MS = 86400000;
const DAY_KEYS = ['t2', 't3', 't4', 't5', 't6', 't7'];
const DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': '*',
};

const TOOLS = [
  {
    name: 'get_schedule',
    description:
      'Thời khóa biểu của một ngày (sáng + chiều). Mặc định là hôm nay (giờ Việt Nam). ' +
      'Dùng khi hỏi "hôm nay / ngày mai / thứ X học môn gì".',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'today, tomorrow hoặc YYYY-MM-DD. Bỏ trống = hôm nay.',
        },
      },
    },
  },
  {
    name: 'get_week',
    description: 'Thời khóa biểu cả tuần. Mặc định là tuần hiện tại.',
    inputSchema: {
      type: 'object',
      properties: {
        week: { type: 'integer', description: 'Số tuần (tuần 1 bắt đầu 07/09/2026). Bỏ trống = tuần hiện tại.' },
      },
    },
  },
];

// ---- helpers ----
function vnToday() {
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

function parseDate(input) {
  const v = (input || 'today').trim().toLowerCase();
  if (v === 'today') return vnToday();
  if (v === 'tomorrow') return vnToday() + DAY_MS;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error('date phải là today, tomorrow hoặc YYYY-MM-DD');
  return Date.UTC(+m[1], +m[2] - 1, +m[3]);
}

const weekOf = (ms) => Math.floor((ms - WEEK1_START) / (7 * DAY_MS)) + 1;
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10).split('-').reverse().join('/');

async function getJson(path) {
  const res = await fetch(`${BASE}/${path}`, { cf: { cacheTtl: 300 } });
  if (!res.ok) return null;
  return res.json();
}

async function subjectNames() {
  const list = (await getJson('mon-hoc.json')) || [];
  return Object.fromEntries(list.map((s) => [s.code, s.name]));
}

function cell(entry, names) {
  if (!entry || !entry.sub) return null;
  const full = names[entry.sub] || entry.sub;
  return entry.teacher ? `${full} (${entry.teacher})` : full;
}

function dayLines(data, dayKey, names) {
  const out = [];
  [['sang', 'Sáng'], ['chieu', 'Chiều']].forEach(([key, label]) => {
    (data[key] || []).forEach((period, i) => {
      const c = cell(period[dayKey], names);
      if (c) out.push(`${label} - tiết ${i + 1}: ${c}`);
    });
  });
  return out;
}

// ---- tools ----
async function getSchedule(args) {
  const ms = parseDate(args.date);
  const dow = new Date(ms).getUTCDay();
  const head = `${DAY_NAMES[dow]}, ${fmt(ms)}`;
  if (dow === 0) return `${head}: Chủ nhật, nghỉ.`;

  const week = weekOf(ms);
  const data = week >= 1 ? await getJson(`${week}.json`) : null;
  if (!data) return `${head}: chưa có thời khóa biểu cho tuần ${week}.`;

  const lines = dayLines(data, DAY_KEYS[dow - 1], await subjectNames());
  return lines.length ? `${head} (tuần ${week})\n${lines.join('\n')}` : `${head} (tuần ${week}): không có tiết nào.`;
}

async function getWeek(args) {
  const week = Number.isInteger(args.week) ? args.week : weekOf(vnToday());
  const data = week >= 1 ? await getJson(`${week}.json`) : null;
  if (!data) return `Chưa có thời khóa biểu cho tuần ${week}.`;

  const names = await subjectNames();
  const blocks = DAY_KEYS.map((k, i) => {
    const lines = dayLines(data, k, names);
    return `${DAY_NAMES[i + 1]}:\n${lines.length ? lines.map((l) => '  ' + l).join('\n') : '  Nghỉ'}`;
  });
  return `Tuần ${week} (${data.dateRange})\n\n${blocks.join('\n\n')}`;
}

async function callTool(name, args) {
  if (name === 'get_schedule') return getSchedule(args);
  if (name === 'get_week') return getWeek(args);
  throw new Error(`Không có tool ${name}`);
}

// ---- JSON-RPC ----
async function handle(msg) {
  const { id, method, params } = msg;
  const ok = (result) => ({ jsonrpc: '2.0', id, result });
  const err = (code, message) => ({ jsonrpc: '2.0', id, error: { code, message } });

  switch (method) {
    case 'initialize':
      return ok({
        protocolVersion: params?.protocolVersion || '2025-06-18',
        capabilities: { tools: {} },
        serverInfo: { name: 'tkb', version: '1.0.0' },
      });
    case 'ping':
      return ok({});
    case 'tools/list':
      return ok({ tools: TOOLS });
    case 'tools/call':
      try {
        const text = await callTool(params?.name, params?.arguments || {});
        return ok({ content: [{ type: 'text', text }] });
      } catch (e) {
        return ok({ content: [{ type: 'text', text: `Lỗi: ${e.message}` }], isError: true });
      }
    default:
      return id === undefined ? null : err(-32601, `Method not found: ${method}`);
  }
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    if (request.method !== 'POST') {
      return new Response('TKB MCP server. Dùng POST (Streamable HTTP).', { status: 405, headers: CORS });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return new Response(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }), {
        status: 400,
        headers: { ...CORS, 'Content-Type': 'application/json' },
      });
    }

    const batch = Array.isArray(body);
    const results = (await Promise.all((batch ? body : [body]).map(handle))).filter(Boolean);
    if (!results.length) return new Response(null, { status: 202, headers: CORS }); // chỉ có notification

    return new Response(JSON.stringify(batch ? results : results[0]), {
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  },
};
