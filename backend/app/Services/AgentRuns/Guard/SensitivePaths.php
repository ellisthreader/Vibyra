<?php

namespace App\Services\AgentRuns\Guard;

/**
 * Files an agent's file tools refuse to read unless the person allowed them for that project (roadmap Part 16): `.env*`,
 * private keys, cloud and package credentials. Judged by name only, case-insensitively; `\` counts as a separator.
 * Mirrored by `SensitivePaths` in vibyra-core and held to docs/secret-guard-vectors.json.
 */
final class SensitivePaths
{
    private const DIRECTORIES = ['.ssh', '.aws', '.gnupg', '.kube', '.azure', '.gcloud', '.password-store'];
    private const EXACT = ['.envrc', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519', '.npmrc', '.pypirc', '.netrc', '_netrc', '.pgpass',
        '.git-credentials', '.htpasswd', '.dockercfg', 'credentials', 'credentials.json', 'credentials.yaml', 'credentials.yml',
        'secrets.json', 'secrets.yaml', 'secrets.yml', 'secrets.toml', 'secrets.env', 'service-account.json', 'serviceaccount.json',
        'kubeconfig', 'terraform.tfstate', 'terraform.tfstate.backup', 'master.key'];
    private const EXTENSIONS = ['pem', 'key', 'p12', 'pfx', 'jks', 'keystore', 'kdbx', 'tfvars', 'ovpn'];
    /** `.env.example` and friends hold names, not values. */
    private const TEMPLATES = ['example', 'sample', 'template', 'dist', 'defaults'];

    public static function sensitive(string $path): bool
    {
        $parts = array_values(array_filter(explode('/', str_replace('\\', '/', strtolower($path))), fn ($p) => $p !== '' && $p !== '.'));
        if ($parts === []) return false;
        $name = end($parts);
        foreach (array_slice($parts, 0, -1) as $directory) if (in_array($directory, self::DIRECTORIES, true)) return true;
        if (in_array($name, self::DIRECTORIES, true) || in_array($name, self::EXACT, true)) return true;
        if ($name === '.env' || (str_starts_with($name, '.env.') && !in_array(substr($name, 5), self::TEMPLATES, true))) return true;
        if (str_starts_with($name, 'service-account') && str_ends_with($name, '.json')) return true;
        if (str_starts_with($name, 'client_secret') && str_ends_with($name, '.json')) return true;
        $dot = strrpos($name, '.');
        return $dot !== false && $dot > 0 && in_array(substr($name, $dot + 1), self::EXTENSIONS, true);
    }
}
