<!DOCTYPE html>
<html lang="ro">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Invitație Formely</title>
</head>
<body style="font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; line-height: 1.55; color: #0f172a; background: #f1f5f9; margin: 0; padding: 32px 16px;">
    <div style="max-width: 560px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 20px;">
            <span style="display: inline-block; font-size: 12px; font-weight: 700; letter-spacing: 0.08em; text-transform: uppercase; color: #64748b;">Formely</span>
        </div>
        <div style="background: #ffffff; border-radius: 16px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 8px 30px rgba(15, 23, 42, 0.06);">
            <div style="height: 6px; background: linear-gradient(90deg, #ffee00 0%, #fbbf24 100%);"></div>
            <div style="padding: 32px 28px;">
                <h1 style="margin: 0 0 12px; font-size: 24px; line-height: 1.25; color: #0f172a;">
                    @if ($isReminder)
                        Invitația expiră curând{{ $recipientName ? ', ' . $recipientName : '' }}
                    @else
                        Bine ai venit{{ $recipientName ? ', ' . $recipientName : '' }}!
                    @endif
                </h1>
                <p style="margin: 0 0 20px; font-size: 16px; color: #475569;">
                    @if ($isReminder)
                        Linkul primit de la <strong>{{ $inviterName }}</strong> pentru Formely expiră în curând.
                        Activează-ți contul acum ca să nu fie nevoie de o invitație nouă.
                    @else
                        <strong>{{ $inviterName }}</strong> te-a invitat să te alături platformei Formely.
                        Apasă butonul de mai jos pentru a-ți crea contul — durează mai puțin de un minut.
                    @endif
                </p>
                <p style="margin: 0 0 28px;">
                    <a href="{{ $registerUrl }}" style="display: inline-block; background: #0f172a; color: #ffee00; text-decoration: none; padding: 14px 24px; border-radius: 10px; font-weight: 700; font-size: 15px;">
                        Activează contul
                    </a>
                </p>
                <p style="margin: 0 0 8px; font-size: 13px; color: #64748b;">
                    Link alternativ (dacă butonul nu funcționează):
                </p>
                <p style="margin: 0 0 24px; font-size: 12px; word-break: break-all; color: #5b72ff;">
                    <a href="{{ $registerUrl }}" style="color: #5b72ff;">{{ $registerUrl }}</a>
                </p>
                <div style="padding: 14px 16px; border-radius: 10px; background: #f8fafc; border: 1px solid #e2e8f0;">
                    <p style="margin: 0; font-size: 13px; color: #64748b;">
                        Linkul este valabil <strong>{{ $expiresInDays }} zile</strong>.
                        Dacă nu ai solicitat această invitație, poți ignora acest email.
                    </p>
                </div>
            </div>
        </div>
        <p style="margin: 20px 0 0; text-align: center; font-size: 12px; color: #94a3b8;">
            © {{ date('Y') }} Formely
        </p>
    </div>
</body>
</html>
