<?php

namespace App\Services\Vibes\Auto;

/**
 * The evidence tables the router reads a prompt with. Each entry is a phrase and
 * the weight of the evidence it carries: roughly, how far that phrase alone moves
 * the answer, between 0 and 1. `Signals` combines them as independent evidence
 * rather than adding them up, so a prompt that says "refactor" five times is no
 * more difficult than one that says it once.
 *
 * A trailing `*` means prefix, so `optimi*` covers optimise, optimize and
 * optimization; every other phrase is matched whole, on word boundaries. That is
 * not decoration. The router this replaces matched bare substrings, so `fix ` fired
 * on "prefix", `test ` on "latest" and `ui ` on "gui" - a prompt about renaming a
 * prefix was routed as agentic coding. Boundary matching cannot make that mistake.
 */
final class Lexicon
{
    /**
     * Work that needs raw capability - breadth, precision, or holding a whole design
     * in one answer. This axis is how *hard* the task is, not how much step-by-step
     * thinking it rewards. The two come apart constantly, and conflating them is the
     * main way a router of this kind goes wrong: a logic puzzle is easy and needs
     * deep thought, a 400-line file rename is trivial and needs none.
     */
    public const DIFFICULTY = [
        'architect*' => 0.7, 'design a system' => 0.78, 'system design' => 0.78, 'redesign' => 0.58,
        'distributed' => 0.68, 'concurren*' => 0.7, 'race condition' => 0.78, 'deadlock' => 0.74,
        'thread safe' => 0.68, 'thread-safe' => 0.68, 'atomic*' => 0.6, 'idempotent' => 0.6,
        'eventual consistency' => 0.74, 'consistency model' => 0.74, 'invariant*' => 0.62,
        'scalab*' => 0.62, 'high availability' => 0.62, 'fault tolerant' => 0.66, 'state machine' => 0.6,
        'security review' => 0.76, 'threat model' => 0.8, 'vulnerab*' => 0.68, 'cryptograph*' => 0.72,
        'authorization' => 0.5, 'authentication' => 0.48, 'accessib*' => 0.35, 'sandbox*' => 0.5,
        'compiler' => 0.68, 'parser' => 0.58, 'interpreter' => 0.64, 'type system' => 0.7,
        'algorithm*' => 0.58, 'complexity' => 0.5, 'optimi*' => 0.5, 'performance' => 0.44,
        'memory leak' => 0.64, 'profil*' => 0.5, 'bottleneck' => 0.56,
        'migrat*' => 0.5, 'transaction*' => 0.48, 'rollback' => 0.5, 'corrupt*' => 0.6,
        'refactor*' => 0.34, 'rewrite' => 0.28, 'porting' => 0.45, 'port to' => 0.45,
        'production incident' => 0.8, 'outage' => 0.7, 'data loss' => 0.8,
        'high stakes' => 0.7, 'high-stakes' => 0.7, 'mission critical' => 0.7,
        'same time' => 0.42, 'simultaneous*' => 0.55,
        'deterministic*' => 0.6, 'conflict*' => 0.5, 'consensus' => 0.7, 'replication' => 0.6,
        'shard*' => 0.62, 'offline-first' => 0.6, 'end to end' => 0.48, 'end-to-end' => 0.48, 'from scratch' => 0.52, 'greenfield' => 0.55,
        'trade-off*' => 0.4, 'trade off' => 0.4, 'tradeoff*' => 0.4, 'protocol' => 0.5,
    ];

