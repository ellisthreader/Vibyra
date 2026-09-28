<?php

namespace App\Services\Community;

use Illuminate\Http\Exceptions\HttpResponseException;
use Illuminate\Support\Arr;
use Illuminate\Support\Str;

trait ProjectSafetyPreviewSanitization
{
    private function sanitizePreviewHtml(string $html, array &$findings): ?string
    {
        $html = trim($html);
        if ($html === '') {
            return null;
        }

        if (mb_strlen($html) > self::PREVIEW_HTML_MAX_CHARACTERS) {
            $findings[] = [
                'code' => 'preview_html_too_large',
                'severity' => 'under_review',
                'target' => 'preview_html',
                'message' => 'Large published previews need review before they can be public.',
                'scoreImpact' => $this->scoreImpact('preview_html_too_large'),
            ];
        }

        $patterns = [
            'inline_script_content' => '/<\s*script\b(?![^>]*\bsrc\s*=)[^>]*>.*?<\s*\/\s*script\s*>/is',
            'dangerous_embed' => '/<\s*(?:iframe|frame|object|embed|applet)\b/i',
            'form_submission' => '/<\s*form\b/i',
            'meta_refresh_or_base' => '/<\s*(?:base\b|meta\b[^>]*http-equiv)/i',
            'inline_event_handler' => '/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/i',
            'javascript_url' => '/(?:href|src|action)\s*=\s*(?:"\s*javascript:|\'\s*javascript:|javascript:)/i',
            'html_data_url' => '/data\s*:\s*text\/html/i',
            'svg_data_url' => '/data\s*:\s*image\/svg\+xml/i',
            'srcdoc' => '/\ssrcdoc\s*=/i',
            'css_script_escape' => '/(?:expression\s*\(|@import|url\s*\(\s*[\'"]?\s*javascript:)/i',
            'meta_pixel_or_tracking' => '/\b(?:facebook\.com\/tr|googletagmanager\.com|google-analytics\.com|hotjar\.com|segment\.com)\b/i',
        ];

        foreach ($patterns as $code => $pattern) {
            if (preg_match($pattern, $html) === 1) {
                $findings[] = [
                    'code' => $code,
                    'severity' => 'deny',
                    'target' => 'preview_html',
                    'message' => 'Published previews cannot include executable, embedded, form, navigation, or unsafe URL content.',
                    'scoreImpact' => $this->scoreImpact($code),
                ];
            }
        }

        $html = preg_replace('/<\s*script\b[^>]*>.*?<\s*\/\s*script\s*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*(?:iframe|frame|object|embed|applet|form|base)\b[^>]*>.*?(?:<\s*\/\s*(?:iframe|frame|object|embed|applet|form)\s*>)?/is', '', $html) ?? '';
        $html = preg_replace('/<\s*meta\b[^>]*http-equiv[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/<\s*link\b[^>]*rel\s*=\s*([\'"]?)stylesheet\1[^>]*>/is', '', $html) ?? '';
        $html = preg_replace('/\son[a-z]+\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/\s(?:srcdoc|srcset)\s*=\s*(?:"[^"]*"|\'[^\']*\'|[^\s>]+)/is', '', $html) ?? '';
        $html = preg_replace('/(href|src|action)\s*=\s*(["\']?)\s*javascript:[^"\'>\s]*/is', '$1="#"', $html) ?? '';

        return Str::limit(trim($html), self::PREVIEW_HTML_MAX_CHARACTERS, '');
    }
}
