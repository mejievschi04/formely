<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Certificat de Finalizare - {{ $course_title }}</title>
    <style>
        @page {
            size: A4 landscape;
            margin: 0;
        }
        
        body {
            margin: 0;
            padding: 0;
            font-family: {{ $settings['font_family'] ?? 'Georgia, serif' }};
            background: linear-gradient(135deg, {{ $settings['primary_color'] ?? '#38bdf8' }} 0%, {{ $settings['secondary_color'] ?? '#0ea5e9' }} 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        
        .certificate-container {
            width: 297mm;
            height: 210mm;
            background: {{ $settings['background_color'] ?? '#ffffff' }};
            position: relative;
            padding: 30mm 35mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
        }
        
        .certificate-border {
            position: absolute;
            top: 15mm;
            left: 15mm;
            right: 15mm;
            bottom: 15mm;
            border: {{ $settings['border_width'] ?? '3px' }} {{ $settings['border_style'] ?? 'solid' }} {{ $settings['border_color'] ?? '#38bdf8' }};
            border-radius: 8mm;
            pointer-events: none;
        }
        
        .certificate-logo {
            margin-bottom: 8mm;
            max-height: 50px;
            max-width: 200px;
            object-fit: contain;
        }
        
        .certificate-icon {
            font-size: 40pt;
            margin-bottom: 8mm;
            filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.1));
            line-height: 1;
        }
        
        .certificate-header {
            margin-bottom: 12mm;
            position: relative;
            z-index: 1;
            flex-shrink: 0;
        }
        
        .certificate-title {
            font-size: 24pt;
            font-weight: bold;
            color: {{ $settings['primary_color'] ?? '#38bdf8' }};
            margin: 0 0 4mm 0;
            letter-spacing: 2pt;
            text-transform: uppercase;
            line-height: 1.2;
        }
        
        .certificate-subtitle {
            font-size: 11pt;
            color: #64748b;
            margin-top: 3mm;
            line-height: 1.4;
        }
        
        .certificate-body {
            flex: 1;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            width: 100%;
            position: relative;
            z-index: 1;
            min-height: 0;
            padding: 0 10mm;
        }
        
        .certificate-text {
            font-size: 13pt;
            color: #475569;
            line-height: 1.6;
            margin: 6mm 0;
            max-width: 100%;
        }
        
        .certificate-name {
            font-size: 28pt;
            font-weight: bold;
            color: {{ $settings['primary_color'] ?? '#38bdf8' }};
            margin: 8mm 0;
            padding: 12pt 20pt;
            background: linear-gradient(135deg, {{ $settings['primary_color'] ?? '#38bdf8' }}15 0%, {{ $settings['secondary_color'] ?? '#0ea5e9' }}10 100%);
            border-radius: 8pt;
            border: 2pt solid {{ $settings['primary_color'] ?? '#38bdf8' }}30;
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-course {
            font-size: 20pt;
            font-weight: 600;
            color: {{ $settings['secondary_color'] ?? '#0ea5e9' }};
            margin: 8mm 0;
            padding: 12pt 20pt;
            border-left: 4pt solid {{ $settings['primary_color'] ?? '#38bdf8' }};
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-custom-text {
            font-size: 11pt;
            color: #64748b;
            margin: 8mm 0;
            font-style: italic;
            line-height: 1.5;
            max-width: 100%;
        }
        
        .certificate-footer {
            margin-top: auto;
            display: flex;
            justify-content: space-between;
            width: 100%;
            padding-top: 12mm;
            border-top: 1pt solid #e2e8f0;
            font-size: 10pt;
            position: relative;
            z-index: 1;
            flex-shrink: 0;
        }
        
        .certificate-date {
            text-align: left;
            flex: 1;
        }
        
        .certificate-date-label {
            color: #64748b;
            margin-bottom: 1.5mm;
            font-size: 9pt;
        }
        
        .certificate-date-value {
            font-weight: 600;
            color: #1e293b;
            font-size: 10pt;
        }
        
        .certificate-id {
            text-align: left;
            flex: 1;
            margin-left: 20mm;
        }
        
        .certificate-id-label {
            color: #64748b;
            margin-bottom: 1.5mm;
            font-size: 9pt;
        }
        
        .certificate-id-value {
            font-family: 'Courier New', monospace;
            font-size: 9pt;
            color: #1e293b;
        }
        
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="certificate-border"></div>
        
        @if(!empty($settings['logo_url']))
        <img src="{{ asset($settings['logo_url']) }}" alt="Logo" class="certificate-logo" />
        @else
        <div class="certificate-icon">🎓</div>
        @endif
        
        <div class="certificate-header">
            <h1 class="certificate-title">Certificat de Finalizare</h1>
            <p class="certificate-subtitle">{{ $settings['organization_name'] ?? 'Formely' }} • {{ $settings['organization_subtitle'] ?? 'Platformă de învățare online' }}</p>
        </div>
        
        <div class="certificate-body">
            <p class="certificate-text">
                Acest certificat atestă faptul că
            </p>
            
            <div class="certificate-name">
                {{ $user_name }}
            </div>
            
            <p class="certificate-text">
                a finalizat cu succes cursul
            </p>
            
            <div class="certificate-course">
                {{ $course_title }}
            </div>
            
            @if(!empty($settings['custom_text']))
            <p class="certificate-custom-text">
                {{ $settings['custom_text'] }}
            </p>
            @endif
        </div>
        
        <div class="certificate-footer">
            <div class="certificate-date">
                <div class="certificate-date-label">Data finalizării</div>
                <div class="certificate-date-value">{{ \Carbon\Carbon::parse($completion_date)->format('d.m.Y') }}</div>
            </div>
            <div class="certificate-id">
                <div class="certificate-id-label">ID Certificat</div>
                <div class="certificate-id-value">{{ $certificate_id }}</div>
            </div>
        </div>
        
    </div>
</body>
</html>
