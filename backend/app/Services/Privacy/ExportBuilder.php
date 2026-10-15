<?php

namespace App\Services\Privacy;

use App\Models\User;
use Generator;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use ZipArchive;

/** Builds one account's archive: a ZIP of JSON files streamed through temporary files, then stored on the export disk. */
final class ExportBuilder
{
    private const FLAGS = JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_INVALID_UTF8_SUBSTITUTE | JSON_THROW_ON_ERROR;

    /** @return int bytes written to `$path` on the export disk */
    public function build(User $user, string $path): int
    {
        $sections = new ExportSections((int) config('reliability.export.max_rows'));
        $temp = [];
        $zipPath = tempnam(sys_get_temp_dir(), 'vibyra-export-');
        try {
            $zip = new ZipArchive();
            if ($zip->open($zipPath, ZipArchive::OVERWRITE) !== true) throw new RuntimeException('zip_open_failed');
            $notes = [];
            foreach ($sections->for($user) as $name => $data) {
                $sections->cut = false;
                $temp[] = $file = $this->write($data);
                $zip->addFile($file, $name);
                if ($sections->cut) $notes[] = $name;
            }
            $zip->addFromString('README.txt', $this->readme($notes));
            if (!$zip->close()) throw new RuntimeException('zip_close_failed');
            $stream = fopen($zipPath, 'rb');
            try {
                if (!Storage::disk((string) config('reliability.export.disk'))->put($path, $stream)) throw new RuntimeException('export_store_failed');
            } finally {
                if (is_resource($stream)) fclose($stream);
            }
            return (int) filesize($zipPath);
        } finally {
            foreach ([...$temp, $zipPath] as $file) @unlink($file);
        }
    }

    /** @param array|Generator $data */
    private function write(mixed $data): string
    {
        $file = tempnam(sys_get_temp_dir(), 'vibyra-export-part-');
        $out = fopen($file, 'wb');
        if ($data instanceof Generator) {
            fwrite($out, "{\"items\": [");
            $first = true;
            foreach ($data as $item) {
                fwrite($out, ($first ? "\n" : ",\n").json_encode($item, self::FLAGS));
                $first = false;
            }
            fwrite($out, "\n]}\n");
        } else {
            fwrite($out, json_encode($data, self::FLAGS)."\n");
        }
        fclose($out);
        return $file;
    }

    private function readme(array $cut): string
    {
        return "Your Vibyra data, exported ".now()->toIso8601String().".\n\n"
            ."Each file is JSON. It holds your profile, settings, saved chats, project details, teammates and their skills,\n"
            ."account activity, spending limits and saved prompts. It leaves out passwords, sign-in and API tokens, keys,\n"
            ."payment details and anything that belongs to other people.\n"
            .($cut ? "\nThese files were cut to the newest entries because they were very large: ".implode(', ', $cut).".\n" : '');
    }
}
