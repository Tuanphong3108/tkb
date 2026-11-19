// TKB MCP server for Gemini Apps and other MCP clients.
// Cloudflare Worker using stateless Streamable HTTP (JSON-RPC 2.0).

const BASE = 'https://tuanphong3108.github.io/tkb/asset';
const WEEK1_START = Date.UTC(2026, 8, 7); // Monday, 07/09/2026 = week 1
const DAY_MS = 86400000;
const DAY_KEYS = ['t2', 't3', 't4', 't5', 't6', 't7'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const VN_DAY_NAMES = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];

// Bell schedule copied from the timetable UI (index.html).
const PERIOD_TIMES = {
  sang: [
    { start: '07:15', end: '08:00' },
    { start: '08:10', end: '08:55' },
    { start: '09:05', end: '09:50' },
    { start: '09:55', end: '10:40' },
    { start: '10:45', end: '11:30' },
  ],
  chieu: [
    { start: '14:15', end: '15:00' },
    { start: '15:10', end: '15:55' },
    { start: '16:00', end: '16:45' },
  ],
};

// MCP protocol versions supported by this stateless Streamable HTTP endpoint.
const SUPPORTED_PROTOCOL_VERSIONS = [
  '2025-11-25',
  '2025-06-18',
  '2025-03-26',
];
const DEFAULT_PROTOCOL_VERSION = '2025-11-25';

const SERVER_INSTRUCTIONS = [
  'You are connected to the TKB (Thời khóa biểu) read-only school timetable service.',
  'Use get_schedule for a single date and get_week for a complete school week.',
  'Dates are interpreted in Vietnam time (UTC+7). For get_schedule, date may be today, tomorrow, or YYYY-MM-DD.',
  'Week 1 starts on 2026-09-07. If the user asks what classes they have today or tomorrow, call get_schedule rather than guessing.',
  'The tools only retrieve published timetable data. They cannot edit, create, or delete schedules.',
  'Bạn có thể trả lời người dùng bằng tiếng Việt. Không tự suy đoán tiết học nếu công cụ không trả về dữ liệu.',
].join(' ');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Last-Event-ID, Authorization',
  'Access-Control-Allow-Headers': 'Content-Type, Accept, Mcp-Protocol-Version, Last-Event-ID, Authorization',
  'Vary': 'Origin',
};

const JSON_HEADERS = {
  ...CORS,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
};

const READ_ONLY_ANNOTATIONS = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
};

