<?php
namespace App\Services\AgentBrowser;
use App\Models\AgentV2\{Run, RuntimeBinding};
use App\Services\AgentRuns\Browser\{BrowserOrigins, BrowserTools};
use App\Services\AgentRuns\Tools\{ToolRefused};
use App\Services\AgentRuns\Tools\Providers\Schema;
use Illuminate\Support\Str;
final class UploadBinding
{
    public static function capable(Run $run): bool
    {
        return ($run->runtime_snapshot['capabilities']['browserUploadsV1'] ?? false) === true
            && (RuntimeBinding::find($run->runtime_binding_id)?->capabilities['browserUploadsV1'] ?? false) === true;
    }
    public static function definition(): array
    {
        $s = ['type' => 'string'];
        return Schema::tool('browser_upload', 'Upload one file explicitly attached to this task or downloaded during it. Requires an individually reviewed same-origin HTML multipart POST form. Pass its submit ref, file-input ref, latest pageFingerprint and file ID; never a path or URL. The browser never receives file contents. Custom JavaScript upload widgets are unsupported.',
            ['ref' => $s, 'fileRef' => $s, 'pageFingerprint' => $s, 'fileId' => $s], ['ref', 'fileRef', 'pageFingerprint', 'fileId']);
    }
    public static function validate(array $args): array
    {
        Schema::only($args, ['ref', 'fileRef', 'pageFingerprint', 'fileId']);
        abort_unless(is_string($args['fileId'] ?? null) && Str::isUuid($args['fileId']), 422, 'Use a file ID from this task.');
        return ['ref' => BrowserTools::ref($args['ref'] ?? null), 'fileRef' => BrowserTools::ref($args['fileRef'] ?? null),
            'pageFingerprint' => BrowserTools::hash($args['pageFingerprint'] ?? null), 'fileId' => $args['fileId']];
    }
    public static function bind(Run $run, array $form, array $args, array $bound): array
    {
        if (!self::capable($run)) throw new ToolRefused('runtime_upgrade', 'Update this runtime before uploading a file.');
        $fields = collect($form['fields'] ?? [])->where('type', 'file');
        $field = $fields->firstWhere('ref', $args['fileRef']);
        if ($fields->count() !== 1 || !is_array($field) || empty($field['name']) || strlen($field['name']) > 100
            || preg_match('/[\r\n\x00]/', $field['name']) || ($form['enctype'] ?? '') !== 'multipart/form-data'
            || $bound['method'] !== 'POST' || BrowserOrigins::ofUrl($bound['destination']) !== BrowserOrigins::ofUrl($bound['pageUrl']))
            throw new ToolRefused('unsupported_upload_form', 'Choose one file input in a same-site multipart POST form. Custom upload widgets are unsupported.');
        return [...$bound, 'fileRef' => $args['fileRef'], 'fileField' => $field['name'],
            'file' => app(UploadSources::class)->metadata($run, $args['fileId'])];
    }
}
