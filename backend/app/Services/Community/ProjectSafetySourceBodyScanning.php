<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetySourceBodyScanning
{
    private function scanSourceBody(string $path, string $body, array &$findings): void
    {
        if (trim($body) === '') {
            return;
        }

        $patterns = [
            'dynamic_code_execution' => '/\b(?:eval\s*\(|new\s+Function\s*\(|Function\s*\()/i',
            'shell_command_execution' => '/\b(?:child_process|execSync\s*\(|spawnSync\s*\(|shell_exec\s*\(|passthru\s*\(|proc_open\s*\(|system\s*\()/i',
            'destructive_file_operation' => '/\b(?:rm\s+-rf|fs\.rmSync\s*\(|unlinkSync\s*\(|rmdirSync\s*\()/i',
            'hidden_remote_script' => '/<\s*script\b[^>]*\bsrc\s*=\s*["\']https?:\/\//i',
            'browser_storage_exfiltration' => '/\b(?:localStorage|sessionStorage|document\.cookie)\b[\s\S]{0,240}\b(?:fetch\s*\(|XMLHttpRequest|sendBeacon)\b/i',
            'sensitive_browser_api' => '/\b(?:getUserMedia|getDisplayMedia|geolocation|getCurrentPosition|clipboard\.read|Notification\.requestPermission)\b/i',
            'untrusted_network_endpoint' => '/\b(?:fetch|axios|XMLHttpRequest|sendBeacon)\b[\s\S]{0,160}\bhttps?:\/\/(?!api\.openai\.com|openrouter\.ai|fonts\.googleapis\.com|fonts\.gstatic\.com)[^\'"\s)]+/i',
            'auth_payment_surface' => '/\b(?:stripe|checkout|password|oauth|jwt|session_token|access_token|refresh_token|payment[_ -]?(?:intent|method|gateway|processor)|processPayment)\b/i',
            'crypto_or_wallet_behavior' => '/\b(?:ethereum|walletconnect|metamask|solana|web3|bitcoin|privateKey|seed phrase)\b/i',
            'tracking_or_fingerprint' => '/\b(?:fingerprint|canvas\.toDataURL|navigator\.userAgent|deviceMemory|hardwareConcurrency)\b/i',
            'obfuscated_code' => '/\b(?:atob|btoa|Buffer\.from)\b[\s\S]{0,120}\b(?:eval|Function|exec)\b/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $body) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'under_review',
                    'target' => 'source_file',
                    'message' => 'Source code contains behavior that needs human review before the project can be public.',
                    'path' => $path,
                    'scoreImpact' => $this->scoreImpact($code),
                ];
            }
        }

        if ($this->isPackageJson($path) && preg_match('/"(?:preinstall|postinstall|prepare)"\s*:/i', $body) === 1) {
            $findings[] = [
                'code' => 'dependency_install_script',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Install scripts need review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('dependency_install_script'),
            ];
        }

        if ($this->hasLargeEncodedBlob($body)) {
            $findings[] = [
                'code' => 'minified_large_blob',
                'severity' => 'under_review',
                'target' => 'source_file',
                'message' => 'Large minified or encoded code needs review before the project can be public.',
                'path' => $path,
                'scoreImpact' => $this->scoreImpact('minified_large_blob'),
            ];
        }
    }

    private function isPackageJson(string $path): bool
    {
        return strtolower(basename($path)) === 'package.json';
    }

    private function hasLargeEncodedBlob(string $body): bool
    {
        foreach (preg_split('/\R/', $body) ?: [] as $line) {
            if (strlen($line) > 8000) {
                return true;
            }
        }

        return preg_match('/[A-Za-z0-9+\/]{3000,}={0,2}/', $body) === 1;
    }

    private function isPrivateHost(string $host): bool
    {
        $host = trim($host, '[]');

        if (! filter_var($host, FILTER_VALIDATE_IP)) {
            return false;
        }

        return ! filter_var($host, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE);
    }
}
