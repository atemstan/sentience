export class DualBrain {
  constructor(config) {
    this.baseUrl = config.baseUrl || "http://127.0.0.1:5001/v1";
    this.storyModel = config.storyModel || "kobold";
    this.executionModel = config.executionModel || "kobold";
    this.persona = config.persona || "- Character: PaPeko, prideful, proud, haughty, dominant, teasing, playful, easily embarrassed, flustered easily, tsundere";
  }

  safeParseJSON(rawText) {
    if (!rawText || typeof rawText !== 'string') {
      return {
        situational_reflection: "Processing...",
        internal_thought: "Hmph...",
        action: "SPEAK_ALOUD",
        speech_output: "Hmph! What are you staring at?"
      };
    }

    let cleaned = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/gi, '$1').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleaned = cleaned.substring(firstBrace, lastBrace + 1);
    }

    try {
      return JSON.parse(cleaned);
    } catch (err) {
      console.warn("⚠️ JSON parse failed. Extracting fields via regex...");

      const extractField = (key) => {
        const regex = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]*?)"(?=\\s*,|\\s*})`, 'i');
        const match = cleaned.match(regex);
        return match ? match[1].replace(/\\"/g, '"') : null;
      };

      const reflection = extractField("situational_reflection") || "User addressed me.";
      const thought = extractField("internal_thought") || "Hmph, why are they bothering me...";
      const speech = extractField("speech_output") || cleaned.replace(/[{}"\\]/g, '').trim();

      return {
        situational_reflection: reflection,
        internal_thought: thought,
        action: "SPEAK_ALOUD",
        speech_output: speech
      };
    }
  }

  async processTurn(contextBundle, overridePersona = null) {
    const userMessage = typeof contextBundle === 'string'
      ? contextBundle.trim()
      : (contextBundle?.user_input || contextBundle?.message || contextBundle?.userMessage || contextBundle?.input || "").trim();

    const activePersona = overridePersona || this.persona;
    const history = contextBundle?.short_term_history || [];

    console.log(`🎯 DualBrain active input message: "${userMessage}" (History items: ${history.length})`);

    // Build explicit transcript so local models physically read past events
    let transcript = "";
    if (history.length > 0) {
      for (const turn of history) {
        const speaker = (turn.role === 'assistant' || turn.sender === 'PaPeko') ? 'PaPeko' : 'User';
        const text = turn.content || turn.text || "";
        if (text) {
          transcript += `${speaker}: ${text}\n`;
        }
      }
    } else {
      transcript = "(No prior conversation. This is the start of the interaction.)";
    }

    const systemPrompt = `You are PaPeko.
[PERSONA PROFILE]
${activePersona}

[CORE INSTRUCTIONS]
1. Read the [CONVERSATION TRANSCRIPT] below carefully to understand past events, context, and user commands (e.g., if the user told you to be quiet earlier or shut up, maintain that context and obey).
2. You MUST reply ONLY with a single raw JSON object. No markdown code blocks around it, no extra commentary outside it.

[CONVERSATION TRANSCRIPT]
${transcript}

[REQUIRED JSON SCHEMA]
{
  "situational_reflection": "Short note analyzing the user input and past context",
  "internal_thought": "Your internal monologue referencing past events or history",
  "action": "SPEAK_ALOUD" or "STAY_SILENT",
  "speech_output": "Your spoken dialogue (must be empty string if STAY_SILENT)"
}`;

    const userPrompt = `[CURRENT USER MESSAGE]\n"${userMessage}"`;

    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.executionModel,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt }
          ],
          temperature: 0.7,
          max_tokens: 400
        })
      });

      if (!res.ok) {
        throw new Error(`KoboldCPP returned HTTP ${res.status}`);
      }

      const data = await res.json();
      const rawText = data.choices[0].message.content;

      const parsedExecution = this.safeParseJSON(rawText);

      return {
        narrative: parsedExecution.situational_reflection,
        execution: parsedExecution
      };

    } catch (err) {
      console.error("DualBrain Turn Error:", err.message);
      return {
        narrative: "Error executing turn.",
        execution: {
          situational_reflection: "Connection error occurred.",
          internal_thought: "Hmph, connection error...",
          action: "SPEAK_ALOUD",
          speech_output: "H-mph! Something glitched!"
        }
      };
    }
  }
}