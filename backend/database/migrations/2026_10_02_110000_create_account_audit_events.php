<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/*
 * Roadmap Part 11: the account's own activity log. Append-only (the model refuses update/delete and a database
 * trigger refuses UPDATE); rows go only when the account itself is deleted. Detail is bounded scalars, never content.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('account_audit_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('event', 60);
            $t->string('actor', 12)->default('account');
            $t->json('detail')->nullable();
            $t->string('ip_address', 45)->nullable();
            $t->timestamp('created_at');
            $t->index(['user_id', 'id']);
        });
        $driver = DB::connection()->getDriverName();
        if ($driver === 'sqlite') {
            DB::unprepared("CREATE TRIGGER account_audit_events_no_update BEFORE UPDATE ON account_audit_events BEGIN SELECT RAISE(ABORT, 'account_audit_events is append-only'); END");
        } elseif ($driver === 'pgsql') {
            DB::unprepared("CREATE FUNCTION account_audit_events_refuse() RETURNS trigger AS \$\$ BEGIN RAISE EXCEPTION 'account_audit_events is append-only'; END; \$\$ LANGUAGE plpgsql");
            DB::unprepared('CREATE TRIGGER account_audit_events_no_update BEFORE UPDATE ON account_audit_events FOR EACH ROW EXECUTE FUNCTION account_audit_events_refuse()');
        }
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() === 'pgsql') {
            DB::unprepared('DROP TRIGGER IF EXISTS account_audit_events_no_update ON account_audit_events');
            DB::unprepared('DROP FUNCTION IF EXISTS account_audit_events_refuse()');
        }
        Schema::dropIfExists('account_audit_events');
    }
};
