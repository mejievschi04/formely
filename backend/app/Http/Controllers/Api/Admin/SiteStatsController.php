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

        return response()->json([
            'days' => $days,
            'totals' => [
                'pageviews' => $pageviews,
                'visitors' => $funnel['pageview'],
                'cta_clicks' => $funnel['cta_click'],
                'form_starts' => $funnel['form_start'],
                'leads' => $funnel['lead'],
                'conversion' => $funnel['pageview'] > 0 ? round($funnel['lead'] / $funnel['pageview'] * 100, 1) : 0,
            ],
            'daily' => $this->daily($base(), $from, $days),
            'sources' => $this->breakdown($base(), 'source', 'Direct'),
            'campaigns' => $this->breakdown($base()->whereNotNull('utm_campaign'), 'utm_campaign'),
            'devices' => $this->breakdown($base(), 'device'),
            'languages' => $this->breakdown($base(), 'lang'),
            'pages' => $this->breakdown($base(), 'path'),
        ]);
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
}
