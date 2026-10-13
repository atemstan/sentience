export class ContextEngine {
  constructor() {
    this.short_term_history = [];
    this.internal_telemetry = {
      pressure: 0.0,
      entity_nature: "Disembodied Local AI Software",
      interface_type: "Browser Control Panel"
    };
    this.last_interaction_time = Date.now();
  }

  addHistory(role, text) {
    this.short_term_history.push({ role, text });
    if (this.short_term_history.length > 10) {
      this.short_term_history.shift(); // Keep history short and relevant
    }
  }

  buildBundle(userInput = "") {
    const now = Date.now();
    const delaySeconds = Math.round((now - this.last_interaction_time) / 1000);
    this.last_interaction_time = now;

    // Estimate user pacing signal
    let pacingSignal = "NORMAL";
    if (delaySeconds < 3) pacingSignal = "FAST_BURST";
    if (delaySeconds > 25) pacingSignal = "PAUSED_IDLE";

    return {
      user_input: userInput,
      short_term_history: this.short_term_history,
      internal_telemetry: this.internal_telemetry,
      input_metadata: {
        character_count: userInput.length,
        response_delay_seconds: delaySeconds,
        pacing_signal: pacingSignal
      }
    };
  }
}