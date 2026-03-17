// ============================================================
// BioLoop AI Card Generation
// Calls Anthropic API with 5s timeout, never blocks session
// ============================================================

export interface CardGenParams {
  topic: string;
  course: string;
  complexity: string;
  style: string;
  biometricSummary: string;
  sessionPosition: number;
}

export interface CardGenResult {
  question: string;
  hint: string;
  style: string;
}

const FALLBACK_TEMPLATES: Record<string, (topic: string) => CardGenResult> = {
  socratic: (t) => ({
    question: `What is your current understanding of "${t}"? What do you think you know, and what are you uncertain about?`,
    hint: 'Start with what you are most confident about, then identify gaps.',
    style: 'socratic',
  }),
  analogy: (t) => ({
    question: `Can you think of something from everyday life that works similarly to "${t}"? Describe the comparison.`,
    hint: 'Think about structural or functional similarities.',
    style: 'analogy',
  }),
  example: (t) => ({
    question: `Give a concrete example that demonstrates "${t}" in action.`,
    hint: 'Make it specific — avoid abstract examples.',
    style: 'example',
  }),
  definition: (t) => ({
    question: `Define "${t}" in your own words without looking it up.`,
    hint: 'Focus on the core meaning, not memorised phrasing.',
    style: 'definition',
  }),
  mnemonic: (t) => ({
    question: `Create a mnemonic, acronym, or memory aid to help you remember the key aspects of "${t}".`,
    hint: 'The sillier or more vivid, the more memorable.',
    style: 'mnemonic',
  }),
  'step-by-step': (t) => ({
    question: `Walk through the steps or stages involved in "${t}" in the correct order.`,
    hint: 'Number each step and be specific about transitions.',
    style: 'step-by-step',
  }),
  contrast: (t) => ({
    question: `How is "${t}" different from concepts that seem similar? What distinguishes it?`,
    hint: 'Pick the closest look-alike concept and compare directly.',
    style: 'contrast',
  }),
  real_life_example: (t) => ({
    question: `Describe a real-world scenario where "${t}" is directly relevant or applied.`,
    hint: 'Think about professional or everyday contexts you have encountered.',
    style: 'real_life_example',
  }),
  clinical_example: (t) => ({
    question: `Describe a clinical or professional case where "${t}" would be the key concept.`,
    hint: 'Consider presentation, mechanism, and outcome.',
    style: 'clinical_example',
  }),
  visual: (t) => ({
    question: `Describe a diagram or visual representation you could draw to explain "${t}".`,
    hint: 'Think about what spatial layout would best capture the relationships.',
    style: 'visual',
  }),
  story: (t) => ({
    question: `Tell a short story (3–5 sentences) that naturally demonstrates "${t}".`,
    hint: 'Give your story a character, a problem, and a resolution involving the concept.',
    style: 'story',
  }),
};

export async function generateCardQuestion(params: CardGenParams): Promise<CardGenResult> {
  const apiKey = (import.meta as unknown as { env: Record<string, string> }).env
    ?.VITE_ANTHROPIC_API_KEY;

  if (!apiKey) {
    return fallback(params);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const prompt = `You are a spaced repetition card generator. Generate a single study question.

Topic: ${params.topic}
Course: ${params.course}
Complexity: ${params.complexity}
Presentation style: ${params.style}
Biometric context: ${params.biometricSummary}
Position in session: card #${params.sessionPosition}

Generate a question using the "${params.style}" presentation style. The question should:
- Be specific to the topic
- Match the complexity level
- Be appropriate given the biometric context
- Be a single question (not multiple questions)

Respond with JSON only, no markdown, no preamble:
{"question": "...", "hint": "..."}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    clearTimeout(timeout);

    if (!response.ok) {
      return fallback(params);
    }

    const data = await response.json() as {
      content: { type: string; text: string }[];
    };

    const text = data.content?.find(b => b.type === 'text')?.text ?? '';
    const parsed = JSON.parse(text.replace(/```json|```/g, '').trim()) as {
      question: string;
      hint: string;
    };

    return {
      question: parsed.question,
      hint: parsed.hint,
      style: params.style,
    };
  } catch {
    clearTimeout(timeout);
    return fallback(params);
  }
}

function fallback(params: CardGenParams): CardGenResult {
  const template =
    FALLBACK_TEMPLATES[params.style] ?? FALLBACK_TEMPLATES['definition'];
  return template(params.topic);
}