    /**
     * Work that rewards thinking before answering. Almost none of this says anything
     * about difficulty: "why does this fail" can be one line of code, and "walk me
     * through it" is often a beginner's question. What they share is that a first
     * guess is usually wrong and a second pass usually fixes it.
     */
    public const DELIBERATION = [
        'think*' => 0.6, 'think step' => 0.85, 'step by step' => 0.85, 'step-by-step' => 0.85,
        'reason about' => 0.75, 'reasoning' => 0.58, 'carefully' => 0.6, 'thorough*' => 0.6,
        'why does' => 0.7, 'why is' => 0.64, 'why would' => 0.66, 'why did' => 0.68,
        'why are' => 0.64, 'why' => 0.5, 'explain why' => 0.72, 'how come' => 0.6,
        'root cause' => 0.82, 'diagnos*' => 0.7, 'figure out' => 0.66, 'work out' => 0.56,
        'investigat*' => 0.62, 'look into' => 0.55, 'track down' => 0.65,
        'prove' => 0.78, 'proof' => 0.7, 'proven' => 0.5, 'deriv*' => 0.66, 'verify that' => 0.6,
        'trace through' => 0.75, 'walk me through' => 0.6, 'walk through' => 0.56,
        'compar*' => 0.54, 'versus' => 0.5, ' vs ' => 0.5, 'which is better' => 0.62,
        'evaluat*' => 0.56, 'assess*' => 0.54, 'pros and cons' => 0.62, 'weigh up' => 0.6,
        'is it safe' => 0.65, 'safe to' => 0.55, 'will it break' => 0.6, 'risk*' => 0.48,
        'review this' => 0.6, 'review the' => 0.55, 'code review' => 0.65, 'regex' => 0.45,
        'design a' => 0.5, 'design an' => 0.5, 'design a system' => 0.7, 'architect*' => 0.62, 'propose' => 0.48,
        'security review' => 0.6, 'threat model' => 0.65, 'audit' => 0.55, 'come up with' => 0.5,
        'plan' => 0.5, 'planning' => 0.5, 'strategy' => 0.5, 'best way' => 0.5, 'approach' => 0.42,
        'edge case*' => 0.68, 'corner case*' => 0.68, 'what happens if' => 0.6, 'what if' => 0.48,
        'debug*' => 0.58, 'not working' => 0.55, 'unexpected*' => 0.56, 'inconsistent*' => 0.6,
        'intermittent*' => 0.72, 'flaky' => 0.68, 'sometimes fails' => 0.72, 'only fails' => 0.7,
        'subtle' => 0.64, 'tricky' => 0.62, 'confusing' => 0.52, 'stuck' => 0.5,
        'prioriti*' => 0.5, 'decid*' => 0.5, 'recommend*' => 0.46, 'should i' => 0.5,
        'should we' => 0.5, 'calculat*' => 0.54, 'how many' => 0.5, 'probabilit*' => 0.65,
        'ambigu*' => 0.6, 'implications' => 0.58, 'consequences' => 0.56, 'reconcil*' => 0.55,
    ];

    /**
     * Work whose answer the question already fixes. Retrieval, mechanical
     * transformation and boilerplate get worse, not better, from a model that
     * deliberates: it spends the budget second-guessing a settled answer. These
     * weights subtract, and they are why "translate this to Python" and "should we
     * use Python" do not land on the same rung.
     */
    public const MECHANICAL = [
        'renam*' => 0.6, 'reformat*' => 0.7, 'format this' => 0.68, 'indent*' => 0.68,
        'translat*' => 0.55, 'convert to' => 0.5, 'convert this' => 0.55, 'transcrib*' => 0.7,
        'boilerplate' => 0.6, 'scaffold*' => 0.5, 'stub out' => 0.6, 'template' => 0.42,
        'what does' => 0.32, 'what is the' => 0.38, 'syntax for' => 0.62, 'command for' => 0.6,
        'shortcut' => 0.58, 'flag for' => 0.58, 'one liner' => 0.72, 'one-liner' => 0.72,
        'quick question' => 0.6, 'simple question' => 0.65, 'list of' => 0.42,
        'give me a list' => 0.6, 'example of' => 0.38, 'typo*' => 0.7, 'spelling' => 0.7,
        'lint*' => 0.5, 'prettier' => 0.58, 'add a comment' => 0.6, 'docstring*' => 0.5,
        'changelog' => 0.5, 'bump the version' => 0.7, 'copy and paste' => 0.5,
    ];

    /** Asks for a short answer. Real, and separate from the task being easy. */
    public const BREVITY = [
        'briefly' => 0.75, 'in short' => 0.7, 'short answer' => 0.8, 'tl;dr' => 0.8, 'tldr' => 0.8,
        'one sentence' => 0.85, 'in a sentence' => 0.8, 'one word' => 0.85, 'just tell me' => 0.7,
        'just the' => 0.5, 'quickly' => 0.58, 'concise*' => 0.7, 'summar*' => 0.34,
        'no explanation' => 0.85, "don't explain" => 0.8, 'without explaining' => 0.8,
        'keep it short' => 0.85, 'bullet points' => 0.5,
    ];

