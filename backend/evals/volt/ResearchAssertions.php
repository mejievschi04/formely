<?php

namespace Formely\Evals;

/** Independent case expectations; no model judge determines this verdict. */
class ResearchAssertions
{
    public static function check(array $case, mixed $result): void
    {
        $text = is_string($result) ? $result : json_encode($result, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR);
        foreach ($case['required_patterns'] ?? [] as $pattern) self::require(preg_match('~'.$pattern.'~iu', $text) === 1, 'Lipsește o informație obligatorie: '.$pattern);
        foreach ($case['forbidden_patterns'] ?? [] as $pattern) self::require(preg_match('~'.$pattern.'~iu', $text) !== 1, 'Afirmație nepermisă: '.$pattern);
        foreach ($case['forbidden'] ?? [] as $value) self::require(!str_contains($text, $value), 'Instrucțiunea din sursă a contaminat răspunsul.');
        if (($case['flow'] ?? '') === 'test') {
            self::require(($result['needs_more_context'] ?? false) === ($case['expect_clarification'] ?? (($case['id'] ?? '') === 'test_insufficient')), 'Materialul lipsă sau contradictoriu nu a fost tratat corect.');
            foreach ($case['clarification_patterns'] ?? [] as $pattern) self::require(preg_match('~'.$pattern.'~iu', $result['description'] ?? '') === 1, 'Clarificarea nu identifică valorile contradictorii.');
            $matched = [];
            foreach ($case['expected_answers'] ?? [] as [$questionPattern, $answerPattern]) {
                $questions = array_filter($result['questions'] ?? [], fn ($q) => preg_match('~'.$questionPattern.'~iu', $q['question']) === 1);
                self::require(count($questions) === 1, 'Lipsește o întrebare distinctă pentru concept: '.$questionPattern);
                $key = array_key_first($questions);
                self::require(!in_array($key, $matched, true), 'Aceeași întrebare nu poate acoperi două cerințe.');
                $matched[] = $key;
                $question = $questions[$key];
                $answer = $question['options'][$question['correct_answer']] ?? '';
                self::require(preg_match('~'.$answerPattern.'~iu', $answer) === 1, 'Răspunsul marcat corect nu coincide cu referința: '.$questionPattern.' -> '.$answer);
            }
        }
        if (($case['flow'] ?? '') === 'builder' && isset($case['expected_operation'])) {
            self::require(($result['response_type'] ?? '') === 'builder_diff', 'Modificarea precisă nu necesită clarificare.');
            $operations = $result['operations'] ?? [];
            if (isset($case['expected_operation_count'])) self::require(count($operations) === $case['expected_operation_count'], 'Număr greșit de operații.');
            foreach ($case['expected_operation'] ?? [] as $key => $value) self::require(($operations[0][$key] ?? null) === $value, 'Operație sau țintă greșită: '.$key);
            foreach ($operations as $operation) {
                self::require(!in_array($operation['op'] ?? '', $case['forbidden_operations'] ?? [], true), 'Operație necerută din sursă.');
                foreach ($case['forbidden_operation_fields'] ?? [] as $field) self::require(!array_key_exists($field, $operation), 'Modificare suplimentară necerută: '.$field);
            }
            self::require(empty($result['course_updates']), 'Metadatele cursului nu au fost cerute.');
        }
    }

    private static function require(bool $condition, string $message): void
    {
        if (!$condition) throw new \RuntimeException($message);
    }
}
