// A fixed example for the public demo. Never used as a provider response or saved.
export const recordedAiExample = {
	title: 'Prima zi în echipă',
	audience: 'Angajați noi',
	filename: 'Ghid de bun venit.txt',
	source: 'În prima zi, noul coleg este întâmpinat de manager și își cunoaște echipa. Primește acces la email și la instrumentele de lucru. Parolele trebuie să fie unice, iar autentificarea în doi pași este obligatorie. La finalul zilei, verifică împreună cu managerul dacă toate conturile funcționează și stabilește obiectivele primei săptămâni.',
	modules: [
		{ title: 'Bun venit în echipă', lessons: ['Întâlnirea cu managerul și colegii', 'Obiectivele primei săptămâni'] },
		{ title: 'Pregătirea pentru lucru', lessons: ['Acces la conturi și instrumente', 'Parole sigure și autentificare în doi pași'] },
	],
	lesson: {
		title: 'Acces la conturi și instrumente',
		body: 'Începe prin a verifica accesul la email și la instrumentele echipei. Dacă un cont nu funcționează, anunță managerul înainte să continui.',
		checklist: ['Deschide emailul de serviciu.', 'Verifică accesul la instrumentele de lucru.', 'Activează autentificarea în doi pași.', 'Confirmă cu managerul că toate conturile funcționează.'],
	},
	test: {
		title: 'Verifică ce ai reținut din prima zi',
		questions: [
			{ text: 'Cine te ajută să stabilești obiectivele primei săptămâni?', options: ['Managerul tău', 'Un client', 'Orice persoană din afara echipei'], correct: 0, explanation: 'Ghidul precizează că obiectivele sunt stabilite împreună cu managerul.' },
			{ text: 'Cum îți protejezi conturile de serviciu?', options: ['Folosești aceeași parolă peste tot', 'Alegi parole unice și activezi autentificarea în doi pași', 'Trimiți parola echipei prin email'], correct: 1, explanation: 'Parolele unice și autentificarea în doi pași sunt cerințele din material.' },
			{ text: 'Ce faci dacă un cont de lucru nu funcționează?', options: ['Folosești contul unui coleg', 'Aștepți până săptămâna viitoare', 'Anunți managerul și verifici accesul împreună'], correct: 2, explanation: 'Accesul este verificat cu managerul; conturile nu se împrumută.' },
		],
	},
};

export const recordedAiFrames = [
	'Materialul exemplu este pregătit.',
	'Identificăm pașii din ghidul de bun venit.',
	'Grupăm informațiile în două module.',
	'Pregătim patru lecții cu pași practici.',
	'Cursul este pregătit: două module și patru lecții.',
	'Pregătim testul pe baza lecțiilor.',
	'Testul este pregătit: trei întrebări cu răspunsuri și explicații.',
	'Verificăm cursul și testul înainte de publicare.',
	'Cursul și testul sunt publicate în demonstrație.',
];
