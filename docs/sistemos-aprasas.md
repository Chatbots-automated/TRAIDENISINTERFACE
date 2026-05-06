# Sistemos aprašas

## Paskirtis

TRAIDENIS programa skirta valdyti standartinių ir nestandartinių gaminių paklausimus, kaupti projektų duomenis, rengti komercinius pasiūlymus ir padėti naudotojams greičiau atlikti techninius bei kainodaros sprendimus.

Sistema sujungia naudotojo sąsają, Directus duomenų bazę, DI agentus, n8n eigas, DOCX šablonų generavimą, medžiagų kainų analizę, dervų rekomendacijas ir dokumentų analizę per LlamaParse.

## Pagrindinės dalys

### Standartinė dalis

Standartinė dalis pasiekiama puslapyje `SDK`. Ji skirta standartinių gaminių komercinių pasiūlymų rengimui per DI agentą ir sugeneruotų dokumentų kaupimui.

Naudotojas bendrauja su DI agentu, pateikia reikiamus parametrus, patvirtina informaciją ir gauna komercinio pasiūlymo artefaktą. Artefaktas turi du vaizdus:

- `Duomenys` - redaguojami komercinio pasiūlymo kintamieji.
- `Peržiūra` - sugeneruoto DOCX pasiūlymo peržiūra.

Išsaugoti pasiūlymai kaupiami puslapyje `Dokumentai`, skiltyje `Standartiniai`.

### Nestandartinė dalis

Nestandartinė dalis pasiekiama puslapyje `Dokumentai`, skiltyse `Nestandartiniai` ir `Talpos`. Ji skirta nestandartinių projektų ir talpų duomenų kaupimui, paieškai, peržiūrai ir technologiniams veiksmams.

Projektų duomenys gali būti sukuriami išorinėmis n8n eigomis, pavyzdžiui, analizuojant el. paštu gautus paklausimus ir jų priedus, arba rankiniu būdu įkeliant projektą per programą. Programa saugo projekto lygmens duomenis ir atskirus talpų įrašus, kad naudotojas galėtų dirbti ne tik su visu projektu, bet ir su konkrečia talpa.

Projekto kortelėje naudotojas gali:

- peržiūrėti talpos parametrus;
- skaityti sugeneruotą aprašymą;
- rasti panašias talpas;
- peržiūrėti pokalbį, užduotis ir failus;
- gauti dervos rekomendaciją;
- pasirinkti medžiagų šabloną;
- gauti kainos įvertinimą pagal skirtingus kainų režimus.

### Administracinė dalis

Administracinė dalis apima puslapius `Instrukcijos`, `Naudotojai`, `Derva`, `Nustatymai` ir administracines `Žaliavos` funkcijas.

Administratoriai gali valdyti DI agento instrukcijas, naudotojus, dervų failus, medžiagų kainas, medžiagų šablonus, kainų analizės eigas, programos modelio nustatymą ir sistemos žurnalus.

### Dokumentų analizė

Puslapis `Analizė` skirtas didelių dokumentų įkėlimui, nuskaitymui ir struktūrizuotam duomenų ištraukimui per LlamaParse ir LlamaCloud Extract.

Dokumentas įkeliamas į Directus, siunčiamas į LlamaCloud, po apdorojimo išsaugomas tekstas, Markdown, JSON, puslapių ir vaizdų metaduomenys. Tada naudotojas gali konfigūruoti ištraukimo parametrus ir gauti struktūrizuotą rezultatą.

## Techninė architektūra

Programa yra React ir Vite pagrindu veikianti vieno puslapio aplikacija. Duomenų sluoksnis naudojamas per Directus REST API, kurio bazinis adresas yra `https://sql.traidenis.org`.

Pagrindinės integracijos:

- Directus - pagrindinė duomenų bazė, failų saugykla ir administravimo aplinka.
- Anthropic Claude - DI agento pokalbiams, standartinių pasiūlymų eigai ir kainų analizėms.
- n8n - išorinės automatizavimo eigos ir webhook integracijos.
- LlamaCloud / LlamaParse - dokumentų nuskaitymas ir struktūrizuotas ištraukimas.
- DOCX šablonų variklis - komercinių pasiūlymų generavimas pagal `{{kintamasis}}` žymas.

## Pagrindiniai duomenų srautai

### Standartinio pasiūlymo srautas

1. Naudotojas pradeda arba tęsia pokalbį puslapyje `SDK`.
2. Sistema suformuoja DI agento instrukcijas iš `chat_template` ir visų reikalingų `chat_*` kintamųjų.
3. DI agentas renka duomenis, gali naudoti sukonfigūruotus įrankius ir pateikia komercinio pasiūlymo artefaktą.
4. Naudotojas peržiūri ir, jei reikia, koreguoja duomenis.
5. Sistema sugeneruoja DOCX dokumentą pagal aktyvų šabloną.
6. Paspaudus `Išsaugoti`, dokumentas kaupiamas `Dokumentai` puslapio `Standartiniai` skiltyje.

