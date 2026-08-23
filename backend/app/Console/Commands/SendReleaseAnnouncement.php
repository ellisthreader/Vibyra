<?php

namespace App\Console\Commands;

use App\Mail\VibyraReleaseAnnouncement;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Throwable;

class SendReleaseAnnouncement extends Command
{
    protected $signature = 'vibyra:announce-release {version=0.1.7} {--send : Deliver the announcement}';

    protected $description = 'Preview or send the latest Vibyra release announcement once per account.';

    public function handle(): int
    {
        $version = trim((string) $this->argument('version'));
        if (preg_match('/\A\d+\.\d+\.\d+\z/', $version) !== 1) {
            $this->error('Version must use major.minor.patch format.');

            return self::INVALID;
        }

        $users = User::query()->whereNotNull('email')->orderBy('id')->get()
            ->filter(fn (User $user) => $this->eligible((string) $user->email));
        $pending = $users->reject(fn (User $user) => DB::table('release_announcement_deliveries')
            ->where('user_id', $user->id)->where('version', $version)->exists());
        $this->info("{$pending->count()} account(s) are pending Vibyra {$version}.");

        if (! $this->option('send')) {
            $this->comment('Dry run only. Add --send after the production mail transport is ready.');

            return self::SUCCESS;
        }
        if (config('mail.default') === 'log') {
            $this->error('Delivery refused: the production mailer is still set to log.');

            return self::FAILURE;
        }

        $failed = 0;
        foreach ($pending as $user) {
            try {
                Mail::to($user->email)->send(new VibyraReleaseAnnouncement(
                    $this->firstName((string) $user->name),
                    $version,
                ));
                DB::table('release_announcement_deliveries')->updateOrInsert(
                    ['user_id' => $user->id, 'version' => $version],
                    ['sent_at' => now(), 'created_at' => now(), 'updated_at' => now()],
                );
            } catch (Throwable $error) {
                report($error);
                $failed++;
            }
        }

        $sent = $pending->count() - $failed;
        $this->info("Delivered {$sent} announcement(s); {$failed} failed.");

        return $failed === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function eligible(string $email): bool
    {
        $email = strtolower(trim($email));

        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false
            && ! str_ends_with($email, '@example.com')
            && ! str_ends_with($email, '@example.test')
            && ! str_ends_with($email, '@invalid');
    }

    private function firstName(string $name): string
    {
        return explode(' ', trim($name) ?: 'there')[0];
    }
}
