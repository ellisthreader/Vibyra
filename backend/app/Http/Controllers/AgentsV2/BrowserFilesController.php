<?php
namespace App\Http\Controllers\AgentsV2;
use App\Http\Controllers\Controller;
use App\Services\AgentBrowser\Files;
use Illuminate\Http\Request;
final class BrowserFilesController extends Controller
{
    use V2Requests;
    public function store(Request $request, string $runtime, string $run, Files $files)
    {
        $binding = \App\Services\AgentRuns\Browser\BrowserRuntimeScope::runner($request, $runtime);
        abort_if(max((int) $request->header('Content-Length', 0), strlen($request->getContent())) > 12 * 1024 * 1024, 413);
        $data = $request->validate(['generation' => 'required|integer|min:1', 'actionId' => 'required|uuid',
            'name' => 'required|string|max:120', 'mimeType' => 'required|string|max:100',
            'contentBase64' => 'required|string', 'sha256' => 'required|string|size:64']);
        return $this->json(['file' => $files->payload($files->store($binding, $run, (int) $data['generation'], $request->all()))]);
    }
    public function upload(Request $request, string $runtime, string $run, string $action, \App\Services\AgentBrowser\Uploads $uploads)
    {
        $binding = \App\Services\AgentRuns\Browser\BrowserRuntimeScope::runner($request, $runtime);
        $data = $request->validate(['generation' => 'required|integer|min:1', 'fingerprint' => ['required', 'regex:/^[a-f0-9]{64}$/D']]);
        return $this->json($uploads->file($binding, $run, $action, (int) $data['generation'], $data['fingerprint']))
            ->header('Cache-Control', 'private, no-store');
    }
    public function index(Request $request, string $agentId, Files $files)
    {
        return $this->json(['files' => $files->list($this->v2User($request)->id, $agentId)]);
    }
    public function download(Request $request, string $id, Files $files)
    {
        $file = $files->find($this->v2User($request)->id, $id);
        $bytes = base64_decode($file->content, true);
        abort_unless(is_string($bytes) && hash_equals($file->sha256, hash('sha256', $bytes)), 503);
        return response($bytes)->header('Content-Type', $file->mime)
            ->header('Content-Disposition', 'attachment; filename="download"; filename*=UTF-8\'\''.rawurlencode($file->name))
            ->header('Content-Length', (string) $file->size)->header('X-Content-Type-Options', 'nosniff')
            ->header('Cache-Control', 'private, no-store')->header('Content-Security-Policy', "sandbox; default-src 'none'");
    }
}
