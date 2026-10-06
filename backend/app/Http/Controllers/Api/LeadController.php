<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Mail\VoltaUserNotificationMail;
use App\Models\Lead;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

class LeadController extends Controller
{
    public function store(Request $request)
    {
        $validated = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255',
            'phone' => 'nullable|string|max:40',
            'company_name' => 'nullable|string|max:255',
            'reason' => 'nullable|string|max:64',
            'plan_interest' => 'nullable|in:instructor,academie,business',
            'message' => 'nullable|string|max:5000',
            'source' => 'nullable|string|max:64',
            'privacy_accepted' => 'accepted',
        ], [
            'privacy_accepted.accepted' => 'Trebuie să accepți prelucrarea datelor pentru a trimite cererea.',
        ]);

        $lead = Lead::create([
            'name' => strip_tags($validated['name']),
            'email' => strtolower(trim($validated['email'])),
            'phone' => isset($validated['phone']) ? trim(strip_tags($validated['phone'])) : null,
            'company_name' => isset($validated['company_name']) ? strip_tags($validated['company_name']) : null,
            'reason' => $validated['reason'] ?? 'oferta',
            'plan_interest' => $validated['plan_interest'] ?? null,
            'message' => $validated['message'] ?? null,
            'status' => 'new',
            'source' => $validated['source'] ?? 'website',
            'ip' => $request->ip(),
            'privacy_accepted_at' => now(),
        ]);

        $notify = (string) config('formely.leads_notify_email', '');
        if ($notify !== '') {
            try {
                $body = "Lead nou Formely\n\n"
                    . "Nume: {$lead->name}\n"
                    . "Email: {$lead->email}\n"
                    . "Telefon: ".($lead->phone ?: '—')."\n"
                    . "Companie: ".($lead->company_name ?: '—')."\n"
                    . "Motiv: ".($lead->reason ?: '—')."\n"
                    . "Plan: ".($lead->plan_interest ?: '—')."\n"
                    . ($lead->message ? "Mesaj:\n{$lead->message}\n" : '');

                Mail::to($notify)->queue(new VoltaUserNotificationMail(
                    'Lead nou: '.$lead->name,
                    $body
                ));
            } catch (\Throwable $e) {
                Log::warning('Lead notify email failed', ['error' => $e->getMessage()]);
            }
        }

        return response()->json([
            'message' => 'Mulțumim! Te contactăm în curând.',
            'id' => $lead->id,
        ], 201);
    }
}
