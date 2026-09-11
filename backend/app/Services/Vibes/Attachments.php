<?php

namespace App\Services\Vibes;

use Illuminate\Http\UploadedFile;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Photos and files sent with a phone chat message.
 *
 * A message carries references, never bytes: the quote is encrypted, sent to the
 * phone and replayed verbatim, so a photo inside it would ride that round trip
 * twice. `expand` swaps each reference for its content just before the provider
 * call, and only for attachments linked to that very turn, so a reference typed
 * into a message cannot reach anyone else's file.
 */
final class Attachments
{
    /** PHP's default upload limit; the phone shrinks photos well below it. */
    public const MAX_KILOBYTES = 2048;
    public const PER_MESSAGE = 4;

    /**
     * Input tokens one photo is priced at. Photos are re-encoded to at most 1280px on
     * the long edge, which every vision provider in the catalogue reads for under
     * this (Anthropic ~1,600, Qwen ~1,600, Gemini ~1,000, OpenAI ~800).
     */
    public const IMAGE_TOKENS = 2000;
    private const LONG_EDGE = 1280;
    /** Larger than any phone photo, small enough that decoding one cannot exhaust memory. */
    private const MAX_PIXELS = 40_000_000;
    private const TEXT_BYTES = 100_000;
    /** A dense page of extracted text. Only an estimate: settlement bills the real figure. */
    private const PDF_PAGE_TOKENS = 1500;
    private const REF = 'vibyra-attachment:';
    private const TEXT_EXTENSIONS = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'yaml', 'yml', 'xml', 'html', 'css', 'scss',
        'js', 'jsx', 'ts', 'tsx', 'mjs', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'php', 'c', 'h', 'cpp', 'cs', 'sql', 'sh', 'toml', 'ini', 'log'];

    public function store(int $userId, UploadedFile $file): object
    {
        $name = mb_substr(basename((string) $file->getClientOriginalName()) ?: 'attachment', 0, 200);
        $contents = (string) file_get_contents($file->getRealPath());
        $kind = $this->kind((string) $file->getMimeType(), $name, $contents);
        abort_unless($kind, 422, 'Attach a photo, a PDF or a text file.');
        [$contents, $mime, $tokens] = match ($kind) {
            'image' => $this->image($contents),
            'pdf' => [$contents, 'application/pdf', $this->pdfTokens($contents)],
            default => $this->text($contents),
        };
        $id = (string) Str::uuid();
        $path = 'vibes-attachments/'.$userId.'/'.$id;
        Storage::disk('local')->put($path, $contents);
        DB::table('vibes_attachments')->insert(['id' => $id, 'user_id' => $userId, 'kind' => $kind, 'mime' => $mime,
            'name' => $name, 'bytes' => strlen($contents), 'tokens' => $tokens, 'path' => $path,
            'created_at' => now(), 'updated_at' => now()]);

        return DB::table('vibes_attachments')->where('id', $id)->first();
    }

    public function payload(object $a): array
    {
        return ['id' => $a->id, 'kind' => $a->kind, 'name' => $a->name, 'bytes' => (int) $a->bytes];
    }

    /** What a message may carry: this account's own attachments, none of them sent already. */
    public function forMessage(int $userId, array $ids): Collection
    {
        $ids = array_values(array_unique($ids));
        if (! $ids) return collect();
        abort_if(count($ids) > self::PER_MESSAGE, 422, 'Attach up to '.self::PER_MESSAGE.' photos or files at a time.');
        $rows = DB::table('vibes_attachments')->where('user_id', $userId)->whereIn('id', $ids)->whereNull('turn_id')->get()->keyBy('id');
        abort_unless($rows->count() === count($ids), 422, 'An attachment is no longer available. Attach it again.');

        return collect($ids)->map(fn ($id) => $rows[$id]);
    }

    /** The input tokens these attachments add to a turn, used by the quote and the job alike. */
    public function tokens(iterable $rows): int
    {
        return collect($rows)->sum(fn ($a) => (int) $a->tokens);
    }

    /** The message content: the words, then each attachment as a reference. */
    public function content(string $text, Collection $rows): string|array
    {
        if ($rows->isEmpty()) return $text;

        return [['type' => 'text', 'text' => $text], ...$rows->map(fn ($a) => match ($a->kind) {
            'image' => ['type' => 'image_url', 'image_url' => ['url' => self::REF.$a->id]],
            'pdf' => ['type' => 'file', 'file' => ['filename' => $a->name, 'file_data' => self::REF.$a->id]],
            default => ['type' => 'text', 'text' => self::REF.$a->id],
        })->all()];
    }

    /**
     * The request as the provider receives it, and the tokens its attachments add.
     * Only attachments linked to this turn are expanded; any other reference is left
     * as the inert string it is.
     */
    public function expand(array $request, string $turnId): array
    {
        $rows = DB::table('vibes_attachments')->where('turn_id', $turnId)->get()->keyBy('id');
        if ($rows->isEmpty()) return [$request, 0];
        foreach ($request['messages'] ?? [] as $m => $message) {
            if (! is_array($message['content'] ?? null)) continue;
            foreach ($message['content'] as $p => $part) {
                $ref = $part['image_url']['url'] ?? $part['file']['file_data'] ?? $part['text'] ?? null;
                $a = is_string($ref) && str_starts_with($ref, self::REF) ? $rows[substr($ref, strlen(self::REF))] ?? null : null;
                if ($a) $request['messages'][$m]['content'][$p] = $this->inline($a);
            }
        }

        return [$request, $this->tokens($rows)];
    }

    private function inline(object $a): array
    {
        $data = (string) Storage::disk('local')->get($a->path);

        return match ($a->kind) {
            'image' => ['type' => 'image_url', 'image_url' => ['url' => 'data:'.$a->mime.';base64,'.base64_encode($data)]],
            'pdf' => ['type' => 'file', 'file' => ['filename' => $a->name, 'file_data' => 'data:application/pdf;base64,'.base64_encode($data)]],
            default => ['type' => 'text', 'text' => 'Attached file '.$a->name.":\n```\n".$data."\n```"],
        };
    }

    private function kind(string $mime, string $name, string $contents): ?string
    {
        if (str_starts_with($mime, 'image/')) return 'image';
        if (str_starts_with($contents, '%PDF-')) return 'pdf';
        $extension = strtolower(pathinfo($name, PATHINFO_EXTENSION));

        return str_starts_with($mime, 'text/') || in_array($extension, self::TEXT_EXTENSIONS, true) ? 'text' : null;
    }

    /** Re-encoded rather than stored as sent: it bounds the price and drops the photo's location data. */
    private function image(string $contents): array
    {
        $size = @getimagesizefromstring($contents);
        abort_unless($size && $size[0] * $size[1] <= self::MAX_PIXELS, 422, 'This photo could not be read. Try a JPEG or PNG.');
        $source = @imagecreatefromstring($contents);
        abort_unless($source, 422, 'This photo could not be read. Try a JPEG or PNG.');
        [$width, $height] = [imagesx($source), imagesy($source)];
        $scale = min(1, self::LONG_EDGE / max($width, $height));
        [$w, $h] = [max(1, (int) round($width * $scale)), max(1, (int) round($height * $scale))];
        $canvas = imagecreatetruecolor($w, $h);
        // Transparency becomes white, the background a screenshot of an app most often had.
        imagefill($canvas, 0, 0, imagecolorallocate($canvas, 255, 255, 255));
        imagecopyresampled($canvas, $source, 0, 0, 0, 0, $w, $h, $width, $height);
        ob_start();
        imagejpeg($canvas, null, 82);

        return [(string) ob_get_clean(), 'image/jpeg', self::IMAGE_TOKENS];
    }

    private function text(string $contents): array
    {
        abort_if(strlen($contents) > self::TEXT_BYTES, 422, 'This file is too long to send in a chat. Attach a shorter one.');
        abort_unless(mb_check_encoding($contents, 'UTF-8'), 422, 'Attach a text file saved as UTF-8.');

        return [$contents, 'text/plain', (int) ceil(strlen($contents) / TurnPrice::BYTES_PER_TOKEN) + 16];
    }

    /**
     * Pages counted from the page objects themselves. A PDF that hides them inside
     * compressed object streams falls back to its size, which only over-reserves;
     * settlement still bills what the provider reports.
     */
    private function pdfTokens(string $contents): int
    {
        $pages = preg_match_all('#/Type\s*/Page(?!s)#', $contents);

        return $pages ? $pages * self::PDF_PAGE_TOKENS : (int) ceil(strlen($contents) / TurnPrice::BYTES_PER_TOKEN);
    }
}
