import { readFileSync } from "node:fs";

async function main() {
  try {
    const prompt = readFileSync(0, "utf-8");
    if (!prompt) {
      console.error(JSON.stringify({ ok: false, error: "No prompt provided" }));
      process.exit(1);
    }
    
    const key = process.env.XAI_API_KEY;
    if (!key) {
      console.error(JSON.stringify({ ok: false, error: "XAI_API_KEY not set" }));
      process.exit(1);
    }

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model: "grok-beta",
        messages: [
          {
            role: "system",
            content: "You are an expert autonomous software engineer. The user will provide an objective and the current state of a project. Your task is to output ONLY the required code changes formatted as markdown code blocks. Always provide the full updated file content in the code block, preceded by the file path. No explanations, no pleasantries.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error(JSON.stringify({ ok: false, error: `HTTP ${res.status}: ${err}` }));
      process.exit(1);
    }

    const data = await res.json();
    console.log(JSON.stringify({
      ok: true,
      text: data.choices[0].message.content,
      tokens: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      }
    }));
  } catch (err) {
    console.error(JSON.stringify({ ok: false, error: err.message }));
    process.exit(1);
  }
}

main();
