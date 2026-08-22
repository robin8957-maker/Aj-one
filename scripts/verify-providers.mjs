/**
 * Provider self-test verification runner
 */
import { verifyProvider } from '../src/runtime/model-providers.ts';

async function main() {
  console.log('=== VERIFY_PROVIDER DIAGNOSTIC SELF-TEST ===\n');

  for (const prov of ['anthropic', 'openai_compatible', 'ollama_local']) {
    console.log(`--- Checking Provider: ${prov} ---`);
    const res = await verifyProvider(prov);
    console.log(`Provider: ${res.provider}`);
    console.log(`OK: ${res.ok}`);
    console.log(`HTTP Status: ${res.httpStatus ?? 'N/A'}`);
    console.log(`Model Echoed: ${res.modelEchoed ?? 'N/A'}`);
    console.log(`Stop Reason: ${res.stopReason ?? 'N/A'}`);
    console.log(`Tokens: in=${res.tokensIn}, out=${res.tokensOut}`);
    console.log(`Latency: ${res.latencyMs}ms`);
    if (res.error) {
      console.log(`Error Code: ${res.error.code}`);
      console.log(`Error Message: ${res.error.message}`);
    }
    if (res.rawResponse) {
      console.log(`Raw Response: ${res.rawResponse}`);
    }
    console.log('');
  }
}

main();