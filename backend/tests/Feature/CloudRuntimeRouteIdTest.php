<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A malformed computer or blob id is "no such route", never a database error (it used to reach PostgreSQL and answer 500). */
class CloudRuntimeRouteIdTest extends TestCase
{
    use RefreshDatabase;

    public function test_malformed_ids_are_not_found_on_runtime_routes(): void
    {
        $good = '00000000-0000-4000-8000-000000000000';
        foreach ([
            ['post', 'api/cloud-runtime/not-a-uuid/host/register'],
            ['post', 'api/cloud-runtime/12345/host/activity'],
            ['get', 'api/cloud-runtime/not-a-uuid/projects/pending'],
            ['post', "api/cloud-runtime/$good/projects/not-a-uuid/done"],
            ['get', 'api/cloud-runtime/not-a-uuid/sync/state'],
            ['get', 'api/cloud-runtime/12345/sync/macs'],
            ['get', "api/cloud-runtime/$good/sync/blobs/not-a-uuid"],
            ['post', 'api/cloud-runtime/not-a-uuid/heartbeat'],
            ['post', 'api/cloud-runtime/not-a-uuid/bootstrap'],
        ] as [$method, $uri]) {
            // The app answers an unmatched URL with 405 (its catch-all OPTIONS route), so "no such route" is 404 or 405.
            $this->assertContains($this->json($method, $uri, [])->getStatusCode(), [404, 405], "$method $uri");
        }
    }

    public function test_well_formed_ids_still_reach_the_runtime_check(): void
    {
        $good = '00000000-0000-4000-8000-000000000000';
        $this->json('get', "api/cloud-runtime/$good/sync/state")->assertStatus(401);
        $this->assertNotSame(404, $this->json('post', "api/cloud-runtime/$good/heartbeat", [])->getStatusCode());
    }
}
