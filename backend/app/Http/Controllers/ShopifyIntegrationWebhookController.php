<?php

namespace App\Http\Controllers;

use App\Models\IntegrationConnection;
use App\Services\Integrations\Catalog;
use App\Services\Integrations\IntegrationLock;
use Carbon\CarbonImmutable;
use Illuminate\Http\Request;

class ShopifyIntegrationWebhookController extends Controller
{
    public function __invoke(Request $request)
    {
        $body = $request->getContent();
        $secret = (string) config('integrations.shopify.client_secret');
        abort_unless($secret !== '' && strlen($body) <= 1024 * 1024, 400);
        $signature = base64_encode(hash_hmac('sha256', $body, $secret, true));
        abort_unless(hash_equals($signature, (string) $request->header('X-Shopify-Hmac-Sha256')), 401);
        $shop = Catalog::shop((string) $request->header('X-Shopify-Shop-Domain'));
        $topic = $request->header('X-Shopify-Topic');
        abort_unless(in_array($topic, ['app/uninstalled', 'customers/data_request', 'customers/redact', 'shop/redact'], true), 422);
        // Read results are returned on demand, never retained by this broker. There are no
        // customer records to export/redact. Uninstall and shop redaction remove credentials/grants.
        if (in_array($topic, ['app/uninstalled', 'shop/redact'], true)) {
            $payload = json_decode($body, true);
            $id = $payload['shop_id'] ?? $payload['id'] ?? null;
            abort_unless(is_scalar($id) && ctype_digit((string) $id), 422);
            // HMAC covers the body, not routing headers. Bind its shop ID before deleting anything.
            $triggered = (string) $request->header('X-Shopify-Triggered-At');
            abort_unless(preg_match('/^\d{4}-\d{2}-\d{2}T/', $triggered), 422);
            try {
                $at = CarbonImmutable::parse($triggered)->utc();
            } catch (\Throwable) {
                abort(422);
            }
            abort_if($at->greaterThan(now()->addMinutes(5)), 422);
            IntegrationLock::run(0, 'shopify', $shop, fn () => IntegrationConnection::query()->where('shop_host', $shop)
                ->where('external_id', 'gid://shopify/Shop/'.$id)->where('authorized_at', '<=', $at)->delete());
        }

        return response()->json(['ok' => true])->header('Cache-Control', 'no-store');
    }
}
