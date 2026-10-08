<?php
namespace Tests\Feature\CloudComputer;
use App\Services\Vibes\DeviceCheck;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;
class DeviceCheckBitsTest extends TestCase
{
    protected function setUp(): void
    {
        parent::setUp(); $key=openssl_pkey_new(['private_key_type'=>OPENSSL_KEYTYPE_EC,'curve_name'=>'prime256v1']);openssl_pkey_export($key,$pem);
        config(['cache.default'=>'array','vibes.devicecheck_private_key'=>$pem,'vibes.devicecheck_key_id'=>'test','vibes.devicecheck_team_id'=>'test']);
    }
    public function test_guest_grant_preserves_a_used_cloud_trial_bit(): void
    {
        Http::fake(['*/query_two_bits'=>Http::response(['bit0'=>false,'bit1'=>true]),'*/update_two_bits'=>Http::response('')]);
        $this->assertTrue(app(DeviceCheck::class)->markGranted('opaque-test-token'));
        Http::assertSent(fn($r)=>str_ends_with($r->url(),'/update_two_bits') && $r['bit0']===true && $r['bit1']===true);
    }
    public function test_cloud_claim_preserves_guest_bit_and_refuses_a_repeat(): void
    {
        $queries=0; Http::fake(function($r) use (&$queries) {return str_ends_with($r->url(),'/query_two_bits')
            ? Http::response(['bit0'=>true,'bit1'=>$queries++ > 0]) : Http::response('');});
        $this->assertTrue(app(DeviceCheck::class)->claimCloudTrial('opaque-test-token'));
        Http::assertSent(fn($r)=>str_ends_with($r->url(),'/update_two_bits') && $r['bit0']===true && $r['bit1']===true);
        $this->assertFalse(app(DeviceCheck::class)->claimCloudTrial('opaque-test-token'));
    }
    public function test_malformed_or_unavailable_device_proof_never_mints_trial_time(): void
    {
        foreach([['bit0'=>false],['bit0'=>'false','bit1'=>false]] as $body) {
            Http::fake(['*'=>Http::response($body)]);$this->assertFalse(app(DeviceCheck::class)->claimCloudTrial('opaque-test-token'));
            Http::assertNotSent(fn($r)=>str_ends_with($r->url(),'/update_two_bits'));
        }
        Http::fake(['*'=>Http::response('',503)]);$this->assertFalse(app(DeviceCheck::class)->claimCloudTrial('opaque-test-token'));
    }
}
