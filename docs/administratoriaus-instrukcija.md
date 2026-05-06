# Administratoriaus instrukcija

## Administratoriaus atsakomybė

Administratorius valdo sistemos dalis, kurios daro įtaką visų naudotojų darbui: naudotojus, DI instrukcijas, modelio nustatymus, medžiagų kainas, dervų failus, webhook adresus, dokumentų šablonus ir Directus duomenis.

Prieš keičiant instrukcijas, tool schemas, n8n eigas ar Directus struktūrą būtina suprasti, kokiai funkcijai tas elementas naudojamas. Neatsargūs pakeitimai gali sustabdyti SDK agentą, nestandartinių projektų kortelę, kainos įvertinimą ar dokumentų generavimą.

## Naudotojų valdymas

Naudotojai valdomi puslapyje `Naudotojai`.

Administratorius gali:

- sukurti naują naudotoją;
- keisti naudotojo vardą, el. paštą, rolę ir administratoriaus statusą;
- ištrinti naudotoją;
- valdyti vadybininkų įrašus ir jų kodus.

Naudotojo rolės naudojamos programos funkcijose, pavyzdžiui, komandos pasirinkime ir komercinių pasiūlymų duomenyse.

## Instrukcijų valdymas

Puslapis `Instrukcijos` yra skirtas standartinio DI agento instrukcijoms ir susijusiems kintamiesiems valdyti.

### `chat_*` kintamieji

Instrukcijų puslapis dirba su `chat_*` pradžią turinčiais kintamaisiais. Kuriant naują kintamąjį, sistema automatiškai prideda `chat_` prefiksą.

Kiekvienas kintamasis turi:

- raktą;
- pavadinimą;
- aprašymą;
- turinį.

Aprašymas turi paaiškinti, kam kintamasis skirtas ir kaip jį saugiai redaguoti.

### `chat_template`

`chat_template` yra pagrindinis standartinio DI agento šablonas. Jis negali būti ištrinamas.

Šalia `chat_template` yra mažas veiksmo mygtukas `Įkelti visus kintamuosius`. Jis užpildo šabloną visais egzistuojančiais `chat_*` kintamaisiais. Šis veiksmas naudingas kai reikia atkurti arba greitai atnaujinti bendrą agento instrukcijų struktūrą.

### Instrukcijų versijos

Versijų istorija taikoma tik `chat_*` kintamiesiems. Ji netaikoma visai Directus lentelei ir netaikoma kitiems programos nustatymams.

Atstatymo principas:

1. Administratorius pasirenka senesnę versiją.
2. Sistema prieš atstatymą išsaugo dabartinę `chat_*` būseną kaip naują versiją.
3. Tada atkuriamas pasirinktos versijos turinys.
4. Jei atstatymas netiko, galima grįžti į prieš tai automatiškai išsaugotą versiją.

Tai leidžia bandyti pakeitimus saugiau, bet nepakeičia atsargumo poreikio.

### Schemos ir promptai

Instrukcijų puslapyje taip pat redaguojamos su įrankiais ir kainų analize susijusios reikšmės, pavyzdžiui:

- `sdk_chat_tool_schemas`;
- `kainos_ai_tool_schemas`;
- `kainos_ai_nafta_prompt`;
- `kainos_ai_geo_prompt`;
- `kainos_ai_prediction_prompt`.

Šių laukų pakeitimai gali pakeisti DI įrankių kvietimą ir analizės rezultatų formatą. Redaguoti reikia tik suprantant tool calling schemas, JSON struktūrą ir atitinkamą n8n arba programos logiką.

## DOCX šablonas

Standartinio komercinio pasiūlymo DOCX šablonas valdomas SDK komercinio pasiūlymo modulyje.

Šablone kintamieji rašomi tarp dvigubų laužtinių skliaustų:

```text
{{kintamojo_pavadinimas}}
```

Pavyzdžiai:

```text
{{siandienos_data}}
{{technologo_vardas}}
{{requested_HNV}}
{{MIDI_komplektacija_SIR_kaina}}
```

Sistema sugeneruotus duomenis įrašo į šias vietas. Jei į DOCX šabloną pridedamas naujas kintamasis, jo reikšmė ir užpildymo logika turi atsispindėti DI agento instrukcijose.