### Nestandartinio projekto srautas

1. Projektas sukuriamas per n8n eigą arba rankinį įkėlimą.
2. Projekto informacija saugoma projektų įrašuose, o talpos - atskiruose `Talpos` įrašuose.
3. `Dokumentai` puslapis rodo projektus, talpas ir paieškos filtrus.
4. Atidarius projekto kortelę, naudotojas dirba su konkrečia projekto talpa.
5. Kortelė gali kviesti n8n webhook funkcijas aprašymo atnaujinimui, panašių talpų paieškai, dervos rekomendacijai ir kainos įvertinimui.

### Kainos įvertinimo srautas

Kainos įvertinimo funkcija projekto kortelėje turi tris režimus:

- `Dabartinė` - naudoja paskutines turimas medžiagų kainas be prognozių.
- `Matematinė` - naudoja paskutines turimas kainas, bet jei kaina yra pasenusi 3 mėnesius ar daugiau, ją pakeičia matematiniu numatymu.
- `Su DI` - naudoja DI kainų numatymą iš `Žaliavos` puslapio `Grafa` ir `Analizė` poskyrių.

Į kainos webhook siunčiamas vienas aktualus kainos įrašas kiekvienai medžiagai pagal pasirinktą režimą.

### Dervos rekomendacijos srautas

Administratorius įkelia dervų failus puslapyje `Derva` ir juos vektorizuoja. Tik vektorizuoti failai naudojami dervos rekomendacijai. Projekto kortelėje naudotojas gali iškviesti dervos parinkimą konkrečiai talpai.

### Dokumentų analizės srautas

1. Naudotojas įkelia dokumentą puslapyje `Analizė`.
2. Failas išsaugomas Directus ir siunčiamas į LlamaCloud per programos proxy.
3. Sistema laukia apdorojimo rezultato ir saugo ištrauktą turinį.
4. Naudotojas gali matyti Markdown, tekstą, JSON ir vaizdų metaduomenis.
5. Naudotojas gali paleisti struktūrizuotą Extract veiksmą su pasirinktais parametrais.

## Duomenų bazė

Pagrindiniai duomenys saugomi Directus kolekcijose. Svarbios kolekcijos:

- `app_users` - programos naudotojai ir rolės.
- `instruction_variables` - DI instrukcijų kintamieji ir programos nustatymai.
- `instruction_versions` - `chat_*` instrukcijų versijų istorija.
- `sdk_conversations` - SDK pokalbiai.
- `standartiniai_projektai` - išsaugoti standartiniai komerciniai pasiūlymai.
- `n8n_vector_store` - nestandartinių projektų įrašai.
- `Talpos` arba `talpos` - atskiri talpų įrašai.
- `products` ir kainų lentelės - medžiagos ir jų kainos.
- `medziagu_sablonai` - medžiagų šablonai.
- `derva_files` - dervų failai ir vektorizavimo būsena.
- `llamaparse_files` - įkelti ir nuskaityti dokumentai.
- `llamaparse_extractions` - struktūrizuoti dokumentų ištraukimo rezultatai.
- `application_logs` - programos žurnalai.
- `webhooks` - n8n webhook adresai.

## Teisės ir saugumas

Naudotojų funkcijos priklauso nuo jų rolės ir administratoriaus statuso. Administratoriai mato papildomus puslapius ir gali atlikti pakeitimus, kurie daro įtaką visai sistemai.

Directus aplinkoje galima keisti duomenis ir schemą tiesiogiai. Tokie veiksmai gali sugadinti programos funkcijas, todėl Directus administravimas turi būti atliekamas tik suprantant duomenų struktūrą ir programos priklausomybes.

## Versijos ir atkūrimas

Instrukcijų versijų istorija taikoma tik `chat_*` kintamiesiems. Atstatant senesnę versiją, sistema prieš tai išsaugo dabartinę būseną kaip naują versiją, kad būtų galima grįžti atgal, jei atstatymas buvo netinkamas.

Programos versija rodoma šoninėje navigacijoje. Ji naudojama kaip naudotojams matomas orientyras, kokia programos versija šiuo metu įdiegta.

## Veikimo ribos

Sistema priklauso nuo kelių išorinių paslaugų: Directus, n8n, Anthropic, LlamaCloud ir failų saugyklos. Jei viena iš šių paslaugų neveikia, atitinkama programos funkcija gali būti laikinai nepasiekiama.

Kritiniai administravimo veiksmai turi būti atliekami atsargiai: instrukcijų, tool schema, webhook adresų, duomenų bazės struktūros, medžiagų kainų ir dervų failų keitimai tiesiogiai veikia DI agento ir technologinių funkcijų rezultatus.
