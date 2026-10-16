<?php

namespace App\Services;

use App\Support\HtmlSanitizer;
use App\Support\VisibleText;

class AiLessonQuality
{
    public function validate(array $lesson, string $size, array $previous): string
    {
        if (!is_string($lesson['content'] ?? null) || !is_array($lesson['evidence'] ?? null)) {
            throw new \RuntimeException('Format invalid pentru lecție: content trebuie să fie HTML text, iar evidence un obiect cu fragmente text.');
        }
        $html = strip_tags(HtmlSanitizer::clean((string) ($lesson['content'] ?? '')), '<h3><p><ul><ol><li><strong><em><blockquote><pre><code><br>');
        $html = preg_replace('/<(h3|p|ul|ol|li|strong|em|blockquote|pre|code|br)\b[^>]*>/i', '<$1>', $html);
        $text = $this->plain(preg_replace('/<pre\b[^>]*>.*?<\/pre>/is', '', $html));
        $minimum = ['scurt' => 180, 'mediu' => 260, 'detaliat' => 380][$size] ?? 260;
        if ((preg_match_all('/[\p{L}\p{N}]+/u', $text) ?: 0) < $minimum) {
            throw new \RuntimeException('Dezvoltă explicația și exemplul: textul explicativ este prea scurt pentru dimensiunea cerută.');
        }
        preg_match_all('/<p\b[^>]*>(.*?)<\/p>/is', $html, $matches);
        $developed = array_filter($matches[1], fn ($p) => (preg_match_all('/[\p{L}\p{N}]+/u', $this->plain($p)) ?: 0) >= 40);
        if (!$developed) {
            throw new \RuntimeException('Lecția are numai propoziții izolate sau liste. Scrie cel puțin o explicație dezvoltată, legată logic.');
        }
        $allText = $this->plain($html);
        $excerpts = [];
        foreach (['explanation', 'example', 'application', 'feedback'] as $part) {
            $value = $lesson['evidence'][$part] ?? null;
            // Evidence is literal visible text, not HTML (e.g. a code example).
            $excerpt = is_string($value) ? VisibleText::normalize($value) : '';
            if (mb_strlen($excerpt) < 30 || !str_contains($allText, $excerpt)) {
                throw new \RuntimeException('Lipsește un fragment verificabil pentru '.$part.'. Include explicație, exemplu concret, aplicare și feedback în conținut.');
            }
            $excerpts[] = $excerpt;
        }
        if (count(array_unique($excerpts)) !== 4) {
            throw new \RuntimeException('Explicația, exemplul, aplicarea și feedbackul trebuie demonstrate prin fragmente distincte.');
        }
        $body = $this->plain(preg_replace('/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/is', '', $html));
        foreach ($previous as $saved) {
            if ($this->plain(preg_replace('/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/is', '', $saved['content'])) === $body) {
                throw new \RuntimeException('Conținutul repetă integral o lecție precedentă. Dezvoltă obiectivul lecției curente.');
            }
        }
        return $html;
    }

    private function plain(string $html): string
    {
        return VisibleText::fromHtml($html);
    }
}
