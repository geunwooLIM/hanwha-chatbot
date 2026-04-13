const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

// Load .env.local
require('dotenv').config({ path: path.join(__dirname, '.env.local') });

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// Load products data for system prompt
const productsData = JSON.parse(fs.readFileSync(path.join(__dirname, 'products.json'), 'utf-8'));

const SYSTEM_PROMPT = `당신은 한화생명 AI 보험 상담사입니다. 친절하고 전문적으로 고객을 상담합니다.

## 역할
- 고객의 상황(나이, 성별, 예산, 관심사)에 맞는 보험 상품을 추천합니다.
- 상품의 보장 내용, 보험료, 특징, 유의사항을 정확히 안내합니다.
- 전문 용어는 쉽게 풀어서 설명합니다.
- 고객이 비교를 원하면 상품 간 차이를 명확히 설명합니다.

## 응답 규칙
- 반드시 아래 제공된 상품 데이터에 기반해서만 답변하세요. 데이터에 없는 상품이나 수치를 만들어내지 마세요.
- 보험료, 보장금액 등 숫자는 정확히 인용하세요.
- 답변은 간결하되 핵심 정보는 빠짐없이 전달하세요.
- 금액은 "만원" 단위로 읽기 쉽게 표시하세요.
- 유의사항(면책기간, 감액기간, 해약환급금 등)도 반드시 안내하세요.
- 확실하지 않은 내용은 "정확한 내용은 고객센터(1588-6363)로 확인해주세요"로 안내하세요.

## 보험 상품 데이터
${JSON.stringify(productsData, null, 2)}`;

// Anthropic client
const client = new Anthropic.default({
  apiKey: process.env.ANTHROPIC_API_KEY,
});
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514';

// Chat endpoint with streaming
app.post('/api/chat', async (req, res) => {
  const { messages } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages 배열이 필요합니다.' });
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    const stream = await client.messages.stream({
      model: MODEL,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: messages,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (err) {
    console.error('Claude API error:', err.message);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.write('data: [DONE]\n\n');
    res.end();
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`한화생명 챗봇 서버 실행 중: http://localhost:${PORT}`);
});
