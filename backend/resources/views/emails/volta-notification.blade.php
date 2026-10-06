<!DOCTYPE html>
<html lang="ro">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>{{ $heading }}</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.5; color: #1e293b; background: #f8fafc; margin: 0; padding: 24px;">
    <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px; border: 1px solid #e2e8f0;">
        <p style="margin: 0 0 8px; font-size: 13px; color: #64748b; text-transform: uppercase; letter-spacing: 0.04em;">Formely</p>
        <h1 style="margin: 0 0 16px; font-size: 22px; color: #0f172a;">{{ $heading }}</h1>
        <p style="margin: 0 0 20px; font-size: 16px;">{{ $body }}</p>
        @if(!empty($actionUrl))
            <p style="margin: 24px 0 0;">
                <a href="{{ $actionUrl }}" style="display: inline-block; background: #5b72ff; color: #ffffff; text-decoration: none; padding: 12px 20px; border-radius: 8px; font-weight: 600; font-size: 15px;">
                    {{ $actionLabel }}
                </a>
            </p>
        @endif
        <p style="margin: 28px 0 0; font-size: 12px; color: #94a3b8;">
            Primești acest email pentru că ai cont în Formely. Poți dezactiva notificările email din setările platformei (admin).
        </p>
    </div>
</body>
</html>
