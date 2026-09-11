<?php

namespace App\Services\ChatConnectors;

use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;

/**
 * What one account has connected. The credential is encrypted with the
 * application key on the way in and is never returned to a client: what the
 * install page shows is the account label the provider itself reported.
 */
class Installs
{
    public function __construct(private readonly Registry $registry) {}

    /** @return array<string, object> install rows keyed by integration slug */
    public function all(int $userId): array
    {
        return DB::table('vibes_integration_installs')->where('user_id', $userId)->get()->keyBy('integration')->all();
    }

    /** Slugs this account can actually use, ignoring rows for retired integrations. */
    public function installed(int $userId): array
    {
        return array_values(array_intersect(array_keys($this->all($userId)), $this->registry->slugs()));
    }

    /**
     * Store a pasted key only after it has proved it reaches an account, so a
     * mistyped key is refused here rather than in the middle of someone's reply.
     */
    public function connect(int $userId, string $slug, string $credential): void
    {
        try { $label = $this->registry->for($slug)->connect($credential); }
        catch (\Throwable $e) { abort(422, $e->getMessage()); }
        $where = ['user_id' => $userId, 'integration' => $slug];
        $values = ['credential' => Crypt::encryptString($credential), 'account_label' => $label,
            'connected_at' => now(), 'updated_at' => now()];
        if (DB::table('vibes_integration_installs')->where($where)->exists()) {
            DB::table('vibes_integration_installs')->where($where)->update($values);
            return;
        }
        DB::table('vibes_integration_installs')->insert([...$where, ...$values, 'created_at' => now()]);
    }

    public function disconnect(int $userId, string $slug): void
    {
        DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->delete();
    }

    /** The stored key for one call, decrypted only for as long as that call takes. */
    public function credential(int $userId, string $slug): string
    {
        $row = DB::table('vibes_integration_installs')->where('user_id', $userId)->where('integration', $slug)->first();
        $name = (string) config('chat_connectors.catalogue.'.$slug.'.name', $slug);
        abort_unless($row, 422, 'Connect '.$name.' before using it.');
        DB::table('vibes_integration_installs')->where('id', $row->id)->update(['last_used_at' => now()]);
        return Crypt::decryptString($row->credential);
    }
}