    /**
     * What kind of work it is. A model's strength is not one number, so these steer
     * *which* model of a given strength is chosen rather than how strong it must be.
     * Every specialty scores independently: a prompt can be both a frontend task and
     * a debugging one, and in practice usually is.
     */
    public const SPECIALTY = [
        'frontend' => ['frontend' => 0.8, 'front-end' => 0.8, 'css' => 0.7, 'html' => 0.6,
            'tailwind' => 0.75, 'component*' => 0.5, 'responsive' => 0.7, 'layout' => 0.55,
            'animat*' => 0.62, 'svg' => 0.6, 'shader' => 0.7, 'webgl' => 0.75, 'three.js' => 0.75,
            'design*' => 0.4, 'ui' => 0.55, 'ux' => 0.6, 'landing page' => 0.75, 'stylesheet' => 0.7,
            'react' => 0.5, 'vue' => 0.55, 'svelte' => 0.65, 'swiftui' => 0.6, 'pixel perfect' => 0.8,
            'hook*' => 0.55, 'form' => 0.5, 'input' => 0.35, 'modal' => 0.5, 'toggle' => 0.4,
            'accessib*' => 0.6, 'dark mode' => 0.6, 'colour*' => 0.44, 'color*' => 0.4, 'font' => 0.48],
        'code' => ['implement*' => 0.68, 'refactor*' => 0.68, 'function' => 0.5, 'method' => 0.44,
            'variable' => 0.44, 'compil*' => 0.52, 'typescript' => 0.65, 'javascript' => 0.6,
            'python' => 0.6, 'rust' => 0.62, 'golang' => 0.65, 'php' => 0.6, 'java' => 0.55,
            'swift' => 0.55, 'kotlin' => 0.6, 'sql' => 0.55, 'api' => 0.44, 'endpoint*' => 0.6, 'database' => 0.55,
            'postgres*' => 0.6, 'mysql' => 0.6, 'sqlite' => 0.6, 'redis' => 0.6, 'mongo*' => 0.6,
            'query' => 0.45, 'schema' => 0.5, 'index' => 0.4, 'orm' => 0.55, 'retry' => 0.5,
            'backoff' => 0.6, 'http' => 0.5, 'webhook*' => 0.6, 'middleware' => 0.6,
            'validat*' => 0.55, 'promise' => 0.5, 'async' => 0.5, 'await' => 0.5,
            'callback*' => 0.5, 'cache*' => 0.5, 'queue' => 0.5, 'regex' => 0.5, 'serial*' => 0.5,
            'unit test*' => 0.6, 'test suite' => 0.55, 'pull request' => 0.5, 'codebase' => 0.6,
            'repository' => 0.42, 'commit' => 0.42, 'dependenc*' => 0.44],
        'debug' => ['error*' => 0.58, 'exception' => 0.68, 'stack trace' => 0.85, 'traceback' => 0.85,
            'crash*' => 0.68, 'fail*' => 0.55, 'broken' => 0.55, 'bug' => 0.65, 'bugs' => 0.6,
            'null pointer' => 0.7, 'segfault' => 0.8, 'panic' => 0.55, 'timeout' => 0.52,
            'hangs' => 0.6, 'infinite loop' => 0.7, 'regression' => 0.65, 'reproduc*' => 0.6,
            'freez*' => 0.62, 'stall*' => 0.55, 'unresponsive' => 0.6, 'slow' => 0.3, 'leak*' => 0.55,
            'silent*' => 0.55, 'skipped' => 0.45, 'never resolve*' => 0.6, 'out of memory' => 0.65, 'oom' => 0.6],
        'analysis' => ['research' => 0.72, 'investigat*' => 0.64, 'analys*' => 0.7, 'analyz*' => 0.7,
            'dataset' => 0.7, 'statistic*' => 0.65, 'benchmark*' => 0.6, 'evidence' => 0.58,
            'literature' => 0.7, 'report on' => 0.55, 'metrics' => 0.5],
        'math' => ['equation*' => 0.8, 'integral' => 0.82, 'derivative*' => 0.78, 'matrix' => 0.68,
            'theorem' => 0.85, 'algebra*' => 0.8, 'geometr*' => 0.72, 'calculus' => 0.85,
            'probabilit*' => 0.72, 'combinator*' => 0.75, 'modulo' => 0.6, 'factorial' => 0.7],
        'prose' => ['draft' => 0.48, 'email' => 0.58, 'blog' => 0.65, 'essay' => 0.7, 'story' => 0.68,
            'poem' => 0.8, 'headline' => 0.6, 'tone' => 0.48, 'rephras*' => 0.65, 'proofread' => 0.7,
            'documentation' => 0.48, 'readme' => 0.55, 'copy for' => 0.6],
        'ops' => ['docker*' => 0.72, 'kubernetes' => 0.75, 'terraform' => 0.75, 'ci/cd' => 0.7,
            'pipeline' => 0.5, 'deploy*' => 0.58, 'nginx' => 0.7, 'systemd' => 0.7, 'cron' => 0.58,
            'aws' => 0.58, 'environment variable*' => 0.6, 'kubectl' => 0.75],
    ];

    /** Whole-project work: it needs a window, not only a better model. */
    public const BREADTH = [
        'entire codebase' => 0.9, 'whole codebase' => 0.9, 'across the repo' => 0.85,
        'repo-wide' => 0.85, 'across the project' => 0.8, 'every file' => 0.8, 'all the files' => 0.8,
        'multi-file' => 0.7, 'monorepo' => 0.7, 'whole project' => 0.8, 'long context' => 0.75,
        'large document' => 0.7, 'throughout the' => 0.55, 'everywhere' => 0.52, 'all of them' => 0.5,
    ];
}
