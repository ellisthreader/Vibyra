<?php
namespace App\Console\Commands;
use Illuminate\Console\Command;
use Symfony\Component\Process\Process;
final class ConfigureJev extends Command
{
    protected $signature = 'vibyra:configure-jev';
    protected $description = 'Store a replacement dedicated Jev key locally through a hidden prompt; leave inference disabled';
    public function handle(): int
    {
        if (app()->environment('production') || !$this->input->isInteractive()) {
            $this->error('Use the deployment secret manager in production. Local setup requires an interactive terminal.');
            return self::FAILURE;
        }
        $path = base_path('.env');
        $check = new Process(['git', 'check-ignore', '-q', '--', $path], base_path());
        $check->run();
        if (!$check->isSuccessful() || is_link($path) || !is_file($path)) {
            $this->error('Setup requires an existing, Git-ignored, non-symlink backend .env file.');
            return self::FAILURE;
        }
        $this->line('Use a NEW OpenRouter inference key with a $5 or lower lifetime limit, no reset, and BYOK included in the limit.');
        $this->line('Revoke any key previously shared in chat. This prompt does not echo or accept a command-line key.');
        $temp = null;
        try {
            $key = $this->secret('Replacement OpenRouter key', false);
            if (!is_string($key) || !preg_match('/^sk-or-v1-[A-Za-z0-9]{32,128}$/D', $key)) throw new \RuntimeException();
            if (!chmod($path, 0600)) throw new \RuntimeException();
            $text = file_get_contents($path);
            if ($text === false) throw new \RuntimeException();
            foreach (['JEV_API_KEY' => $key, 'JEV_DECISIONS_MODE' => 'off'] as $name => $value) {
                $text = preg_replace('/^'.preg_quote($name, '/').'\s*=.*\R?/m', '', $text);
                $text = rtrim($text)."\n".$name.'='.$value."\n";
            }
            $temp = tempnam(dirname($path), '.jev-secret-');
            if (!$temp || !chmod($temp, 0600) || file_put_contents($temp, $text, LOCK_EX) === false || !rename($temp, $path)) throw new \RuntimeException();
            $this->callSilent('config:clear');
            $this->info('Saved locally with owner-only permissions. Jev remains off. Restart workers after configuration changes.');
            return self::SUCCESS;
        } catch (\Throwable) {
            $this->error('Key setup could not finish. No credential details were logged.');
            return self::FAILURE;
        } finally {
            if ($temp && is_file($temp)) @unlink($temp);
            unset($key, $text);
        }
    }
}
