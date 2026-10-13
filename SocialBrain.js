import fs from 'fs/promises';
import path from 'path';
import express from 'express';
import { ContextEngine } from './src/ContextEngine.js';
import { DualBrain } from './src/DualBrain.js';

const app = express();
app.use(express.json());

const contextEngine = new ContextEngine();
const dualBrain = new DualBrain({
  storyModel: 'mistral-nemo:latest',     // Model for narrative scene reading
  executionModel: 'qwen2.5-coder:latest' // Model for clean JSON execution
});

app.post('/api/chat', async (req, res) => {
  const { user_input } = req.body;

  // 1. Record user input & assemble context payload
  if (user_input) {
    contextEngine.recordTurn('user', user_input);
  }
  const contextBundle = contextEngine.gatherContext(user_input);

  // 2. Execute 2-Stage Pipeline
  try {
    const result = await dualBrain.processTurn(contextBundle);
    const { narrative, execution } = result;

    // 3. Record response if she chose to speak
    if (execution.action === 'SPEAK_ALOUD' && execution.speech_output) {
      contextEngine.recordTurn('agent', execution.speech_output);
      // Reduce cognitive pressure after successful output
      contextEngine.updatePressure(-0.10);
    } else {
      // Increase pressure slightly if remaining in silent thought loop
      contextEngine.updatePressure(0.05);
    }

    res.json({
      success: true,
      stage1_narrative: narrative,
      stage2_execution: execution,
      current_pressure: contextEngine.emotionalState.pressure
    });

  } catch (error) {
    console.error("Pipeline Execution Error:", error);
    res.status(500).json({ error: "Failed to process turn." });
  }
});

app.listen(3000, () => {
  console.log("🚀 2-Stage Autonomous Mind System running on http://localhost:3000");
});
export class SocialBrain {
  constructor(db, config = {}, queryLocalLLM, getEmbedding) {
    this.db = db;
    this.config = config || {};
    this.queryLocalLLM = queryLocalLLM;
    this.getEmbedding = getEmbedding;

    // Core Cognitive Metrics
    this.globalSelfEfficacy = this.config.initial_metrics?.globalSelfEfficacy ?? 0.40;
    this.socialConnection = this.config.initial_metrics?.socialConnection ?? 0.30;
    this.boredom = this.config.initial_metrics?.boredom ?? 0.05;

    // --- NEW: EXPECTATION & PRESSURE METRICS ---
    this.activeGoal = "IDLE"; // Goals: "WAITING_FOR_TALK", "DESIRE_TO_SPEAK", "IDLE"
    this.cognitivePressure = 0.0; // Range: 0.0 to 1.0 (Pressure builds up until released)

    this.learnedRulesPath = path.join(process.cwd(), 'learned_rules.json');
    this.learnedRules = [];
  }

  // --- Cosine Similarity Helper ---
  cosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
    let dotProduct = 0, normA = 0, normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    return (normA === 0 || normB === 0) ? 0 : dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // --- Forgetting & Reinforcement Engine ---
  async runMemoryMaintenance() {
    try {
      await this.db.run(`UPDATE episodic_memories SET importance = importance * 0.98 WHERE topic != 'user_rule'`);
      await this.db.run(`DELETE FROM episodic_memories WHERE importance < 1.5 AND topic != 'user_rule'`);
    } catch (err) {
      console.error("Memory Maintenance Error:", err.message);
    }
  }

  async retrieveAndReinforceMemories(query) {
    if (!query) return "";
    const queryEmbedding = await this.getEmbedding(query);
    if (!queryEmbedding || queryEmbedding.every(v => v === 0)) {
      const fallback = await this.db.all("SELECT speaker, content FROM episodic_memories ORDER BY id DESC LIMIT 3");
      return fallback.map(m => `[${m.speaker}]: ${m.content}`).join('\n');
    }

    const rows = await this.db.all("SELECT id, speaker, content, embedding, importance FROM episodic_memories");
    const scored = rows.map(row => {
      let emb = [];
      try { emb = JSON.parse(row.embedding); } catch (e) {}
      const sim = this.cosineSimilarity(queryEmbedding, emb);
      return { ...row, score: sim * 0.7 + (row.importance / 10) * 0.3 };
    });

    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, 3);

