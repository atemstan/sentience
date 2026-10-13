import readline from 'readline';
import { initDatabase } from './db.js';
import { SocialBrain } from './SocialBrain.js';

async function main() {
  const db = await initDatabase();
  const brain = new SocialBrain(db);

  console.log("⚡ Booting Autonomous Continuous-Thought Brain...\n");

  let isThinking = false;
  let userMessageQueue = null;

  // Setup non-blocking terminal CLI
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const listenForInput = () => {
    rl.question('\nYou: ', (input) => {
      if (input.trim().toLowerCase() === 'exit') process.exit(0);
      userMessageQueue = input; // Inject user message into her thought stream
      listenForInput();
    });
  };

  listenForInput();

  // -------------------------------------------------------------
  // CONTINUOUS INNER MONOLOGUE LOOP (Always Generating Tokens)
  // -------------------------------------------------------------
  async function runThoughtCycle() {
    if (isThinking) return;
    isThinking = true;

    let incomingInput = null;
    let tone = 'NEUTRAL';
    let topic = 'general';

    // Check if user interrupted her thought stream with a message
    if (userMessageQueue) {
      incomingInput = userMessageQueue;
      userMessageQueue = null; // Clear queue

      if (incomingInput.match(/bad|wrong|awkward|stupid|fail/i)) tone = 'CRITICISM_OR_TEASING';
      if (incomingInput.match(/good|thanks|great|awesome/i)) tone = 'WARM_VALIDATION';
      if (incomingInput.match(/code|c|function|bug|math|calculus/i)) topic = 'coding';
    } else {
      // Natural passive decay when user hasn't spoken
      brain.boredom = Math.min(1.0, brain.boredom + 0.05);
    }

    // Execute LLM Thought Pass
    const turnResult = await brain.processTurn(incomingInput, tone, topic);

    // 1. Always display her active stream-of-consciousness thought
    console.log(`\n💭 [Inner Monologue] : ${turnResult.internal_thought}`);

    // 2. Decide action based on her LLM decision
    if (turnResult.action === "SPEAK_ALOUD" || incomingInput) {
      console.log(`🎭 [Emotion State]   : ${turnResult.emotion}`);
      console.log(`🗣️  ${brain.config.name}: "${turnResult.speech_output}"`);
      brain.boredom = 0.0; // Reset boredom upon external speech
    } else {
      console.log(`🤫 [Action]            : Kept thought internal... overthinking.`);
    }

    isThinking = false;

    // Small 2-second pause between thought cycles to prevent VRAM overload
    setTimeout(runThoughtCycle, 2000);
  }

  // Kick off the infinite cognitive cycle
  runThoughtCycle();
}

main().catch(console.error);