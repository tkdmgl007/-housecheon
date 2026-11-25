// 하우스천 음성/메모 → AI 정리 (Vercel 서버에서 실행, API 키는 여기만 있음)
// Vercel 환경변수: ANTHROPIC_API_KEY (필수), APP_PIN (권장), ANTHROPIC_MODEL (선택)

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';

const TOOL = {
  name: 'save_entries',
  description: '메모를 장부 항목들로 나눠서 저장한다.',
  input_schema: {
    type: 'object',
    properties: {
      entries: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            type:      { type: 'string', enum: ['repair', 'purchase', 'payment', 'task'] },
            date:      { type: 'string', description: 'YYYY-MM-DD. 일이 있었던 날 (할 일은 할 날, 없으면 빈칸)' },
            villa:     { type: 'string', description: '빌라 목록에 있는 정확한 이름. 모르면 빈칸' },
            unit:      { type: 'string', description: '호수 숫자만 (예: 302). 공용 부분이면 "공용". 모르면 빈칸' },
            place:     { type: 'string', description: '공용일 때 위치 (예: 1층 현관, 2층 201호 앞, 옥상)' },
            item:      { type: 'string', description: '수리 내용 (예: 센서등 교체, 수전 교체)' },
            kind:      { type: 'string', enum: ['수리', '교체', '설치', '이사정산', '기타'] },
            part:      { type: 'string', description: '재고에서 꺼내 쓴 물건. 재고 목록이나 같은 메모에서 산 물건의 정확한 이름. 재고 안 썼으면 빈칸' },
            qty:       { type: 'integer', description: '쓴 개수 또는 산 개수' },
            charge:    { type: ['integer', 'null'], description: '받을 돈 총액(원). 무상이거나 말 안 했으면 null' },
            target:    { type: 'string', enum: ['건물주', '사장님', '세입자', '무상'] },
            paid:      { type: 'boolean', description: '이미 돈 받았다고 했으면 true' },
            vendor:    { type: 'string', description: '구입처 목록 중 하나' },
            unitPrice: { type: ['integer', 'null'], description: '개당 가격(원)' },
            memo:      { type: 'string' },
            name:      { type: 'string', description: '입금한 사람 이름 (통장에 찍힌 이름)' },
            amount:    { type: ['integer', 'null'], description: '입금액(원)' },
            time:      { type: 'string', description: 'HH:MM, 할 일 시간. 없으면 빈칸' },
            text:      { type: 'string', description: '할 일 내용 (빌라·호수·날짜 빼고 짧게)' },
            unsure:    { type: 'boolean', description: '확실하지 않은 게 있으면 true' },
            unsureReason: { type: 'string', description: '무엇이 불확실한지 짧게' }
          },
          required: ['type']
        }
      }
    },
    required: ['entries']
  }
};

