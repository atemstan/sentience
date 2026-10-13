import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { DualBrain } from './src/DualBrain.js';
import { ContextEngine } from './src/ContextEngine.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Added fallback parser

// Serve public directory with absolute path and disable HTML caching
app.use(express.static(path.join(__dirname, 'public'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }
}));

const contextEngine = new ContextEngine();
const dualBrain = new DualBrain({
  baseUrl: 'http://127.0.0.1:5001/v1',
  storyModel: 'kobold',
  executionModel: 'kobold'
});

// Explicit root route to guarantee serving public/index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Update runtime config and persona from UI
app.post('/api/config', (req, res) => {
  const { provider, baseUrl, apiKey, storyModel, executionModel, persona } = req.body;
  
  if (baseUrl) dualBrain.baseUrl = baseUrl;
  if (apiKey) dualBrain.apiKey = apiKey;
  if (storyModel) dualBrain.storyModel = storyModel;
  if (executionModel) dualBrain.executionModel = executionModel;
  if (persona) {
    dualBrain.persona = persona;
    console.log("✅ DualBrain Persona updated:", dualBrain.persona);
  }

  res.json({ success: true, persona: dualBrain.persona });
});

// Process active user turn with bulletproof extraction
app.post('/api/chat', async (req, res) => {
  try {
    const { message, persona } = req.body;

    const cleanMessage = (message && typeof message === 'string' && message.trim() !== '') 
      ? message.trim() 
      : "hello";

    if (persona) {
      dualBrain.persona = persona; // Update instance
    }

    if (contextEngine.internal_telemetry) {
      contextEngine.internal_telemetry.pressure = Math.max(0, contextEngine.internal_telemetry.pressure - 0.2);
    }

    const contextBundle = contextEngine.buildBundle(cleanMessage);
    contextBundle.message = cleanMessage;
    contextBundle.userMessage = cleanMessage;
    contextBundle.user_input = cleanMessage;

    // Pass persona explicitly to processTurn
    const result = await dualBrain.processTurn(contextBundle, dualBrain.persona);

    if (result.execution && result.execution.action === 'SPEAK_ALOUD' && result.execution.speech_output) {
      contextEngine.addHistory('user', cleanMessage);
      contextEngine.addHistory('assistant', result.execution.speech_output);
    }

    res.json({
      telemetry: contextEngine.internal_telemetry,
      narrative: result.narrative,
      execution: result.execution
    });
  } catch (err) {
    console.error("Chat turn error:", err.message);
    res.status(500).json({ error: err.message });
  }
});
// Background Tick Endpoint
app.post('/api/tick', async (req, res) => {
  try {
    if (contextEngine.internal_telemetry) {
      contextEngine.internal_telemetry.pressure = Math.min(1.0, contextEngine.internal_telemetry.pressure + 0.10);
    }

    const idleText = "[User Silent - Autonomous Idle Evaluation]";
    const contextBundle = contextEngine.buildBundle(idleText);
    contextBundle.message = idleText;
    contextBundle.userMessage = idleText;
    contextBundle.user_input = idleText;

    const result = await dualBrain.processTurn(contextBundle);

    if (result.execution && result.execution.action === 'SPEAK_ALOUD' && result.execution.speech_output) {
      contextEngine.addHistory('assistant', result.execution.speech_output);
    }

    res.json({
      telemetry: contextEngine.internal_telemetry,
      narrative: result.narrative,
      execution: result.execution
    });
  } catch (err) {
    console.error("Tick error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`🚀 PaPeko Dual-Brain Control Panel live at: http://localhost:3000`);
});