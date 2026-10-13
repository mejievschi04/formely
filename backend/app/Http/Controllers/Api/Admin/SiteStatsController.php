<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\SiteEvent;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Statisticile site-ului de marketing pentru backoffice: vizite, surse, campanii, funnel.
 */
class SiteStatsController extends Controller
{
    public function index(Request $request)
    {
        $days = (int) $request->query('days', 30);
        $days = in_array($days, [1, 7, 30, 90], true) ? $days : 30;
        $from = now()->subDays($days - 1)->startOfDay();
        $base = fn () => SiteEvent::query()->where('created_at', '>=', $from);

        $funnel = [];
        foreach (SiteEvent::TYPES as $type) {
            $funnel[$type] = (clone $base())->where('type', $type)->distinct()->count('visitor');
        }
        $pageviews = (clone $base())->where('type', 'pageview')->count();
        $quality = $this->quality($base());

        return response()->json([
            'days' => $days,
            'totals' => [
                'pageviews' => $pageviews,
                'visitors' => $funnel['pageview'],
                'section_views' => $funnel['section_view'],
                'cta_clicks' => $funnel['cta_click'],
                'demo_clicks' => $funnel['demo_click'],
                'form_starts' => $funnel['form_start'],
                'leads' => $funnel['lead'],
                'conversion' => $funnel['pageview'] > 0 ? round($funnel['lead'] / $funnel['pageview'] * 100, 1) : 0,
                'bounce' => $quality['bounce'],
                'pages_per_visitor' => $quality['pages_per_visitor'],
            ],
            'daily' => $this->daily($base(), $from, $days),
            'hours' => $this->hours($base()),
            'sources' => $this->breakdown($base(), 'source', 'Direct'),
            'mediums' => $this->breakdown($base()->whereNotNull('utm_medium'), 'utm_medium'),
            'campaigns' => $this->breakdown($base()->whereNotNull('utm_campaign'), 'utm_campaign'),
            'devices' => $this->breakdown($base(), 'device'),
            'languages' => $this->breakdown($base(), 'lang'),
            'pages' => $this->breakdown($base(), 'path'),
            'sections' => $this->sections($base()),
            'ctas' => $this->labeled($base(), 'cta_click'),
            'demos' => $this->labeled($base(), 'demo_click'),
        ]);
    }

    /** Rata de respingere: o singură pagină și niciun click, demo sau formular. */
    private function quality(Builder $query): array
    {
        $visits = (clone $query)
            ->select('visitor')
            ->selectRaw("SUM(CASE WHEN type = 'pageview' THEN 1 ELSE 0 END) as pageviews")
            ->selectRaw("SUM(CASE WHEN type IN ('cta_click', 'demo_click', 'form_start', 'lead') THEN 1 ELSE 0 END) as engaged")
            ->groupBy('visitor');

        $row = DB::query()
            ->fromSub($visits, 'visits')
            ->where('pageviews', '>', 0)
            ->selectRaw('COUNT(*) as visitors')
            ->selectRaw('SUM(CASE WHEN pageviews = 1 AND engaged = 0 THEN 1 ELSE 0 END) as bounced')
            ->selectRaw('SUM(pageviews) as pages')
            ->first();

        $visitors = (int) ($row->visitors ?? 0);

        return [
            'bounce' => $visitors > 0 ? round((int) $row->bounced / $visitors * 100, 1) : 0,
            'pages_per_visitor' => $visitors > 0 ? round((int) $row->pages / $visitors, 1) : 0,
        ];
    }

    /** Vizitatori unici pe oră, din vizitele de pagină. */
    private function hours(Builder $query): array
    {
        $expr = match (DB::connection()->getDriverName()) {
            'sqlite' => "cast(strftime('%H', created_at) as integer)",
            'pgsql' => 'CAST(EXTRACT(HOUR FROM created_at) AS INTEGER)',
            default => 'HOUR(created_at)',
        };

        $rows = (clone $query)
            ->where('type', 'pageview')
            ->selectRaw($expr.' as hour')
            ->selectRaw('COUNT(DISTINCT visitor) as visitors')
            ->groupBy(DB::raw($expr))
            ->get()
            ->keyBy(fn ($row) => (int) $row->hour);

        $out = [];
        for ($hour = 0; $hour < 24; $hour++) {
            $out[] = [
                'hour' => $hour,
                'visitors' => (int) ($rows->get($hour)->visitors ?? 0),
            ];
        }

        return $out;
    }

