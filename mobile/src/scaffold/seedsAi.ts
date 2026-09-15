import { file } from './helpers';
import { nodePackage } from './seeds';
import type { TemplateSeed } from './types';

// Starters for the "AI app" kind. Both call Claude through the official
// Anthropic SDK for their language, never a raw HTTP shim, and both name the
// current default model rather than a dated snapshot id.

export const CLAUDE_NODE_SEEDS: TemplateSeed[] = [
  file('package.json', nodePackage('node index.js')),
  file('index.js', `import Anthropic from "@anthropic-ai/sdk";

// Reads ANTHROPIC_API_KEY from the environment.
const client = new Anthropic();

const response = await client.messages.create({
  model: "claude-opus-5",
  max_tokens: 16000,
  messages: [{ role: "user", content: "Say hello from {{name}}." }],
});

for (const block of response.content) {
  if (block.type === "text") console.log(block.text);
}
`),
  file('README.md', `# {{name}}

    export ANTHROPIC_API_KEY=sk-ant-...
    node index.js
`),
];

export const CLAUDE_PYTHON_SEEDS: TemplateSeed[] = [
  file('main.py', `import anthropic

# Reads ANTHROPIC_API_KEY from the environment.
client = anthropic.Anthropic()

response = client.messages.create(
    model="claude-opus-5",
    max_tokens=16000,
    messages=[{"role": "user", "content": "Say hello from {{name}}."}],
)

for block in response.content:
    if block.type == "text":
        print(block.text)
`),
  file('README.md', `# {{name}}

    export ANTHROPIC_API_KEY=sk-ant-...
    .venv/bin/python main.py
`),
];
