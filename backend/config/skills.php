<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Vibyra Chat Skills
    |--------------------------------------------------------------------------
    |
    | Slash commands available in the mobile chat composer. Each skill wraps
    | the user's free-form text with a prompt template and may add a system
    | prompt addendum or toggle build-mode token caps.
    |
    | Placeholders inside `prompt_template`:
    |   {{prompt}}    raw user text after the slash command (may be empty)
    |   {{file}}      currently-selected file path (may be empty)
    |
    | Modes:
    |   chat   - default; uses the slim system prompt and 800 `max_tokens`.
    |   build  - uses the runnable-app system prompt and 3000 `max_tokens`.
    |
    */

    'list' => [
        [
            'id' => 'explain',
            'slash' => '/explain',
            'label' => 'Explain code',
            'description' => 'Walk through what the selected code or file does.',
            'category' => 'understand',
            'mode' => 'chat',
            'prompt_template' => "Explain {{file}} in clear, concrete terms. Cover the key types, control flow, and any non-obvious behavior. {{prompt}}",
            'system_prompt_addon' => 'Prefer plain prose over bullet lists. Reference real symbols from the provided context.',
        ],
        [
            'id' => 'debug',
            'slash' => '/debug',
            'label' => 'Debug',
            'description' => 'Diagnose a bug, error, or unexpected behavior.',
            'category' => 'understand',
            'mode' => 'chat',
            'prompt_template' => "Diagnose this issue and suggest the smallest fix. State the root cause first, then the change. {{prompt}}",
            'system_prompt_addon' => 'Be a senior debugger. State root causes, do not speculate. If the cause is not provable from the context, say so.',
        ],
        [
            'id' => 'refactor',
            'slash' => '/refactor',
            'label' => 'Refactor for readability',
            'description' => 'Suggest a cleaner shape with minimal behavior change.',
            'category' => 'modify',
            'mode' => 'chat',
            'prompt_template' => "Refactor this for readability without changing behavior. Show the diff or replacement and call out trade-offs. {{prompt}}",
            'system_prompt_addon' => 'Keep edits surgical. Do not introduce new abstractions unless the user asked for them.',
        ],
        [
            'id' => 'fix',
            'slash' => '/fix',
            'label' => 'Fix the bug',
            'description' => 'Apply a targeted fix to the current file or described issue.',
            'category' => 'modify',
            'mode' => 'chat',
            'prompt_template' => "Fix this. Provide the corrected code and a one-line explanation of what was wrong. {{prompt}}",
            'system_prompt_addon' => 'Output the minimum change needed. No extra refactors.',
        ],
        [
            'id' => 'publish',
            'slash' => '/publish',
            'label' => 'Publish project',
            'description' => 'Open publish settings for the current project.',
            'category' => 'create',
            'mode' => 'chat',
            'prompt_template' => 'Open publish settings for this project. {{prompt}}',
        ],
        [
            'id' => 'research',
            'slash' => '/research',
            'label' => 'Deep research',
            'description' => 'Use web search and project context for a careful researched answer.',
            'category' => 'research',
            'mode' => 'chat',
            'model_key' => 'tool-deep-research',
            'max_tokens' => 16000,
            'web_plugin' => true,
            'prompt_template' => "Do deep research before answering. Use current web results where helpful, compare sources, and separate confirmed facts from inferences. User request: {{prompt}}",
            'system_prompt_addon' => 'Cite source names or URLs when web results are available. Be explicit about uncertainty.',
        ],
        [
            'id' => 'web',
            'slash' => '/web',
            'label' => 'Agent web search',
            'description' => 'Search the web for current information before answering.',
            'category' => 'research',
            'mode' => 'chat',
            'model_key' => 'tool-web-search',
            'max_tokens' => 1200,
            'web_plugin' => true,
            'prompt_template' => "Search the web for current context, then answer this request: {{prompt}}",
            'system_prompt_addon' => 'Use web results for fresh facts. Mention source names or URLs when available.',
        ],
        [
            'id' => 'analyze',
            'slash' => '/analyze',
            'label' => 'Analyze files',
            'description' => 'Analyze the selected project files and explain what matters.',
            'category' => 'understand',
            'mode' => 'chat',
            'model_key' => 'tool-analyze-files',
            'max_tokens' => 1800,
            'prompt_template' => "Analyze the app files and project context. Identify the important files, current behavior, and what should change for this request: {{prompt}}",
            'system_prompt_addon' => 'Use the supplied project files and snippets first. Do not ask the user to run file discovery commands.',
        ],
        [
            'id' => 'build',
            'slash' => '/build',
            'label' => 'Build a runnable preview',
            'description' => 'Generate a self-contained HTML app rendered in the preview.',
            'category' => 'create',
            'mode' => 'build',
            'prompt_template' => "Build a runnable preview: {{prompt}}",
        ],
        [
            'id' => 'style',
            'slash' => '/style',
            'label' => 'Polish UI',
            'description' => 'Improve the visual design of the current screen or generated app.',
            'category' => 'create',
            'mode' => 'build',
            'prompt_template' => "Improve the visual design and polish: {{prompt}}",
            'system_prompt_addon' => 'Focus on layout, spacing, hierarchy, and color. Keep the existing structure unless the user asks otherwise.',
        ],
    ],

];
