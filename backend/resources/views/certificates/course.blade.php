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
            font-family: 'Georgia', serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
        }
        
        .certificate-container {
            width: 297mm;
            height: 210mm;
            background: #ffffff;
            position: relative;
            padding: 40mm;
            box-sizing: border-box;
            display: flex;
            flex-direction: column;
            justify-content: center;
            align-items: center;
            text-align: center;
        }
        
        .certificate-border {
            position: absolute;
            top: 20mm;
            left: 20mm;
            right: 20mm;
            bottom: 20mm;
            border: 3mm solid #ffd700;
            border-radius: 10mm;
        }
        
        .certificate-header {
            margin-bottom: 20mm;
        }
        
        .certificate-title {
            font-size: 48pt;
            font-weight: bold;
            color: #667eea;
            margin: 0;
            text-transform: uppercase;
            letter-spacing: 4pt;
        }
        
        .certificate-subtitle {
            font-size: 18pt;
            color: #666;
            margin-top: 10mm;
            font-style: italic;
        }
        
        .certificate-body {
            margin: 20mm 0;
        }
        
        .certificate-text {
            font-size: 16pt;
            color: #333;
            line-height: 1.8;
            margin: 10mm 0;
        }
        
        .certificate-name {
            font-size: 32pt;
            font-weight: bold;
            color: #667eea;
            margin: 15mm 0;
            text-decoration: underline;
            text-decoration-color: #ffd700;
            text-decoration-thickness: 3pt;
        }
        
        .certificate-course {
            font-size: 24pt;
            font-weight: bold;
            color: #764ba2;
            margin: 15mm 0;
        }
        
        .certificate-footer {
            margin-top: 30mm;
            display: flex;
            justify-content: space-between;
            width: 100%;
            font-size: 12pt;
            color: #666;
        }
        
        .certificate-date {
            text-align: left;
        }
        
        .certificate-id {
            text-align: right;
            font-family: 'Courier New', monospace;
        }
        
    </style>
</head>
<body>
    <div class="certificate-container">
        <div class="certificate-border"></div>
        
        <div class="certificate-header">
            <h1 class="certificate-title">Certificat de Finalizare</h1>
            <p class="certificate-subtitle">formely</p>
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
            
            @if($course_category)
            <p class="certificate-text" style="font-size: 14pt; color: #666;">
                Categorie: {{ $course_category }}
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

