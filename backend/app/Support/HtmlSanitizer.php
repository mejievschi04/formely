<?php

namespace App\Support;

class HtmlSanitizer
{
    public static function clean(?string $html): string
    {
        if ($html === null || $html === '') {
            return '';
        }

        $clean = preg_replace('#<(script|iframe|object|embed|form|link|meta|base)\b[^>]*>.*?</\1>#is', '', $html) ?? $html;
        $clean = preg_replace('#<(script|iframe|object|embed|form|link|meta|base)\b[^>]*/?>#is', '', $clean) ?? $clean;
        $clean = preg_replace('#\son[a-z0-9_-]+\s*=\s*("[^"]*"|\'[^\']*\'|[^\s>]+)#i', '', $clean) ?? $clean;
        $clean = preg_replace('#(href|src|xlink:href)\s*=\s*(["\'])\s*(javascript|data|vbscript):[^"\']*\2#i', '$1=$2#$2', $clean) ?? $clean;

        return $clean;
    }
}