## Žaliavų administravimas

Puslapis `Žaliavos` turi kelias administracines dalis.

### Kainų lentelė

Čia administruojamos medžiagos ir jų kainų istorija. Galima:

- importuoti Excel failą;
- pridėti naują medžiagą;
- pridėti naują kainą;
- redaguoti arba trinti kainų įrašus.

Šie duomenys naudojami grafose ir kainos įvertinimo funkcijoje projekto kortelėje.

### Medžiagų šablonai

Medžiagų šablonai yra tekstiniai medžiagų sąrašai, naudojami nestandartinių projektų kortelėje. Šablonai naudojami ne kaip struktūrizuota n8n išvestis, o kaip žali tekstiniai duomenys.

Svarbu, kad talpos pavadinimai ir tūriai būtų rašomi nuosekliai, nes naudotojai filtruoja šablonus pagal talpą.

### Grafa

`Grafa` rodo medžiagų kainų istoriją ir numatymus:

- matematinį numatymą pagal kainų istoriją;
- DI numatymą pagal kainų analizės rezultatą.

Ši informacija naudojama `Matematinė` ir `Su DI` kainos įvertinimo režimuose projekto kortelėje.

### Analizė

`Analizė` poskyryje yra trijų dalių kainų analizės eiga:

1. `Naftos analizė`;
2. `Geopolitika`;
3. `Kainų prognozė`.

Jei atnaujinama pirma arba antra analizė, reikia atnaujinti ir trečiąją `Kainų prognozė` analizę. Trečios analizės rezultatas naudojamas DI kainų prognozėms ir `Su DI` kainos įvertinimui.

## Kainos įvertinimo režimai

Nestandartinio projekto kortelėje yra trys kainos įvertinimo režimai:

- `Dabartinė` - siunčia paskutines turimas medžiagų kainas.
- `Matematinė` - siunčia vieną kainą kiekvienai medžiagai; jei paskutinė kaina senesnė nei 3 mėnesiai, ji pakeičiama matematiniu numatymu.
- `Su DI` - siunčia DI numatytas kainas, kurios naudojamos grafoje.

Kiekvienas režimas turi atskirą atsakymo būseną, kad naudotojas galėtų matyti skirtingus įvertinimus ir suprasti, kokiu pagrindu jie sugeneruoti.

## Dervos failai

Puslapis `Derva` skirtas dervų rekomendacijų failams valdyti.

Administratorius gali:

- įkelti dervų dokumentus;
- peržiūrėti failus;
- paleisti vektorizavimą;
- matyti vektorizavimo būseną;
- trinti failus.

Tik vektorizuoti failai naudojami dervos rekomendacijai projekto kortelėje. Įkeltas, bet nevektorizuotas failas rekomendacijos logikoje nedalyvauja.

## Webhook valdymas

Webhook adresai saugomi Directus `webhooks` kolekcijoje. Programa juos kviečia pagal `webhook_key`.

Svarbūs webhook raktai:

- `n8n_get_products`;
- `n8n_get_prices`;
- `n8n_get_multiplier`;
- `n8n_similar_tanks`;
- `n8n_update_talpos_description`;
- `n8n_price_estimation`;
- `n8n_derva_select`;
- `ndk_manual_upload`.

Jei webhook neaktyvus arba jo nėra kolekcijoje, atitinkama funkcija programoje neveiks. Keičiant webhook adresą reikia įsitikinti, kad n8n eiga priima tokį patį užklausos formatą, kokį siunčia programa.

## Nustatymai ir DI modelis

Programos naudojamas Claude modelis valdomas `Nustatymai` lange. Reikšmė saugoma `instruction_variables` kolekcijoje su raktu `app_claude_model`.

Numatytoji reikšmė:

```text
claude-sonnet-4-20250514
```

Šį modelį naudoja SDK agentas ir kainų analizės srautai. Keičiant modelį reikia naudoti tik validų Anthropic API modelio pavadinimą.

## Programos žurnalai

`Nustatymai` lange galima peržiūrėti programos žurnalus. Žurnalai saugomi `application_logs` kolekcijoje.