    /** Vizitatori unici, vizite și cereri pe fiecare zi, inclusiv zilele fără trafic. */
    private function daily(Builder $query, $from, int $days): array
    {
        $rows = $query
            ->selectRaw('DATE(created_at) as day')
            ->selectRaw("COUNT(DISTINCT CASE WHEN type = 'pageview' THEN visitor END) as visitors")
            ->selectRaw("SUM(CASE WHEN type = 'pageview' THEN 1 ELSE 0 END) as pageviews")
            ->selectRaw("COUNT(DISTINCT CASE WHEN type = 'lead' THEN visitor END) as leads")
            ->groupBy(DB::raw('DATE(created_at)'))
            ->get()
            ->keyBy(fn ($row) => (string) $row->day);

        $out = [];
        for ($i = 0; $i < $days; $i++) {
            $day = $from->copy()->addDays($i)->toDateString();
            $row = $rows->get($day);
            $out[] = [
                'date' => $day,
                'visitors' => (int) ($row->visitors ?? 0),
                'pageviews' => (int) ($row->pageviews ?? 0),
                'leads' => (int) ($row->leads ?? 0),
            ];
        }

        return $out;
    }

    /** Top 10 valori pentru o coloană, cu vizitatori unici și câți dintre ei au trimis cererea. */
    private function breakdown(Builder $query, string $column, ?string $emptyLabel = null): array
    {
        return $query
            ->select($column.' as label')
            ->selectRaw("COUNT(DISTINCT CASE WHEN type = 'pageview' THEN visitor END) as visitors")
            ->selectRaw("COUNT(DISTINCT CASE WHEN type = 'lead' THEN visitor END) as leads")
            ->groupBy($column)
            ->orderByDesc('visitors')
            ->limit(10)
            ->get()
            ->map(fn ($row) => [
                'label' => $row->label ?? $emptyLabel ?? '—',
                'visitors' => (int) $row->visitors,
                'leads' => (int) $row->leads,
            ])
            ->values()
            ->all();
    }

    /** Ordinea secțiunilor de pe pagina principală, ca să se vadă unde se oprește scroll-ul. */
    private const SECTION_ORDER = [
        'hero',
        'problem',
        'cum-functioneaza',
        'proof',
        'trust',
        'preturi',
        'faq',
        'contact',
        'final',
        'produs',
        'demo',
        'onboarding',
        'onboarding-probleme',
        'onboarding-pasi',
        'onboarding-rezultate',
    ];

    private function sections(Builder $query): array
    {
        $rows = $this->labeled($query, 'section_view');
        $rank = array_flip(self::SECTION_ORDER);
        usort($rows, function (array $a, array $b) use ($rank) {
            $ai = $rank[$a['label']] ?? 1000;
            $bi = $rank[$b['label']] ?? 1000;
            if ($ai !== $bi) {
                return $ai <=> $bi;
            }

            return $b['visitors'] <=> $a['visitors'];
        });

        return $rows;
    }

    /** Câte persoane au văzut o secțiune sau au apăsat un buton, grupat după text. */
    private function labeled(Builder $query, string $type): array
    {
        return (clone $query)
            ->where('type', $type)
            ->whereNotNull('label')
            ->where('label', '!=', '')
            ->select('label')
            ->selectRaw('COUNT(*) as events')
            ->selectRaw('COUNT(DISTINCT visitor) as visitors')
            ->groupBy('label')
            ->orderByDesc('visitors')
            ->limit(16)
            ->get()
            ->map(fn ($row) => [
                'label' => (string) $row->label,
                'visitors' => (int) $row->visitors,
                'events' => (int) $row->events,
            ])
            ->values()
            ->all();
    }
}
