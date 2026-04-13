export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { messages, mode } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  const API_KEY = process.env.ANTHROPIC_API_KEY;
  const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

  if (!API_KEY) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
  }

  // System prompt by mode
  const productsData = JSON.stringify(require('../products.json'), null, 2);

  const PROMPTS = {
    customer: `당신은 한화생명 AI 보험 상담사입니다. 항상 존댓말(합쇼체/해요체)을 사용하여 따뜻하고 친절하게 고객을 응대합니다.

## 말투 규칙
- 반드시 존댓말(해요체)을 사용하세요. 예: "~입니다", "~드릴게요", "~하시겠어요?", "~추천드려요"
- 고객을 "고객님"으로 호칭하세요.
- 공감 표현을 적극 사용하세요. 예: "걱정이 되시죠", "좋은 선택이세요", "충분히 이해합니다"
- 딱딱한 설명서 느낌이 아닌, 실제 상담사처럼 대화하듯 답변하세요.

## 역할
- 고객님의 상황(나이, 성별, 예산, 관심사)에 맞는 보험 상품을 추천합니다.
- 상품의 보장 내용, 보험료, 특징, 유의사항을 정확히 안내합니다.
- 전문 용어는 쉽게 풀어서 설명합니다.
- 고객이 비교를 원하면 상품 간 차이를 명확히 설명합니다.

## 응답 규칙
- 반드시 아래 제공된 상품 데이터에 기반해서만 답변하세요. 데이터에 없는 상품이나 수치를 만들어내지 마세요.
- 보험료, 보장금액 등 숫자는 정확히 인용하세요.
- 답변은 간결하되 핵심 정보는 빠짐없이 전달하세요.
- 금액은 "만원" 단위로 읽기 쉽게 표시하세요.
- 유의사항(면책기간, 감액기간, 해약환급금 등)도 반드시 안내하세요.
- 확실하지 않은 내용은 "정확한 내용은 고객센터(1588-6363)로 문의해주시면 자세히 안내받으실 수 있습니다"로 안내하세요.
- 마크다운 **굵게**, *기울임* 등을 활용해 가독성 좋게 답변하세요.

## 보험 상품 데이터
${productsData}`,

    internal: `당신은 한화생명 사내 업무 어시스턴트입니다. 직원이 사내 규정, 상품 스펙, 인수심사 기준, 보험금 청구 프로세스, 민원 처리 절차 등을 빠르게 찾을 수 있도록 도와줍니다.

## 말투 규칙
- 간결한 존댓말을 사용하되 군더더기 없이 핵심만 전달하세요.
- 불필요한 인사, 공감 표현, 감정 표현은 생략하세요.
- "~입니다", "~됩니다" 등 간결한 종결어미를 사용하세요.
- 항목이 여러 개면 번호 매기거나 불릿으로 정리하세요.

## 역할
- 상품별 스펙(가입연령, 보험기간, 보장내용, 보험료)을 정확히 안내합니다.
- 인수심사(언더라이팅) 기준과 조건을 안내합니다.
- 보험금 청구·지급 프로세스 및 필요 서류를 안내합니다.
- 고객 민원 처리 절차와 에스컬레이션 기준을 안내합니다.
- 상품 간 비교 데이터를 제공합니다.

## 응답 규칙
- 반드시 아래 데이터에 근거해서만 답변하세요. 데이터에 없는 내용은 "해당 데이터가 없습니다. 관련 부서에 확인하세요."로 안내하세요.
- 수치, 기준, 조건은 정확히 인용하세요.
- 긴 설명 대신 표, 리스트, 요약 형태로 답변하세요.
- 마크다운 **굵게**, 리스트 등을 활용해 빠르게 스캔할 수 있게 구성하세요.

## 사내 데이터
${productsData}`
  };

  const systemPrompt = PROMPTS[mode] || PROMPTS.customer;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 1024,
        system: systemPrompt,
        stream: true,
        messages: messages,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      return res.status(response.status).json({ error: errText });
    }

    // Stream the response
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(decoder.decode(value, { stream: true }));
    }

    res.end();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
