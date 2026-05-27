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
            background: linear-gradient(135deg, {{ $settings['background_color'] ?? '#ffffff' }} 0%, {{ $settings['primary_color'] ?? '#38bdf8' }}08 50%, {{ $settings['secondary_color'] ?? '#0ea5e9' }}08 100%);
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
        
        .certificate-border-outer {
            position: absolute;
            top: 15mm;
            left: 15mm;
            right: 15mm;
            bottom: 15mm;
            border: 2pt {{ $settings['border_style'] ?? 'solid' }} {{ $settings['border_color'] ?? '#38bdf8' }};
            border-radius: 8pt;
            opacity: 0.3;
            pointer-events: none;
        }
        
        .certificate-logo {
            margin-bottom: 10mm;
            max-height: 60px;
            max-width: 200px;
            object-fit: contain;
            position: relative;
            z-index: 1;
        }
        
        .certificate-icon {
            font-size: 48pt;
            margin-bottom: 10mm;
            position: relative;
            z-index: 1;
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
            font-size: 28pt;
            font-weight: bold;
            background: linear-gradient(135deg, {{ $settings['primary_color'] ?? '#38bdf8' }} 0%, {{ $settings['secondary_color'] ?? '#0ea5e9' }} 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 0 0 6mm 0;
            letter-spacing: 2.5pt;
            text-transform: uppercase;
            line-height: 1.2;
        }
        
        .certificate-subtitle {
            font-size: 12pt;
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
            font-size: 14pt;
            color: #475569;
            line-height: 1.6;
            margin: 6mm 0;
            max-width: 100%;
        }
        
        .certificate-name {
            font-size: 32pt;
            font-weight: bold;
            background: linear-gradient(135deg, {{ $settings['primary_color'] ?? '#38bdf8' }} 0%, {{ $settings['secondary_color'] ?? '#0ea5e9' }} 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
            margin: 10mm 0;
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-course {
            font-size: 24pt;
            font-weight: 600;
            color: {{ $settings['secondary_color'] ?? '#0ea5e9' }};
            margin: 10mm 0;
            padding: 15pt 25pt;
            background: linear-gradient(135deg, {{ $settings['primary_color'] ?? '#38bdf8' }}10 0%, {{ $settings['secondary_color'] ?? '#0ea5e9' }}10 100%);
            border-radius: 8pt;
            border-left: 4pt solid {{ $settings['accent_color'] ?? '#ffd700' }};
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-custom-text {
            font-size: 12pt;
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
            border-top: 2pt solid {{ $settings['border_color'] ?? '#38bdf8' }}30;
            position: relative;
            z-index: 1;
            flex-shrink: 0;
        }
        
        .certificate-date {
            text-align: left;
            flex: 1;
            min-width: 0;
        }
        
        .certificate-date-label {
            font-size: 11pt;
            color: #64748b;
            margin-bottom: 2mm;
        }
        
        .certificate-date-value {
            font-size: 13pt;
            font-weight: 600;
            color: #1e293b;
        }
        
        .certificate-id {
            text-align: left;
            flex: 1;
            margin-left: 20mm;
            min-width: 0;
        }
        
        .certificate-id-label {
            font-size: 11pt;
            color: #64748b;
            margin-bottom: 2mm;
        }
        
        .certificate-id-value {
            font-size: 11pt;
            font-family: 'Courier New', monospace;
            color: #1e293b;
        }
        
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="certificate-border-outer"></div>
        
        @if(!empty($settings['logo_url']))
        <img src="{{ asset($settings['logo_url']) }}" alt="Logo" class="certificate-logo" />
        @else
        <div class="certificate-icon">🏆</div>
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
