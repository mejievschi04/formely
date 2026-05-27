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
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
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
            border: {{ $settings['border_width'] ?? '3mm' }} solid {{ $settings['accent_color'] ?? '#ffd700' }};
            border-radius: 8mm;
            pointer-events: none;
        }
        
        .certificate-logo {
            margin-bottom: 10mm;
            max-height: 70px;
            max-width: 200px;
            object-fit: contain;
        }
        
        .certificate-header {
            margin-bottom: 12mm;
            position: relative;
            z-index: 1;
            flex-shrink: 0;
        }
        
        .certificate-title {
            font-size: 40pt;
            font-weight: bold;
            color: {{ $settings['primary_color'] ?? '#667eea' }};
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 3pt;
            line-height: 1.2;
        }
        
        .certificate-subtitle {
            font-size: 16pt;
            color: #666;
            margin-top: 6mm;
            font-style: italic;
            line-height: 1.3;
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
            font-size: 15pt;
            color: #333;
            line-height: 1.6;
            margin: 6mm 0;
            max-width: 100%;
        }
        
        .certificate-name {
            font-size: 28pt;
            font-weight: bold;
            color: {{ $settings['primary_color'] ?? '#667eea' }};
            margin: 10mm 0;
            text-decoration: underline;
            text-decoration-color: {{ $settings['accent_color'] ?? '#ffd700' }};
            text-decoration-thickness: 2.5pt;
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-course {
            font-size: 22pt;
            font-weight: bold;
            color: {{ $settings['secondary_color'] ?? '#764ba2' }};
            margin: 10mm 0;
            line-height: 1.3;
            word-wrap: break-word;
            max-width: 100%;
        }
        
        .certificate-custom-text {
            font-size: 13pt;
            color: #666;
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
            font-size: 11pt;
            color: #666;
            position: relative;
            z-index: 1;
            flex-shrink: 0;
            padding-top: 8mm;
        }
        
        .certificate-date {
            text-align: left;
            flex: 1;
        }
        
        .certificate-id {
            text-align: left;
            font-family: 'Courier New', monospace;
            flex: 1;
            margin-left: 20mm;
        }
        
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="certificate-border"></div>
        
        @if(!empty($settings['logo_url']))
        <img src="{{ asset($settings['logo_url']) }}" alt="Logo" class="certificate-logo" />
        @endif
        
        <div class="certificate-header">
            <h1 class="certificate-title">Certificat de Finalizare</h1>
            <p class="certificate-subtitle">{{ $settings['organization_name'] ?? 'Formely' }}</p>
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
                Data: {{ \Carbon\Carbon::parse($completion_date)->format('d.m.Y') }}
            </div>
            <div class="certificate-id">
                ID: {{ $certificate_id }}
            </div>
        </div>
        
    </div>
</body>
</html>
