<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SiteEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Statistici proprii pentru site-ul de marketing, fără cookie-uri și fără servicii externe.
 */
class SiteEventController extends Controller
{
    private const BOT_PATTERN = '/bot|crawl|spider|slurp|headless|lighthouse|preview|facebookexternalhit|whatsapp|curl|wget|python|axios/i';

    /** Referreri cunoscuți, grupați sub un nume ușor de citit. */
    private const REFERRER_GROUPS = [
        'facebook' => ['facebook.com', 'fb.com', 'fb.me'],
        'instagram' => ['instagram.com'],
        'google' => ['google.'],
        'bing' => ['bing.com'],
        'linkedin' => ['linkedin.com', 'lnkd.in'],
        'chatgpt' => ['chatgpt.com', 'openai.com'],
    ];

    public function store(Request $request)
    {
        $validated = $request->validate([
            'type' => 'required|in:'.implode(',', SiteEvent::TYPES),
            'path' => 'nullable|string|max:2000',
            'referrer' => 'nullable|string|max:2000',
            'lang' => 'nullable|string|max:5',
            'attribution' => 'nullable|array',
            'attribution.*' => 'nullable|string|max:2000',
        ]);

        $ua = (string) $request->userAgent();
        if ($ua === '' || preg_match(self::BOT_PATTERN, $ua)) {
            return response()->noContent();
        }

        $utm = $validated['attribution'] ?? [];

        SiteEvent::create([
            'type' => $validated['type'],
            'visitor' => $this->visitor($request->ip(), $ua),
            'path' => Str::limit(parse_url($validated['path'] ?? '/', PHP_URL_PATH) ?: '/', 250, ''),
            'source' => $this->source($utm, $validated['referrer'] ?? null, $request),
            'utm_medium' => $this->clip($utm['utm_medium'] ?? null, 100),
            'utm_campaign' => $this->clip($utm['utm_campaign'] ?? null, 150),
            'device' => $this->device($ua),
            'lang' => $this->clip($validated['lang'] ?? null, 5),
        ]);

        return response()->noContent();
    }

    /** Hash care se schimbă în fiecare zi: numără vizitatorii unici fără să-i poată urmări între zile. */
    private function visitor(?string $ip, string $ua): string
    {
        return substr(hash('sha256', now()->toDateString().'|'.config('app.key').'|'.$ip.'|'.$ua), 0, 16);
    }

    private function source(array $utm, ?string $referrer, Request $request): ?string
    {
        if (! empty($utm['utm_source'])) {
            return $this->clip(strtolower($utm['utm_source']), 100);
        }
        if (! empty($utm['fbclid'])) {
            return 'facebook';
        }

        $host = strtolower((string) parse_url((string) $referrer, PHP_URL_HOST));
        $host = preg_replace('/^(www|m|l|lm)\./', '', $host);
        if ($host === '' || $host === preg_replace('/^www\./', '', (string) parse_url((string) $request->headers->get('origin'), PHP_URL_HOST))) {
            return null;
        }
        foreach (self::REFERRER_GROUPS as $name => $needles) {
            foreach ($needles as $needle) {
                if (str_contains($host, $needle)) {
                    return $name;
                }
            }
        }

        return $this->clip($host, 100);
    }

    private function device(string $ua): string
    {
        if (preg_match('/ipad|tablet/i', $ua)) {
            return 'tablet';
        }

        return preg_match('/mobile|android|iphone/i', $ua) ? 'mobile' : 'desktop';
    }

    private function clip(?string $value, int $max): ?string
    {
        $value = trim(strip_tags((string) $value));

        return $value === '' ? null : mb_substr($value, 0, $max);
    }
}