const TOOLS = [
  {
    name: 'get_schedule',
    title: 'Get timetable for one day',
    description:
      'Get the published school timetable for one date, including morning and afternoon sessions and the full alert/notice text attached to each lesson. ' +
      'Use this when the user asks what classes they have today, tomorrow, or on a specific date. ' +
      'Ngày hợp lệ: today, tomorrow hoặc YYYY-MM-DD. Mặc định là hôm nay theo giờ Việt Nam (UTC+7).',
    inputSchema: {
      type: 'object',
      properties: {
        date: {
          type: 'string',
          description: 'Date in Vietnam time: "today", "tomorrow", or "YYYY-MM-DD". Defaults to "today".',
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
  {
    name: 'get_week',
    title: 'Get full school week timetable',
    description:
      'Get the complete published school timetable for one school week, Monday through Saturday, including the full alert/notice text attached to each lesson. ' +
      'Use this when the user asks for their timetable this week or for a particular week. ' +
      'Week 1 starts on 2026-09-07. Omit week to use the current week in Vietnam time.',
    inputSchema: {
      type: 'object',
      properties: {
        week: {
          type: 'integer',
          minimum: 1,
          description: 'School week number (1 or greater). Week 1 starts on 2026-09-07. Defaults to the current week.',
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY_ANNOTATIONS,
  },
];

// ---- date and data helpers ----
function vnToday() {
  const t = new Date(Date.now() + 7 * 3600 * 1000);
  return Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
}

function parseDate(input) {
  const value = (input === undefined ? 'today' : input);
  if (typeof value !== 'string') throw new Error('date must be a string');
  const v = value.trim().toLowerCase();

  if (v === 'today') return vnToday();
  if (v === 'tomorrow') return vnToday() + DAY_MS;

  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) throw new Error('date must be today, tomorrow, or YYYY-MM-DD');

  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);

  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day
  ) {
    throw new Error('date is not a valid calendar date');
  }
  return ms;
}

const weekOf = (ms) => Math.floor((ms - WEEK1_START) / (7 * DAY_MS)) + 1;
const fmt = (ms) => new Date(ms).toISOString().slice(0, 10).split('-').reverse().join('/');

async function getJson(path) {
  const res = await fetch(BASE + '/' + path, {
    cf: { cacheTtl: 300 },
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) return null;
  return res.json();
}

async function subjectDetails() {
  const list = (await getJson('mon-hoc.json')) || [];
  return Object.fromEntries(list.map((subject) => [subject.code, subject]));
}

function dayLines(data, dayKey, subjects) {
  const out = [];
  [['sang', 'Buổi sáng'], ['chieu', 'Buổi chiều']].forEach(([key, label]) => {
    (data[key] || []).forEach((period, i) => {
      const entry = period && period[dayKey];
      if (!entry) return;

      const subject = subjects[entry.sub];
      const fullName = subject?.name || entry.sub;
      const time = PERIOD_TIMES[key][i];
      const timeLabel = time ? ' (' + time.start + '–' + time.end + ')' : '';
      out.push(label + ' - tiết ' + (i + 1) + timeLabel + ': ' + fullName + ' [' + entry.sub + ']');
      if (entry.teacher) out.push('  Giáo viên: ' + entry.teacher);
      if (subject) {
        if (subject.category) out.push('  Nhóm môn học: ' + subject.category);
        if (subject.description) out.push('  Thông tin môn học: ' + subject.description);
        if (Array.isArray(subject.keywords) && subject.keywords.length) {
          out.push('  Chủ đề: ' + subject.keywords.join(', '));
        }
      }

      // Preserve the complete alert text attached to this timetable cell.
      if (typeof entry.alert === 'string' && entry.alert.trim()) {
        out.push('⚠️ Thông báo (tiết ' + (i + 1) + '): ' + entry.alert.trim());
      }
    });
  });
  return out;
}

function displayDayName(index) {
  return VN_DAY_NAMES[index] + ' (' + DAY_NAMES[index] + ')';
}

// ---- MCP tools ----
async function getSchedule(args) {
  const ms = parseDate(args.date);
  const dow = new Date(ms).getUTCDay();
  const head = displayDayName(dow) + ', ' + fmt(ms);

  if (dow === 0) return head + ': Chủ nhật, nghỉ (Sunday, no classes).';

  const week = weekOf(ms);
  const data = week >= 1 ? await getJson(week + '.json') : null;
  if (!data) return head + ': chưa có thời khóa biểu cho tuần ' + week + '.';

  const lines = dayLines(data, DAY_KEYS[dow - 1], await subjectDetails());
  return lines.length
    ? head + ' (tuần ' + week + ')\n' + lines.join('\n')
    : head + ' (tuần ' + week + '): không có tiết nào.';
}

async function getWeek(args) {
  const week = args.week === undefined ? weekOf(vnToday()) : args.week;
  if (!Number.isInteger(week) || week < 1) {
    throw new Error('week must be a positive integer');
  }

  const data = await getJson(week + '.json');
  if (!data) return 'Chưa có thời khóa biểu cho tuần ' + week + '.';

  const subjects = await subjectDetails();
  const blocks = DAY_KEYS.map((key, i) => {
    const lines = dayLines(data, key, subjects);
    return displayDayName(i + 1) + ':\n' +
      (lines.length ? lines.map((line) => '  ' + line).join('\n') : '  Nghỉ (No classes)');
  });

  return 'Tuần ' + week + ' (' + (data.dateRange || 'date range unavailable') + ')\n\n' +
    blocks.join('\n\n');
}

async function callTool(name, rawArgs) {
  const args = rawArgs === undefined ? {} : rawArgs;
  if (!args || typeof args !== 'object' || Array.isArray(args)) {
    throw new Error('tool arguments must be a JSON object');
  }

  if (name === 'get_schedule') {
    if (args.date !== undefined && typeof args.date !== 'string') {
      throw new Error('date must be a string');
    }
    if (Object.keys(args).some((key) => key !== 'date')) {
      throw new Error('unknown argument; only date is supported');
    }
    return getSchedule(args);
  }

  if (name === 'get_week') {
    if (args.week !== undefined && (!Number.isInteger(args.week) || args.week < 1)) {
      throw new Error('week must be a positive integer');
    }
    if (Object.keys(args).some((key) => key !== 'week')) {
      throw new Error('unknown argument; only week is supported');
    }
    return getWeek(args);
  }

  throw new Error('Unknown tool: ' + name);
}

// ---- JSON-RPC / MCP ----
function jsonRpcResult(id, result) {
  return { jsonrpc: '2.0', id, result };
}

function jsonRpcError(id, code, message) {
  return { jsonrpc: '2.0', id, error: { code, message } };
}

async function handleMessage(message) {
  if (!message || typeof message !== 'object' || Array.isArray(message)) {
    return jsonRpcError(null, -32600, 'Invalid Request');
  }

  const hasId = Object.prototype.hasOwnProperty.call(message, 'id');
  const id = hasId ? message.id : undefined;

  if (message.jsonrpc !== '2.0' || typeof message.method !== 'string') {
    return hasId ? jsonRpcError(id, -32600, 'Invalid Request') : null;
  }

  const params = message.params && typeof message.params === 'object' && !Array.isArray(message.params)
    ? message.params
    : {};

  switch (message.method) {
    case 'initialize': {
      const requested = params.protocolVersion;
      const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested)
        ? requested
        : DEFAULT_PROTOCOL_VERSION;

      return jsonRpcResult(id, {
        protocolVersion,
        capabilities: {
          tools: { listChanged: false },
        },
        serverInfo: {
          name: 'tkb-mcp',
          title: 'Thời khóa biểu (TKB)',
          version: '1.1.0',
        },
        instructions: SERVER_INSTRUCTIONS,
      });
    }

    case 'notifications/initialized':
    case 'notifications/cancelled':
    case 'notifications/progress':
      return null;

    case 'ping':
      return jsonRpcResult(id, {});

    case 'tools/list':
      return jsonRpcResult(id, { tools: TOOLS });

    case 'tools/call': {
      try {
        const text = await callTool(params.name, params.arguments || {});
        return jsonRpcResult(id, {
          content: [{ type: 'text', text }],
          isError: false,
        });
      } catch (error) {
        return jsonRpcResult(id, {
          content: [{
            type: 'text',
            text: 'TKB tool error: ' + (error && error.message ? error.message : 'Unknown error'),
          }],
          isError: true,
        });
      }
    }

    default:
      return hasId ? jsonRpcError(id, -32601, 'Method not found: ' + message.method) : null;
  }
}

function jsonResponse(payload, status) {
  return new Response(JSON.stringify(payload), {
    status: status || 200,
    headers: JSON_HEADERS,
  });
}

export default {
  async fetch(request) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Streamable HTTP allows a server not to implement the optional GET/SSE stream.
    if (request.method === 'GET') {
      return new Response('TKB MCP server. Send MCP JSON-RPC requests using HTTP POST.', {
        status: 405,
        headers: { ...CORS, Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    if (request.method !== 'POST') {
      return new Response('Method Not Allowed', {
        status: 405,
        headers: { ...CORS, Allow: 'POST, OPTIONS', 'Content-Type': 'text/plain; charset=utf-8' },
      });
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return jsonResponse(jsonRpcError(null, -32700, 'Parse error'), 400);
    }

    // MCP clients send one JSON-RPC message per POST; batch requests are not supported.
    if (Array.isArray(body)) {
      return jsonResponse(jsonRpcError(null, -32600, 'Batch requests are not supported'), 400);
    }

    const response = await handleMessage(body);
    if (response === null) {
      return new Response(null, { status: 202, headers: CORS });
    }

    return jsonResponse(response, 200);
  },
};
