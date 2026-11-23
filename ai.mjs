// AI Summarizer and Translate on the server, using Claude. Enabled when the server has Anthropic credentials
// (ANTHROPIC_API_KEY, or ANTHROPIC_AUTH_TOKEN). Without them the endpoints answer 503 and the browser falls
// back to its on-device versions (extractive summary, Chrome's built-in translator).
import Anthropic from '@anthropic-ai/sdk';

const MODEL = process.env.PDFTURTLE_AI_MODEL || 'claude-opus-5-5';
let client = null;
export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const getClient = () => (client ??= new Anthropic());

class AiError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

// One structured-output request. Refusals on Claude Opus 5.5 are retried server-side on a fallback model
// (fallbacks: "default"); streaming keeps long documents clear of HTTP timeouts.
async function ask({ system, user, schema, maxTokens }) {
  if (!aiEnabled()) throw new AiError(503, 'AI is not configured on this server');
  let message;
  try {
    const stream = getClient().beta.messages.stream({
      model: MODEL,
      max_tokens: maxTokens,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low', format: { type: 'json_schema', schema } },
      system,
      messages: [{ role: 'user', content: user }],
    });
    message = await stream.finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new AiError(503, 'AI credentials on the server are invalid');
    if (e instanceof Anthropic.RateLimitError) throw new AiError(429, 'The AI service is busy, try again in a minute');
    if (e instanceof Anthropic.BadRequestError) throw new AiError(400, `AI request rejected: ${e.message}`);
    if (e instanceof Anthropic.APIError) throw new AiError(502, `AI service error (${e.status ?? 'network'})`);
    throw e;
  }
  if (message.stop_reason === 'refusal') throw new AiError(422, 'The AI declined to process this document');
  if (message.stop_reason === 'max_tokens') throw new AiError(413, 'The document is too long for one pass; split it first');
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  try { return JSON.parse(text); } catch { throw new AiError(502, 'The AI returned an unreadable answer'); }
}

const LENGTHS = { 3: 'about 3 short bullet points', 6: 'about 6 bullet points', 12: 'about 12 bullet points covering every section' };

export async function summarize({ text, length = 6 }) {
  if (!text?.trim()) throw new AiError(400, 'No text found. If this is a scan, run OCR PDF first.');
  const out = await ask({
    system: 'You summarize documents for busy readers. Write the summary in the same language as the document. Each point is one or two plain sentences, factual, with no preamble.',
    user: `Summarize this document in ${LENGTHS[length] || LENGTHS[6]}.\n\n<document>\n${text}\n</document>`,
    schema: { type: 'object', properties: { points: { type: 'array', items: { type: 'string' } } }, required: ['points'], additionalProperties: false },
    maxTokens: 16000,
  });
  return { points: out.points };
}

export async function translate({ blocks, target }) {
  if (!Array.isArray(blocks) || !blocks.length) throw new AiError(400, 'No text found. If this is a scan, run OCR PDF first.');
  if (!/^[a-z]{2,3}(-[A-Za-z]{2,4})?$/.test(target || '')) throw new AiError(400, 'Unknown target language');
  const out = await ask({
    system: 'You translate documents faithfully. Keep meaning, tone, numbers, names and formatting markers; do not add or drop content.',
    user: `Translate each item of this JSON array into the language with code "${target}". Return exactly ${blocks.length} items, in the same order, one translation per item.\n\n${JSON.stringify(blocks)}`,
    schema: { type: 'object', properties: { blocks: { type: 'array', items: { type: 'string' } } }, required: ['blocks'], additionalProperties: false },
    maxTokens: 64000,
  });
  if (out.blocks.length !== blocks.length) throw new AiError(502, 'The translation lost part of the document; please try again');
  return { blocks: out.blocks };
}
