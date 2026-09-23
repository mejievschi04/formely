import{o as T,a0 as B,u as D,l as R,a as A,r as o,g as v,j as e}from"./index-CBickAzg.js";import{R as F}from"./RichTextEditor-B1cFazyL.js";import"./CaretRight.es-CE02NwUS.js";import"./pdfTextExtractor-B67cgcTL.js";import"./pdfWorker-DEAtLvyV.js";import"./richTextContent-BzLgR73K.js";const I=[{id:"introduction",name:"Introducere",icon:"📖",template:`# Introducere

Bine ai venit la această lecție!

## Obiective
- Obiectivul 1
- Obiectivul 2
- Obiectivul 3

## Ce vei învăța
În această lecție vei învăța...`},{id:"theory",name:"Teorie",icon:"📚",template:`# Teorie

## Concepte Cheie

### Conceptul 1
Descrierea conceptului...

### Conceptul 2
Descrierea conceptului...

## Explicații Detaliate
Text explicativ detaliat...`},{id:"example",name:"Scenariu",icon:"💡",template:`# Scenariu practic

## Context
Descrierea situației...

## Aplicare
Cum se aplică conținutul în practică...

### Note
Observații relevante...`},{id:"exercise",name:"Exercițiu",icon:"✏️",template:`# Exercițiu

## Sarcina
Descrierea sarcinii...

## Instrucțiuni
1. Pasul 1
2. Pasul 2
3. Pasul 3

## Soluție
Soluția exercițiului...`},{id:"summary",name:"Rezumat",icon:"📝",template:`# Rezumat

## Puncte Cheie
- Punctul cheie 1
- Punctul cheie 2
- Punctul cheie 3

## Concluzie
Concluzia lecției...`},{id:"resources",name:"Resurse",icon:"🔗",template:`# Resurse Suplimentare

## Link-uri utile
- [Titlu resursă](URL)

## Documentație
Link către documentație...

## Lecturi Recomandate
- Lectura 1
- Lectura 2`}],G=()=>{const{id:r}=T(),[N]=B(),t=D(),{showToast:u}=R(),{canMutateInAdminArea:p}=A(),n=N.get("course_id"),x=N.get("module_id"),[j,g]=o.useState(!1),[C,S]=o.useState([]),[w,_]=o.useState(!1),[c,$]=o.useState({}),[l,b]=o.useState({}),[a,d]=o.useState({course_id:n||"",module_id:x||"",title:"",content:"",order:0});o.useEffect(()=>{p||t(n?`/admin/courses/${n}`:"/admin/content?tab=courses&view=maps",{replace:!0})},[p,n,t]),o.useEffect(()=>{if(p){if(!n&&!r){u("Selectează un curs pentru a crea o lecție","error"),t("/admin/courses");return}y(),r&&r!=="new"?z():d(s=>({...s,course_id:n||s.course_id,module_id:x||s.module_id}))}},[r,n,x,p]);const y=async()=>{try{const i=await v.getCourses();S(i),n&&!a.course_id&&d(f=>({...f,course_id:n}))}catch(s){console.error("Error fetching courses:",s)}},z=async()=>{try{g(!0);const s=await v.getLesson(r);d({course_id:s.course_id||n||"",module_id:s.module_id||x||"",title:s.title||"",content:s.content||"",order:s.order||0})}catch(s){console.error("Error fetching lesson:",s),u("Eroare la încărcarea lecției","error")}finally{g(!1)}},L=s=>{let i=s;return i=i.replace(/^### (.*$)/gim,"<h3>$1</h3>"),i=i.replace(/^## (.*$)/gim,"<h2>$1</h2>"),i=i.replace(/^# (.*$)/gim,"<h1>$1</h1>"),i=i.replace(/\*\*(.+?)\*\*/g,"<strong>$1</strong>"),i=i.replace(/\*(.+?)\*/g,"<em>$1</em>"),i=i.replace(/```([\s\S]*?)```/g,"<pre><code>$1</code></pre>"),i=i.replace(/`([^`]+)`/g,"<code>$1</code>"),i=i.replace(/\[([^\]]+)\]\(([^)]+)\)/g,'<a href="$2">$1</a>'),i=i.replace(/^\- (.+)$/gim,"<li>$1</li>"),i=i.replace(/(<li>.*<\/li>)/s,"<ul>$1</ul>"),i=i.replace(/\n/g,"<br>"),i},k=s=>{const i=a.content,f=i?"<br><br><hr><br><br>":"",P=L(s.template);d({...a,content:i+f+P}),_(!1)},m=()=>{const s={};a.course_id||(s.course_id="Trebuie să selectezi un curs"),(!a.title||a.title.trim().length<3)&&(s.title="Titlul trebuie să aibă minim 3 caractere");const i=a.content?a.content.replace(/<[^>]*>/g,"").trim():"";return(!a.content||i.length<20)&&(s.content="Conținutul trebuie să aibă minim 20 caractere"),$(s),Object.keys(s).length===0},h=()=>{let s=0;const i=3;return a.course_id&&s++,a.title&&a.title.trim().length>=3&&s++,(a.content?a.content.replace(/<[^>]*>/g,"").trim():"").length>=20&&s++,Math.round(s/i*100)},E=async s=>{if(s.preventDefault(),!m()){u("Completează toate câmpurile obligatorii","error");return}try{g(!0),r&&r!=="new"?(await v.updateLesson(r,a),u("Lecție actualizată cu succes","success")):(await v.createLesson(a),u("Lecție creată cu succes","success")),a.course_id?t(`/admin/courses/${a.course_id}`):t("/admin/courses")}catch(i){console.error("Error saving lesson:",i),u(i?.response?.data?.message||i?.message||"Eroare la salvarea lecției","error")}finally{g(!1)}};return j&&r&&r!=="new"?e.jsx("div",{className:"admin-lesson-creator-page",children:e.jsx("div",{className:"admin-loading-state",children:e.jsx("p",{children:"Se încarcă..."})})}):e.jsx("div",{className:"admin-lesson-creator-page",children:e.jsxs("div",{className:"admin-lesson-creator-container",children:[e.jsxs("div",{className:"admin-page-header",children:[e.jsxs("div",{children:[e.jsx("h1",{className:"admin-page-title",children:r&&r!=="new"?"Editează Lecție":"Creează Lecție Nouă"}),e.jsxs("p",{className:"admin-page-subtitle",children:["Lecție în cursul Formely — ",r&&r!=="new"?"actualizează":"completează"," conținutul și setările."]})]}),e.jsx("button",{className:"admin-btn admin-btn-secondary",onClick:()=>{a.course_id?t(`/admin/courses/${a.course_id}`):t("/admin/courses")},children:"← Înapoi"})]}),e.jsxs("div",{className:"admin-creator-split",children:[e.jsx("div",{className:"admin-creator-form-panel",children:e.jsx("div",{className:"admin-form-body",children:e.jsxs("form",{onSubmit:E,className:"admin-lesson-form",children:[e.jsxs("div",{className:"admin-form-progress",children:[e.jsxs("div",{className:"admin-form-progress-header",children:[e.jsx("span",{className:"admin-form-progress-label",children:"Progres completare"}),e.jsxs("span",{className:"admin-form-progress-value",children:[h(),"%"]})]}),e.jsx("div",{className:"admin-form-progress-bar",children:e.jsx("div",{className:"admin-form-progress-fill",style:{width:`${h()}%`}})})]}),e.jsxs("div",{className:"admin-form-group",children:[e.jsxs("label",{className:"admin-label admin-label-with-icon",children:[e.jsx("span",{children:"📚"}),e.jsx("span",{children:"Curs"}),a.course_id&&e.jsx("span",{className:"admin-form-check",children:"✓"})]}),e.jsxs("select",{className:`admin-form-select ${c.course_id?"error":""} ${a.course_id?"has-value":""}`,value:a.course_id,onChange:s=>{d({...a,course_id:s.target.value}),l.course_id&&m()},onBlur:()=>{b({...l,course_id:!0}),m()},required:!0,disabled:!!n,children:[e.jsx("option",{value:"",children:"Selectează curs..."}),C.map(s=>e.jsx("option",{value:s.id,children:s.title},s.id))]}),c.course_id&&l.course_id&&e.jsx("p",{className:"admin-form-error",children:c.course_id}),C.length===0&&e.jsx("div",{className:"admin-form-info",children:"💡 Nu există cursuri disponibile. Creează mai întâi un curs!"})]}),e.jsxs("div",{className:"admin-form-group",children:[e.jsxs("label",{className:"admin-label admin-label-with-icon",children:[e.jsx("span",{children:"📝"}),e.jsxs("span",{children:["Titlu Lecție ",e.jsx("span",{className:"admin-form-required",children:"*"})]}),a.title&&a.title.trim().length>=3&&e.jsx("span",{className:"admin-form-check",children:"✓"})]}),e.jsx("input",{type:"text",className:`admin-form-input ${c.title?"error":""} ${a.title&&a.title.trim().length>=3?"has-value":""}`,value:a.title,onChange:s=>{d({...a,title:s.target.value}),l.title&&m()},onBlur:()=>{b({...l,title:!0}),m()},placeholder:"Titlul lecției",required:!0}),c.title&&l.title&&e.jsx("p",{className:"admin-form-error",children:c.title}),a.title&&a.title.trim().length>0&&a.title.trim().length<3&&e.jsxs("p",{className:"admin-form-help-text",children:["💡 Minim 3 caractere necesare (",a.title.trim().length,"/3)"]})]}),e.jsxs("div",{className:"admin-form-group",children:[e.jsxs("div",{className:"admin-form-group-header",children:[e.jsxs("label",{className:"admin-label admin-label-with-icon",children:[e.jsx("span",{children:"📄"}),e.jsxs("span",{children:["Conținut Lecție ",e.jsx("span",{className:"admin-form-required",children:"*"})]}),a.content&&a.content.replace(/<[^>]*>/g,"").trim().length>=20&&e.jsx("span",{className:"admin-form-check",children:"✓"})]}),e.jsxs("button",{type:"button",className:"admin-btn admin-btn-sm admin-btn-primary",onClick:()=>_(!w),children:[e.jsx("span",{children:"➕"}),e.jsx("span",{children:"Adaugă Bloc"})]})]}),w&&e.jsxs("div",{className:"admin-block-selector",children:[e.jsx("h4",{className:"admin-block-selector-title",children:"Selectează un bloc pentru a-l adăuga:"}),e.jsx("div",{className:"admin-block-grid",children:I.map(s=>e.jsxs("button",{type:"button",className:"admin-block-card",onClick:()=>k(s),children:[e.jsx("span",{className:"admin-block-icon",children:s.icon}),e.jsx("span",{className:"admin-block-name",children:s.name})]},s.id))})]}),e.jsx("div",{className:`admin-form-editor-wrapper ${c.content?"has-error":""} ${a.content&&a.content.replace(/<[^>]*>/g,"").trim().length>=20?"has-value":""}`,children:e.jsx(F,{value:a.content,onChange:s=>{d({...a,content:s}),l.content&&m()},onBlur:()=>{b({...l,content:!0}),m()},placeholder:"Scrie conținutul lecției aici sau adaugă blocuri gata făcute folosind butonul de mai sus..."})}),c.content&&l.content&&e.jsx("p",{className:"admin-form-error",children:c.content}),a.content&&(()=>{const s=a.content.replace(/<[^>]*>/g,"").trim();return e.jsx("p",{className:`admin-form-help-text ${s.length>=20?"success":""}`,children:s.length>=20?e.jsxs(e.Fragment,{children:["✓ ",s.length," caractere"]}):e.jsxs(e.Fragment,{children:["💡 Minim 20 caractere necesare (",s.length,"/20)"]})})})(),e.jsx("div",{className:"admin-form-info",children:"💡 Poți folosi formatare Markdown pentru text (bold, italic, liste, etc.) sau adaugă blocuri gata făcute folosind butonul de mai sus."})]}),e.jsxs("div",{className:"admin-form-actions",children:[e.jsx("button",{type:"button",className:"admin-btn admin-btn-secondary",onClick:()=>{a.course_id?t(`/admin/courses/${a.course_id}`):t("/admin/courses")},disabled:j,children:"Anulează"}),e.jsx("button",{type:"submit",className:`admin-btn admin-btn-primary ${h()<100?"disabled":""}`,disabled:j||h()<100,children:j?e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"⏳"}),e.jsx("span",{children:"Se salvează..."})]}):h()<100?e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"⚠️"}),e.jsx("span",{children:"Completează toate câmpurile"})]}):e.jsxs(e.Fragment,{children:[e.jsx("span",{children:"💾"}),e.jsx("span",{children:r&&r!=="new"?"Actualizează Lecție":"Creează Lecție"})]})})]})]})})}),e.jsxs("div",{className:"admin-creator-preview-panel",children:[e.jsxs("div",{className:"admin-creator-preview-header",children:[e.jsx("h3",{children:"Preview Live"}),e.jsx("p",{children:"Vizualizează modificările în timp real"})]}),e.jsx("div",{className:"admin-creator-preview-content",children:e.jsx("div",{className:"lesson-preview-card",children:e.jsxs("div",{className:"lesson-preview-body",children:[e.jsx("h4",{className:"lesson-preview-title",children:a.title||"Titlu lecție"}),a.content&&e.jsx("div",{className:"lesson-preview-content",dangerouslySetInnerHTML:{__html:a.content}}),!a.content&&e.jsx("p",{className:"lesson-preview-placeholder",children:"Conținutul lecției va apărea aici..."}),e.jsx("div",{className:"lesson-preview-meta",children:e.jsxs("div",{className:"lesson-preview-meta-item",children:[e.jsx("span",{className:"lesson-preview-meta-label",children:"Status:"}),e.jsx("span",{className:"lesson-preview-meta-value",children:a.status||"draft"})]})})]})})})]})]})]})})};export{G as default};
