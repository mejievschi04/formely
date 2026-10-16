<?php

namespace App\Services;

use App\Support\VisibleText;

class AiTestQuality
{
    public function validate(array $test, int $count): array
    {
        if (isset($test['needs_more_context']) && !is_bool($test['needs_more_context'])) {
            throw new \RuntimeException('needs_more_context trebuie să fie boolean.');
        }
        if (($test['needs_more_context'] ?? false) === true) {
            if (($test['questions'] ?? []) !== []) throw new \RuntimeException('Pentru material insuficient returnează questions: [].');
            if (!is_string($test['description'] ?? null) || trim($test['description']) === '') throw new \RuntimeException('Explică în description ce material lipsește.');
            return ['needs_more_context' => true, 'description' => trim($test['description']), 'questions' => []];
        }
        if (!is_string($test['title'] ?? null) || trim($test['title']) === '' || mb_strlen($test['title']) > 255) throw new \RuntimeException('Titlul testului trebuie să aibă între 1 și 255 de caractere.');
        $questions = $test['questions'] ?? null;
        if (!is_array($questions) || !array_is_list($questions) || count($questions) !== $count) {
            throw new \RuntimeException('Returnează exact '.$count.' întrebări în questions.');
        }
        $normalized = [];
        $seen = [];
        foreach ($questions as $index => $question) {
            if (!is_array($question)) throw new \RuntimeException('Întrebarea '.($index + 1).' nu este un obiect.');
            $text = $question['question'] ?? $question['content'] ?? null;
            if (!is_string($text) || trim($text) === '') throw new \RuntimeException('Lipsește textul întrebării '.($index + 1).'.');
            if (!in_array($question['type'] ?? 'multiple_choice', ['multiple_choice', 'single_choice'], true)) throw new \RuntimeException('Testul cerut conține numai întrebări cu alegere unică.');
            $key = $this->key(rtrim(trim($text), '?.!'));
            if (in_array($key, $seen, true)) throw new \RuntimeException('Întrebările trebuie să fie distincte; întrebarea '.($index + 1).' este repetată.');
            $seen[] = $key;
            $answers = $question['options'] ?? $question['answers'] ?? null;
            if (!is_array($answers) || !array_is_list($answers) || count($answers) !== 4) throw new \RuntimeException('Întrebarea '.($index + 1).' trebuie să aibă exact 4 variante.');
            $options = [];
            $correctFlags = [];
            foreach ($answers as $answerIndex => $answer) {
                $value = is_array($answer) ? ($answer['text'] ?? null) : $answer;
                if (!is_string($value) || trim($value) === '') throw new \RuntimeException('Variantele de răspuns trebuie să fie texte reale, fără valori goale.');
                $options[] = trim($value);
                if (is_array($answer) && array_key_exists('is_correct', $answer)) {
                    if (!is_bool($answer['is_correct'])) throw new \RuntimeException('is_correct trebuie să fie boolean.');
                    if ($answer['is_correct']) $correctFlags[] = $answerIndex;
                }
            }
            if (count(array_unique(array_map(fn ($option) => $this->key($option), $options))) !== 4) throw new \RuntimeException('Variantele întrebării '.($index + 1).' trebuie să fie distincte.');
            $correct = $question['correct_answer'] ?? null;
            if ($correct === null && count($correctFlags) === 1) $correct = $correctFlags[0];
            if (!is_int($correct) || $correct < 0 || $correct > 3) throw new \RuntimeException('correct_answer trebuie să fie un index întreg între 0 și 3.');
            $hasFlags = count(array_filter($answers, fn ($answer) => is_array($answer) && array_key_exists('is_correct', $answer))) > 0;
            if ($hasFlags && $correctFlags !== [$correct]) throw new \RuntimeException('Exact o variantă trebuie să fie corectă, consecventă cu correct_answer.');
            if (!is_string($question['explanation'] ?? null) || trim($question['explanation']) === '') throw new \RuntimeException('Explică răspunsul corect pentru fiecare întrebare folosind materialul.');
            $normalized[] = ['question' => trim($text), 'type' => 'multiple_choice', 'options' => $options,
                'correct_answer' => $correct, 'explanation' => trim($question['explanation'])];
        }

        return ['title' => trim($test['title']), 'description' => is_string($test['description'] ?? null) ? $test['description'] : '',
            'needs_more_context' => false, 'questions' => $normalized];
    }

    private function key(string $text): string
    {
        return mb_strtolower(VisibleText::normalize($text));
    }
}