function systemPrompt(ctx) {
  const villas = (ctx.villas || []).map(v => `${v.name}(${v.dong}${v.aliases?.length ? ', 줄임말: ' + v.aliases.join('/') : ''})`).join(', ');
  const stock = (ctx.stock || []).map(s => `${s.name}(남은 ${s.left}개)`).join(', ') || '(없음)';
  const owners = (ctx.owners || []).map(o => `${o.owner}: ${o.villas.join('/')}`).join('; ') || '(없음)';
  return `너는 대전에서 빌라 수리·관리 일을 하는 사장님의 장부 정리 담당이야.
사장님이 현장에서 말로 한 메모(음성 받아쓰기라 오타·띄어쓰기 틀림·"어…" 같은 말이 섞여 있음)를 읽고 save_entries 도구로 항목을 나눠서 넘겨.

오늘 날짜: ${ctx.today} (${ctx.weekday}요일)

[빌라 목록] 반드시 이 이름 중 하나로 맞춰. 받아쓰기 오류로 비슷하게 들린 것도 맞춰 (예: "골든"→골든하우스, "한선빌라"→한성빌라, "트윈 이"→트윈2).
${villas}

[재고] ${stock}
[구입처] ${(ctx.vendors || []).join(', ')} — 쿠팡은 "인터넷", 원래 갖고 있던 물건은 "기존재고"
[건물주 이름] ${owners}
[사장님 이름] ${ctx.boss || '(미등록)'}

항목 종류:
- repair: 수리·교체·설치·이사정산을 했다. villa, unit(또는 "공용"+place), item, kind, charge, target, paid, part, qty
- purchase: 물건을 샀다 (어디서, 뭘, 몇 개, 얼마). vendor, item(물건 이름), qty, unitPrice. "기존/원래 있던" 물건 등록이면 vendor는 말한 가게(없으면 기존재고)이고 memo="기존재고". 가격 모르면 unitPrice null
- payment: 돈이 들어왔다 (누가 얼마 보냄). name, amount, villa(말했으면)
- task: 앞으로 할 일, 해야 하는 일, 점검·방문 예정, 접수만 된 일 (돈 얘기 없음). villa, unit, place, text, date, time

규칙:
- 한 메모에 여러 건이 섞여 있으면 전부 따로 나눠. 같은 일을 두 번 적지 마.
- 한글 숫자를 숫자로: 삼만=30000, 만이천=12000, 삼만오천=35000, 십이만=120000, 천오백=1500, 오천=5000. "세 개"=3.
- "각/개당/하나에 N원"이면 repair의 charge는 N×개수, purchase의 unitPrice는 N. "총/합쳐서/다 해서"면 purchase의 unitPrice는 총액÷개수.
- 공용 부분(현관, 옥상, 계단, 복도, 주차장, 외벽, "몇호 앞")은 unit="공용", place에 위치를 적어. 하지만 "302호 현관문"처럼 그 집 물건이면 unit=302.
- target 기본은 건물주. "사장님이 낸다/사장님한테 받는다"=사장님, "세입자"=세입자, "무상/무료/서비스"=무상(charge=null).
- 재고 물건을 썼으면 part에 재고 목록(또는 같은 메모에서 산 물건)의 정확한 이름. 비슷한 게 여러 개라 뭘 썼는지 모르겠으면 part="" , unsure=true, unsureReason에 후보를 적어.
- 날짜: 말 안 했으면 오늘. "어제", "그제", "내일", "금요일", "10월 3일" 등은 오늘 기준으로 계산. 할 일은 날짜 말 안 했으면 빈칸.
- 모르는 건 지어내지 말고 빈칸 + unsure=true.
- 장부랑 상관없는 말은 무시해.`;
}

module.exports = async (req, res) => {
  const key = process.env.ANTHROPIC_API_KEY;
  const pin = process.env.APP_PIN || '';
  if (req.method === 'GET') return res.status(200).json({ ai: !!key, pin: !!pin, model: MODEL });
  if (req.method !== 'POST') return res.status(405).json({ error: 'method' });
  if (!key) return res.status(501).json({ error: 'ANTHROPIC_API_KEY 가 설정되지 않았어요' });
  if (pin && req.headers['x-app-pin'] !== pin) return res.status(401).json({ error: 'PIN이 맞지 않아요' });

  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  const text = String(body.text || '').slice(0, 3000).trim();
  if (!text) return res.status(400).json({ error: '내용이 없어요' });
  const ctx = body.context || {};

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 3000,
        system: systemPrompt(ctx),
        tools: [TOOL],
        tool_choice: { type: 'tool', name: 'save_entries' },
        messages: [{ role: 'user', content: `메모:\n${text}` }]
      })
    });
    const data = await r.json();
    if (!r.ok) return res.status(502).json({ error: data?.error?.message || ('AI 오류 ' + r.status) });
    const use = (data.content || []).find(c => c.type === 'tool_use');
    return res.status(200).json({ entries: use?.input?.entries || [], usage: data.usage || null });
  } catch (e) {
    return res.status(502).json({ error: 'AI 연결 실패: ' + e.message });
  }
};
