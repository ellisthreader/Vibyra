<?php
namespace Tests\Feature\CloudComputer;

use App\Models\User;
use App\Services\Account\AccountDeletion;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpKernel\Exception\HttpException;

class AccountDeletionTest extends ComputerTestCase
{
    public function test_account_deletion_cleans_cloud_workspaces_before_deleting_the_user(): void
    {
        $this->createComputer();
        // Keep this regression focused on the workspace FK; the fixture normally
        // enrolls a paid period, which has independent retained ledger ownership.
        DB::table('membership_periods')->where('user_id', $this->user->id)->delete();
        DB::table('membership_orders')->where('user_id', $this->user->id)->delete();
        DB::table('membership_owners')->where('user_id', $this->user->id)->delete();

        $this->assertDatabaseHas('cloud_workspaces', ['user_id' => $this->user->id]);
        app(AccountDeletion::class)->delete($this->user);

        $this->assertDatabaseMissing('users', ['id' => $this->user->id]);
        $this->assertSame(0, DB::table('cloud_workspaces')->where('user_id', $this->user->id)->count());
    }

    public function test_retained_billing_rows_block_deletion_before_cloud_data_is_purged(): void
    {
        $this->createComputer();

        try {
            app(AccountDeletion::class)->delete($this->user);
            $this->fail('Retained billing history should block account deletion.');
        } catch (HttpException $exception) {
            $this->assertSame(409, $exception->getStatusCode());
        }

        $this->assertDatabaseHas('users', ['id' => $this->user->id]);
        $this->assertDatabaseHas('cloud_workspaces', ['user_id' => $this->user->id]);
    }
}
