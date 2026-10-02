<?php
namespace App\Services\Assistant;

final class Wav
{
    /** Exact canonical PCM container emitted by Vibyra. Never trust a client duration. */
    public static function seconds(string $wav): ?float
    {
        if (strlen($wav) < 44 || substr($wav, 0, 4) !== 'RIFF' || substr($wav, 8, 8) !== 'WAVEfmt '
            || substr($wav, 36, 4) !== 'data') return null;
        $h = unpack('Vsize/a4wave/a4fmt/VfmtSize/vformat/vchannels/Vrate/VbyteRate/valign/vbits/a4data/VdataSize', substr($wav, 4, 40));
        if ($h['size'] !== strlen($wav) - 8 || $h['fmtSize'] !== 16 || $h['format'] !== 1 || $h['channels'] !== 1
            || $h['bits'] !== 16 || $h['align'] !== 2 || !in_array($h['rate'], [8000, 16000, 22050, 24000, 44100, 48000], true)
            || $h['byteRate'] !== $h['rate'] * 2 || $h['dataSize'] !== strlen($wav) - 44 || $h['dataSize'] % 2 !== 0) return null;
        $seconds = $h['dataSize'] / $h['byteRate'];
        return $seconds >= 0.4 && $seconds <= 120 ? $seconds : null;
    }
}
