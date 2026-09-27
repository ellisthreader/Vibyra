<?php

namespace Tests\Feature;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class WebsiteFaqAskTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp();
        Cache::flush();
        config()->set('services.openai.key', 'test-key');
        config()->set('services.openai.chat_url', 'https://openai.test/v1/chat/completions');
    }

    public function test_it_answers_from_the_knowledge_and_live_plans(): void
    {
        Http::fake([
            'openai.test/*' => Http::response([
                'choices' => [['message' => ['content' => "  Yes, routines run while the app is open.\n\n"]]],
            ]),
        ]);

        $this->postJson('/web-api/faq/ask', ['question' => 'Can teammates run on a schedule?'])
            ->assertOk()
            ->assertJson(['ok' => true, 'answer' => 'Yes, routines run while the app is open.', 'cached' => false]);

        Http::assertSent(function ($request) {
            $system = $request['messages'][0]['content'];

            return $request['model'] === 'gpt-5-nano'
                && $request['reasoning_effort'] === 'low'
                && $request['messages'][1]['content'] === 'Can teammates run on a schedule?'
                && str_contains($system, 'Routines run while Vibyra is open')
                && str_contains($system, 'Builder: £49 per month or £585 per year, 1000 credits per month, 3 active projects');
        });
    }

    public function test_the_same_question_is_answered_once(): void
    {
        Http::fake(['openai.test/*' => Http::response(['choices' => [['message' => ['content' => 'Windows and Linux today.']]]])]);

        $this->postJson('/web-api/faq/ask', ['question' => 'Which computers can I use?'])->assertOk();
        $this->postJson('/web-api/faq/ask', ['question' => '  which computers can I use ?? '])
            ->assertOk()
            ->assertJson(['ok' => true, 'answer' => 'Windows and Linux today.', 'cached' => true]);

        Http::assertSentCount(1);
    }

    public function test_a_reply_lost_to_reasoning_is_asked_again_with_less_of_it(): void
    {
        Http::fakeSequence()
            ->push(['choices' => [['finish_reason' => 'length', 'message' => ['content' => '']]]])
            ->push(['choices' => [['message' => ['content' => 'Your computer runs the terminals.']]]]);

        $this->postJson('/web-api/faq/ask', ['question' => 'Does the phone run the terminals?'])
            ->assertOk()
            ->assertJson(['ok' => true, 'answer' => 'Your computer runs the terminals.']);

        Http::assertSentCount(2);
        Http::assertSent(fn ($request) => $request['reasoning_effort'] === 'minimal');
    }

    public function test_updated_knowledge_does_not_reuse_an_old_answer(): void
    {
        Http::fakeSequence()
            ->push(['choices' => [['message' => ['content' => 'Builder costs £49 per month.']]]])
            ->push(['choices' => [['message' => ['content' => 'Builder costs £55 per month.']]]]);

        $question = ['question' => 'How much does Builder cost?'];
        $this->postJson('/web-api/faq/ask', $question)
            ->assertOk()->assertJson(['cached' => false]);
        $this->postJson('/web-api/faq/ask', $question)
            ->assertOk()->assertJson(['cached' => true]);

        config()->set('billing.plans.builder.monthly_price_pence', 5500);

        $this->postJson('/web-api/faq/ask', $question)
            ->assertOk()->assertJson(['answer' => 'Builder costs £55 per month.', 'cached' => false]);

        Http::assertSentCount(2);
    }

    public function test_it_rejects_an_empty_or_oversized_question(): void
    {
        Http::fake();

        $this->postJson('/web-api/faq/ask', ['question' => '  '])->assertStatus(422)->assertJson(['ok' => false]);
        $this->postJson('/web-api/faq/ask', ['question' => str_repeat('a', 601)])->assertStatus(422)->assertJson(['ok' => false]);

        Http::assertNothingSent();
    }

    public function test_a_provider_failure_is_a_calm_503(): void
    {
        Http::fake(['openai.test/*' => Http::response(['error' => 'down'], 500)]);

        $this->postJson('/web-api/faq/ask', ['question' => 'Is my code private?'])
            ->assertStatus(503)
            ->assertJson(['ok' => false]);
    }

    public function test_it_throttles_a_flood_of_questions(): void
    {
        Http::fake(['openai.test/*' => Http::response(['choices' => [['message' => ['content' => 'Sure.']]]])]);

        for ($i = 0; $i < 12; $i++) {
            $this->postJson('/web-api/faq/ask', ['question' => "Question number {$i} please"])->assertOk();
        }

        $this->postJson('/web-api/faq/ask', ['question' => 'One too many?'])->assertStatus(429);
    }
}