Žurnalai naudingi kai reikia tirti:

- prisijungimo klaidas;
- DI agento klaidas;
- dokumentų generavimo klaidas;
- webhook klaidas;
- Directus užklausų klaidas;
- naudotojų valdymo veiksmus.

## LlamaParse ir dokumentų analizė

Dokumentų analizės funkcija naudoja Directus, LlamaCloud LlamaParse ir LlamaCloud Extract. Naudotojo sąsajoje ši dalis vadinama `Dokumentų analizė`.

Pagrindinės kolekcijos:

- `llamaparse_files` - įkelti dokumentai, jų parse būsena ir rezultatai.
- `llamaparse_extractions` - struktūrizuoto ištraukimo rezultatai.

Svarbūs principai:

- Dokumentas pirmiausia įkeliamas į Directus failų saugyklą.
- `llamaparse_files.original_file` saugo nuorodą į originalų Directus failą. Programos tipuose taip pat naudojamas `original_file_id`, kad peržiūra veiktų ir tada, kai Directus grąžina tik ID.
- Tada failas siunčiamas į LlamaCloud per programos proxy.
- Parse rezultatas saugomas atgal į `llamaparse_files`: Markdown, tekstas, JSON, puslapių skaičius, vaizdų metaduomenys, parse lygis ir naudotojo instrukcija.
- Extract rezultatai saugomi `llamaparse_extractions`: job ID, būsena, konfigūracija, rezultatas, metaduomenys ir klaidos tekstas.

Jei LlamaCloud grąžina timeout arba pending būseną, tai nebūtinai reiškia klaidą. Dideli dokumentai gali būti apdorojami ilgiau.

### Analizė puslapio UI ir nustatymai

Kairėje pusėje istorija kraunama automatiškai pagal prisijungusį naudotoją. Atskiro istorijos mygtuko nėra. Paieška filtruoja jau įkeltus dokumentus. Aktyvus įrašas pažymimas kairiu mėlynu akcentu.

`Įkelti naują` yra kompaktiškas įkėlimo veiksmas. Po failo pasirinkimo programa:

1. įkelia originalų failą į Directus;
2. sukuria `llamaparse_files` įrašą;
3. įsimena pasirinktą dokumentą ir originalaus failo ID naršyklės `localStorage`;
4. parodo failo peržiūrą ir paruošimo būseną.

Apdorojimo lygiai:

- `Ekonomiškas` - `cost_effective`.
- `Agentinis` - `agentic`.
- `Agentinis+` - `agentic_plus`.
- `Greitas` - `fast`.

Extract konfigūracija:

- `Tikslus` - `agentic`.
- `Ekonomiškas` - `cost_effective`.
- `Visas dokumentas` - `per_doc`.
- `Kiekvienas puslapis` - `per_page`.
- `Lentelės eilutės` - `per_table_row`.

Rezultato struktūros režimai:

- `Automatiškai` sukuria schemą pagal naudotojo klausimą.
- `Įvesti` leidžia nurodyti laukų pavadinimus, tipus ir aprašymus.
- `JSON` leidžia įvesti pilną JSON schema objektą.

Papildomi nustatymai perduodami į LlamaCloud Extract konfigūraciją: citatos, patikimumo balai, puslapių rėžiai, maksimalus puslapių skaičius, Extract versija, parse config ID ir papildomas system prompt.

### Peržiūros veikimo principas

Dokumento peržiūra remiasi originaliu Directus failu, o ne LlamaCloud rezultatu. Programa pirmiausia ieško `original_file_id`, tada `original_file.id`, tada naršyklėje įsiminto failo ID. Tai padaryta tam, kad peržiūra išliktų veikianti grįžus iš istorijos, po Extract rezultato arba po puslapio perkrovimo.

PDF ir biuro dokumentai peržiūrai siunčiami į įterptą Google Docs Viewer URL, o vaizdai ir tekstiniai failai rodomi tiesiogiai iš Directus asset URL. Jei peržiūra neveikia, pirmiausia reikia tikrinti:

- ar `original_file` yra užpildytas Directus įraše;
- ar Directus failas pasiekiamas su naudojamu access token;
- ar failo MIME tipas arba plėtinys patenka į palaikomus tipus;
- ar naršyklė neužblokavo išorinio įterpto viewer.

