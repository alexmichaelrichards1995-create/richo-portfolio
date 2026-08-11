(async function() {
  // This test validates ai_v3 call behavior when provider=openai but OPENAI_API_KEY is missing.
  process.env.AI_PROVIDER = 'openai';
  delete process.env.OPENAI_API_KEY;
  const { callAI } = require('../api/ai_v3');
  try {
    await callAI({ prompt: 'Test prompt', max_tokens: 50 });
    console.error('Expected error when OPENAI_API_KEY missing, but call succeeded');
    process.exit(1);
  } catch (err) {
    if (String(err).includes('OPENAI_API_KEY')) {
      console.log('openai_preview test passed (key missing throws)');
      process.exit(0);
    }
    console.error('openai_preview test failed', err);
    process.exit(1);
  }
})();
