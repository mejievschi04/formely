<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Company;
use App\Support\TenantContext;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Illuminate\Support\Facades\Storage;

class CompanyBrandingController extends Controller
{
    public function showBySlug(string $slug)
    {
        $company = Company::query()
            ->where('slug', $slug)
            ->first();

        if ($company && $company->isUsable()) {
            return response()->json(['company' => $company->brandingPayload()]);
        }

        // Login fără ?company= sau slug inexistent: branding Formely default (fără 404 în consolă).
        return response()->json([
            'company' => [
                'id' => null,
                'name' => config('app.name', 'Formely'),
                'slug' => $slug !== '' ? $slug : (string) config('formely.default_company_slug', 'default'),
                'logo_url' => null,
                'primary_color' => '#0891b2',
                'secondary_color' => '#22d3ee',
                'plan' => null,
                'status' => null,
            ],
        ]);
    }

    public function showMine()
    {
        $user = Auth::user();
        if (! $user?->company_id) {
            return response()->json(['message' => 'Nu ești asociat unei companii.'], 404);
        }

        $company = Company::find($user->company_id);
        if (! $company) {
            return response()->json(['message' => 'Compania nu a fost găsită.'], 404);
        }

        return response()->json(['company' => $company->brandingPayload()]);
    }

    public function update(Request $request)
    {
        $user = Auth::user();
        if (! $user?->canManagePlatformSettings()) {
            abort(403, 'Nu ai drepturi pentru branding-ul companiei.');
        }

        if (! $user->company_id) {
            return response()->json(['message' => 'Nu ești asociat unei companii.'], 404);
        }

        $company = Company::findOrFail($user->company_id);

        $validated = $request->validate([
            'name' => 'sometimes|required|string|max:255',
            'primary_color' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
            'secondary_color' => ['sometimes', 'nullable', 'string', 'max:32', 'regex:/^#[0-9A-Fa-f]{6}$/'],
        ]);

        if (isset($validated['name'])) {
            $company->name = strip_tags($validated['name']);
        }
        if (array_key_exists('primary_color', $validated)) {
            $company->primary_color = $validated['primary_color'] ?? '#0891b2';
        }
        if (array_key_exists('secondary_color', $validated)) {
            $company->secondary_color = $validated['secondary_color'] ?? '#22d3ee';
        }

        $company->save();

        return response()->json([
            'message' => 'Branding actualizat',
            'company' => $company->fresh()->brandingPayload(),
        ]);
    }

    public function uploadLogo(Request $request)
    {
        $user = Auth::user();
        if (! $user?->canManagePlatformSettings()) {
            abort(403, 'Nu ai drepturi pentru branding-ul companiei.');
        }

        if (! $user->company_id) {
            return response()->json(['message' => 'Nu ești asociat unei companii.'], 404);
        }

        $request->validate([
            'logo' => 'required|image|mimes:jpeg,png,gif,webp,svg|max:2048',
        ]);

        $company = Company::findOrFail($user->company_id);
        $file = $request->file('logo');
        $ext = $file->getClientOriginalExtension() ?: 'png';
        $path = $file->storeAs(
            'companies/' . $company->id,
            'logo_' . time() . '.' . $ext,
            'public'
        );

        $company->deleteLogoFile();
        $company->logo_path = $path;
        $company->save();

        return response()->json([
            'message' => 'Logo încărcat',
            'company' => $company->fresh()->brandingPayload(),
        ]);
    }

    public function deleteLogo()
    {
        $user = Auth::user();
        if (! $user?->canManagePlatformSettings()) {
            abort(403, 'Nu ai drepturi pentru branding-ul companiei.');
        }

        if (! $user->company_id) {
            return response()->json(['message' => 'Nu ești asociat unei companii.'], 404);
        }

        $company = Company::findOrFail($user->company_id);
        $company->deleteLogoFile();
        $company->logo_path = null;
        $company->save();

        return response()->json([
            'message' => 'Logo eliminat',
            'company' => $company->fresh()->brandingPayload(),
        ]);
    }
}
