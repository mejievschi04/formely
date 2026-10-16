<?php

namespace App\Support;

class VisibleText
{
    public static function fromHtml(string $html): string
    {
        $html = preg_replace('/<\/?(?:h[1-6]|p|div|section|article|ul|ol|li|blockquote|pre|table|thead|tbody|tfoot|tr|td|th)\b[^>]*>|<(?:br|hr)\b[^>]*>/i', ' ', $html) ?? $html;

        // Decode after removing tags so escaped code remains visible text.
        return self::normalize(html_entity_decode(strip_tags($html), ENT_QUOTES | ENT_HTML5, 'UTF-8'));
    }

    public static function normalize(string $text): string
    {
        return trim(preg_replace('/[\s\p{Z}]+/u', ' ', $text) ?? '');
    }
}