### Diff skaitytojui: ką reiškia pagrindiniai kodo segmentai

`src/types/index.ts`:

- `ParsedDocument.original_file_id` pridėtas tam, kad UI turėtų stabilų failo ID net tada, kai Directus relacija negrąžinama kaip pilnas objektas.

`src/lib/analizeService.ts`:

- `normalizeFile` suvienodina Directus atsakymą ir ištraukia originalaus failo ID.
- `toFileInsert` ir `toFileUpdate` mapina UI laukus į Directus laukus, pavyzdžiui `parse_tier`, `parse_job_id`, `parse_user_prompt`.
- `fetchParsedDocuments` ir `getParsedDocument` parsiunčia dokumentus su originalaus failo metaduomenimis.

`src/components/AnalizeInterface.tsx`:

- parse žingsniai (`PARSE_STEPS`) valdo kairėje rodomą dokumento paruošimo būseną.
- `PREVIEW_FILE_CACHE_KEY` ir `SELECTED_DOCUMENT_CACHE_KEY` saugo peržiūros failą ir paskutinį pasirinktą dokumentą naršyklėje.
- `getOriginalFileId`, `rememberPreviewFileId` ir `getRememberedPreviewFileId` sudaro peržiūros atsarginį kelią.
- `handleFileSelect` iš karto įkelia failą į Directus, sukuria istorijos įrašą ir paruošia peržiūrą.
- `handleRunExtract` sudaro Extract konfigūraciją iš UI pasirinkimų ir paleidžia LlamaCloud Extract.
- `resultToPlainText` naudojamas `Markdown` rezultatų skaitomai versijai.
- `resultToRawText` naudojamas `Tekstas` rezultatų versijai: jis pradeda nuo JSON atsakymo, pašalina JSON ir Markdown ženklus ir rodo likusį tekstą.
- rezultato formatų juosta (`Markdown`, `Tekstas`, `JSON`, `Vaizdai`) naudoja paprastą pabraukimą aktyviam formatui, be kapsulinių kortelių.

## Directus administravimas

Directus yra pagrindinis sistemos duomenų sluoksnis. Jis pasiekiamas adresu `https://sql.traidenis.org`.

Directus galima:

- peržiūrėti ir koreguoti įrašus;
- valdyti failus;
- keisti kolekcijų laukus;
- valdyti webhook adresus;
- tikrinti LlamaParse, dervų, instrukcijų ir dokumentų duomenis.

Tiesioginis kolekcijų struktūros keitimas yra rizikingas. Pakeitus laukų pavadinimus, tipus arba pašalinus laukus, programa gali pradėti rodyti klaidas arba visiškai neveikti.

## n8n eigos

n8n naudojamas automatizavimui ir išorinėms DI eigoms. Programoje n8n dažniausiai kviečiamas per webhook.

Tipinės n8n atsakomybės:

- nestandartinių paklausimų analizė;
- rankinio projekto įkėlimo apdorojimas;
- panašių talpų paieška;
- dervos parinkimas;
- talpos aprašymo atnaujinimas;
- kainos įvertinimas;
- SDK įrankių užklausos į vidinius duomenis.

Keičiant n8n eigą reikia tikrinti ne tik pačią eigą, bet ir programos siunčiamą payload formatą bei laukus, kuriuos programa tikisi gauti atgal.

## Rekomenduojama administravimo praktika

- Prieš keičiant instrukcijas, sukurkite versiją arba įsitikinkite, kad naujausia versija išsaugota.
- Nekeiskite `chat_template` neįsitikinę, kad visi reikalingi `chat_*` kintamieji yra šablone.
- Po kainų analizės pakeitimų patikrinkite `Grafa` ir projekto kortelės `Su DI` kainos režimą.
- Po dervų failų įkėlimo visada patikrinkite vektorizavimo būseną.
- Po webhook pakeitimų atlikite realų funkcijos testą programoje.
- Directus struktūros nekeiskite be aiškaus plano ir atsarginio atkūrimo kelio.
- Jei keičiate Claude modelį, patikrinkite SDK pokalbį ir kainų analizę.
