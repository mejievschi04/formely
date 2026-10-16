<?php

namespace App\Services;

use App\Exceptions\AiLessonQualityException;
use App\Support\HtmlSanitizer;
use App\Support\VisibleText;

class AiLessonQuality
{
    public function validate(array $lesson, string $size, array $previous): string
    {
        if (array_key_exists('sections', $lesson)) {
            $lesson = $this->assembleSections($lesson['sections']);
        }
        if (!is_string($lesson['content'] ?? null) || !is_array($lesson['evidence'] ?? null)) {
            throw new AiLessonQualityException('Format invalid pentru lecție: content trebuie să fie HTML text, iar evidence un obiect cu fragmente text.');
        }
        $html = $this->sanitize($lesson['content']);
        $this->validateCodeBlocks($html);
        $text = $this->plain(preg_replace('/<pre\b[^>]*>.*?<\/pre>/is', '', $html));
        $minimum = ['scurt' => 180, 'mediu' => 260, 'detaliat' => 380][$size] ?? 260;
        $words = preg_match_all('/[\p{L}\p{N}]+/u', $text) ?: 0;
        if ($words < $minimum) {
            throw new AiLessonQualityException('Textul explicativ are '.$words.' de cuvinte; pentru dimensiunea '.$size.' sunt necesare minimum '.$minimum.', fără blocurile de cod. Dezvoltă mecanismul și demonstrația concretă, apoi sarcina și feedbackul, fără repetiții.');
        }
        preg_match_all('/<p\b[^>]*>(.*?)<\/p>/is', $html, $matches);
        $developed = array_filter($matches[1], fn ($p) => (preg_match_all('/[\p{L}\p{N}]+/u', $this->plain($p)) ?: 0) >= 40);
        if (!$developed) {
            throw new AiLessonQualityException('Lecția are numai propoziții izolate sau liste. Scrie cel puțin o explicație dezvoltată într-un element <p>, cu minimum 40 de cuvinte legate logic.');
        }
        $allText = $this->plain($html);
        $excerpts = [];
        foreach (['explanation', 'example', 'application', 'feedback'] as $part) {
            $value = $lesson['evidence'][$part] ?? null;
            // Evidence is literal visible text, not HTML (e.g. a code example).
            $excerpt = is_string($value) ? VisibleText::normalize($value) : '';
            if (mb_strlen($excerpt) < 30 || !str_contains($allText, $excerpt)) {
                throw new AiLessonQualityException('Lipsește un fragment verificabil pentru '.$part.'. Include explicație, exemplu concret, aplicare și feedback în conținut. Copiază în evidence.'.$part.' minimum 30 de caractere consecutive din textul vizibil corespunzător, fără parafrazare.');
            }
            $excerpts[] = $excerpt;
        }
        if (count(array_unique($excerpts)) !== 4) {
            throw new AiLessonQualityException('Explicația, exemplul, aplicarea și feedbackul trebuie demonstrate prin fragmente distincte.');
        }
        $body = $this->plain(preg_replace('/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/is', '', $html));
        foreach ($previous as $saved) {
            if ($this->plain(preg_replace('/<h[1-6]\b[^>]*>.*?<\/h[1-6]>/is', '', $saved['content'])) === $body) {
                throw new AiLessonQualityException('Conținutul repetă integral o lecție precedentă. Dezvoltă obiectivul lecției curente.');
            }
        }
        return $html;
    }

    private function plain(string $html): string
    {
        return VisibleText::fromHtml($html);
    }

    private function sanitize(string $html): string
    {
        $html = strip_tags(HtmlSanitizer::clean($html), '<h3><p><ul><ol><li><strong><em><blockquote><pre><code><br>');

        return preg_replace('/<(h3|p|ul|ol|li|strong|em|blockquote|pre|code|br)\b[^>]*>/i', '<$1>', $html) ?? '';
    }

    private function validateCodeBlocks(string $html): void
    {
        preg_match_all('/<(\/?)([a-z0-9]+)\b[^>]*>/i', $html, $tags, PREG_SET_ORDER);
        $stack = [];
        foreach ($tags as $tag) {
            $name = strtolower($tag[2]);
            if (!in_array($name, ['pre', 'code'], true)) {
                if ($stack) {
                    throw new AiLessonQualityException('Închide blocurile <pre><code> înainte de următorul paragraf. HTML-ul din exemplul de cod trebuie escape-at cu &lt; și &gt;.');
                }
                continue;
            }
            if ($tag[1] === '/') {
                if (array_pop($stack) !== $name) {
                    throw new AiLessonQualityException('Tagurile <pre> și <code> trebuie închise în ordinea corectă: <pre><code>…</code></pre>.');
                }
            } else {
                if (in_array($name, $stack, true) || ($name === 'pre' && $stack)) {
                    throw new AiLessonQualityException('Nu imbrica blocuri <pre> sau <code>. Închide fiecare exemplu înainte de următorul bloc.');
                }
                $stack[] = $name;
            }
        }
        if ($stack) {
            throw new AiLessonQualityException('Lipsesc taguri de închidere pentru <pre> sau <code>. Returnează HTML complet, cu <pre><code>…</code></pre>.');
        }
    }

    private function assembleSections(mixed $sections): array
    {
        $content = [];
        $evidence = [];
        foreach (['explanation', 'example', 'application', 'feedback'] as $part) {
            $html = is_array($sections) ? ($sections[$part] ?? null) : null;
            if (!is_string($html)) {
                throw new AiLessonQualityException('Lipsește sections.'.$part.' ca text HTML. Returnează toate cele patru părți ale lecției.');
            }
            $html = $this->sanitize($html);
            $text = $this->plain($html);
            if (mb_strlen($text) < 30) {
                throw new AiLessonQualityException('Dezvoltă sections.'.$part.': partea trebuie să conțină conținut propriu de minimum 30 de caractere vizibile.');
            }
            $content[] = $html;
            $evidence[$part] = mb_substr($text, 0, 120);
        }

        return ['content' => implode("\n", $content), 'evidence' => $evidence];
    }
}