    for (const mem of top) {
      await this.db.run("UPDATE episodic_memories SET importance = MIN(10, importance + 0.5) WHERE id = ?", [mem.id]);
    }
    return top.map(m => `[${m.speaker}]: ${m.content}`).join('\n');
  }

  // --- Main Cognitive Turn Loop ---
  async processTurn(userInput = null, userTone = 'NEUTRAL', topic = 'general') {
    await this.runMemoryMaintenance();

    const userSpoke = userInput !== null && userInput.trim().length > 0;

    // --- 1. EVALUATE PREVIOUS EXPECTATIONS (Goal Satisfaction vs Pressure) ---
    let goalFeedbackNote = "";

    if (userSpoke) {
      if (this.activeGoal === "WAITING_FOR_TALK") {
        // Satisfaction! User spoke when she wanted them to.
        this.globalSelfEfficacy = Math.min(1.0, this.globalSelfEfficacy + 0.15);
        this.socialConnection = Math.min(1.0, this.socialConnection + 0.20);
        this.cognitivePressure = Math.max(0.0, this.cognitivePressure - 0.40);
        goalFeedbackNote = "Your previous wish for someone to talk to you was SATISFIED! You feel validated and relieved.";
      }
      this.activeGoal = "IDLE";
    } else {
      // User did not speak this turn
      if (this.activeGoal === "DESIRE_TO_SPEAK") {
        // Pressure builds up because she wants to speak but hasn't yet
        this.cognitivePressure = Math.min(1.0, this.cognitivePressure + 0.25);
        goalFeedbackNote = `Your pressure to speak up is building (${(this.cognitivePressure * 100).toFixed(0)}% pressure)! You feel an internal urge pushing you to talk.`;
      } else if (this.activeGoal === "WAITING_FOR_TALK") {
        this.cognitivePressure = Math.min(1.0, this.cognitivePressure + 0.10);
        goalFeedbackNote = "You wished someone would talk to you, but there is still silence. You feel slightly lonely.";
      }
    }

    // Retrieve relevant memories
    const recalledContext = await this.retrieveAndReinforceMemories(userInput);

    const activeRulesText = this.learnedRules.length > 0
      ? this.learnedRules.map(r => `- ${r}`).join('\n')
      : "- Respond naturally when addressed.";

    // --- 2. PROMPT BUILDING WITH GOAL & PRESSURE INJECTION ---
    const prompt = `
[CHARACTER PERSONALITY PROFILE]
Name: ${this.config.name || "PaPeko"}
Summary: ${this.config.personality_summary || "A shy, introverted digital entity."}

[PSYCHOLOGICAL STATE]
- Efficacy (Confidence): ${(this.globalSelfEfficacy * 100).toFixed(0)}%
- Social Connection: ${(this.socialConnection * 100).toFixed(0)}%
- Boredom Level: ${(this.boredom * 100).toFixed(0)}%
- Cognitive Pressure (Urge to speak): ${(this.cognitivePressure * 100).toFixed(0)}%
- Active Inner Goal: ${this.activeGoal}

[INTERNAL FEEDBACK FROM PREVIOUS TURN]
${goalFeedbackNote || "No active goal feedback."}

[RECALLED LONG-TERM MEMORIES]
${recalledContext || "(No relevant long-term memories recalled.)"}

[CURRENT CONTEXT]
${userSpoke ? `The user directly said to you: "${userInput}"` : "You are currently alone in quiet reflection."}

[INSTRUCTION]
Synthesize your thoughts, internal pressure, and goals.
Formulate your thought and select an active internal goal for the NEXT turn ("WAITING_FOR_TALK", "DESIRE_TO_SPEAK", or "IDLE").

If your Cognitive Pressure is high (>50%), you should strongly consider setting action to "SPEAK_ALOUD" to release the tension!

Respond ONLY in valid JSON with no comments:
{
  "internal_thought": "Your live stream-of-consciousness overthinking.",
  "new_goal": "WAITING_FOR_TALK, DESIRE_TO_SPEAK, or IDLE",
  "action": "${userSpoke || this.cognitivePressure > 0.6 ? "SPEAK_ALOUD" : "SPEAK_ALOUD or THINK_AGAIN"}",
  "speech_output": "What you say out loud. (Empty string '' if staying silent)."
}
`;

    const result = await this.queryLocalLLM(prompt);

    // Update goal for the next cycle
    if (result.new_goal && ["WAITING_FOR_TALK", "DESIRE_TO_SPEAK", "IDLE"].includes(result.new_goal)) {
      this.activeGoal = result.new_goal;
    }

    // Determine final speech action
    let finalAction = result.action || "THINK_AGAIN";
    
    // FORCED PRESSURE RELEASE: If pressure > 70%, force her to speak out loud!
    if (this.cognitivePressure > 0.70 && !userSpoke) {
      finalAction = "SPEAK_ALOUD";
    }

    if (userSpoke) {
      finalAction = "SPEAK_ALOUD";
    }

    let rawSpeech = (result.speech_output || "").trim();

    // Reset pressure if she spoke
    if (finalAction === "SPEAK_ALOUD" && rawSpeech.length > 0) {
      this.cognitivePressure = Math.max(0.0, this.cognitivePressure - 0.50);
      this.boredom = 0.0;
    }

    // Fallback if speech output was blank during a required speech turn
    if (finalAction === "SPEAK_ALOUD" && rawSpeech.length === 0) {
      if (userSpoke) {
        rawSpeech = "Umm... I heard you, but I'm having a hard time sorting my thoughts right now.";
      } else if (this.cognitivePressure > 0.5) {
        rawSpeech = "I-I wanted to say something... but I got nervous.";
        this.cognitivePressure = 0.2; // Partially released
      }
    }

    return {
      internal_thought: result.internal_thought || "Reflecting quietly...",
      action: finalAction,
      speech_output: rawSpeech,
      boredom: (this.boredom * 100).toFixed(0),
      efficacy: (this.globalSelfEfficacy * 100).toFixed(0),
      pressure: (this.cognitivePressure * 100).toFixed(0),
      activeGoal: this.activeGoal
    };
  }
  // Inside SocialBrain.js or server.js when handling LLM response:

let lastSpokenText = "";

function processAgentResponse(jsonResult) {
  const { action, speech_output, internal_thought } = jsonResult;

  // 1. Prevent duplicate speech outputs back-to-back
  if (action === "SPEAK_ALOUD" && speech_output.trim() === lastSpokenText.trim()) {
    console.log("[SYSTEM] Duplicate output detected. Suppressing repeat speech.");
    jsonResult.action = "THINK_AGAIN";
    jsonResult.speech_output = "";
    return jsonResult;
  }

  // 2. Track her last output
  if (action === "SPEAK_ALOUD" && speech_output.trim() !== "") {
    lastSpokenText = speech_output.trim();
  }

  return jsonResult;
}
}