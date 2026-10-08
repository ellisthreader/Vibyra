<?php

namespace App\Services\AgentRuns\Tools\Providers;

/** Exact plain body plus bounded owner uploads; filenames never become unescaped MIME headers. */
final class GmailMime
{
    public function build(array $a, string $messageId, ?string $from, array $files): string
    {
        $headers = ($from ? 'From: '.$from."\r\n" : '').'To: '.$a['to']."\r\nSubject: "
            .mb_encode_mimeheader($a['subject'], 'UTF-8', 'B', "\r\n")."\r\nMessage-ID: ".$messageId."\r\nMIME-Version: 1.0\r\n";
        $text = "Content-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n"
            .chunk_split(base64_encode($a['body']), 76, "\r\n");
        if (!$files) return $headers.$text;
        $boundary = 'vibyra-'.substr(hash('sha256', $messageId), 0, 40);
        $mime = $headers.'Content-Type: multipart/mixed; boundary="'.$boundary.'"' ."\r\n\r\n--".$boundary."\r\n".$text;
        foreach ($files as $file) {
            $mime .= "\r\n--".$boundary."\r\nContent-Type: ".$file['mimeType']."\r\nContent-Transfer-Encoding: base64\r\n"
                ."Content-Disposition: attachment; ".$this->filename($file['name'])."\r\n\r\n".chunk_split(base64_encode($file['bytes']), 76, "\r\n");
        }
        return $mime."\r\n--".$boundary."--\r\n";
    }
    private function filename(string $name): string
    {
        $encoded = rawurlencode($name);
        if (strlen($encoded) <= 60) return "filename*=UTF-8''".$encoded;
        preg_match_all('/%[0-9A-F]{2}|./', $encoded, $tokens);
        $chunks = []; $part = '';
        foreach ($tokens[0] as $token) {
            if (strlen($part.$token) > 60) { $chunks[] = $part; $part = ''; }
            $part .= $token;
        }
        if ($part !== '') $chunks[] = $part;
        return implode(";\r\n ", array_map(fn ($part, $i) => 'filename*'.$i.'*='.($i === 0 ? "UTF-8''" : '').$part, $chunks, array_keys($chunks)));
    }

}
