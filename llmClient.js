const KOBOLD_URL = 'http://localhost:5001'; // Update port if your KoboldCpp uses a different one

export async function queryLocalLLM(prompt, systemInstruction = "") {
  try {
    // KoboldCpp uses OpenAI-compatible /v1/chat/completions endpoint
    const res = await fetch(`${KOBOLD_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: "system", content: systemInstruction },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 600
      })
    });

    if (!res.ok) throw new Error(`KoboldCpp HTTP Error: ${res.status}`);

    const data = await res.json();
    const content = data.choices[0].message.content;

    // Clean up potential markdown code block wrappers if the model outputs them
    const cleanJson = content.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleanJson);

  } catch (err) {
    console.error("⚠️ [KoboldCpp LLM Error]:", err.message);
    return {
      internal_thought: "I'm having trouble parsing the response from KoboldCpp.",
      speech_output: "Hold on... my local engine had a brief hiccup."
    };
  }
}

export async function getEmbedding(text) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000); // 2 second timeout limit

    const res = await fetch(`${KOBOLD_URL}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: "default", input: text }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!res.ok) return null;
    const data = await res.json();
    return data.data?.[0]?.embedding || null;
  } catch (err) {
    return null; // Skip gracefully if disabled or timed out
  }
}