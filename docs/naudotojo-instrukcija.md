# Naudotojo instrukcija

## Prisijungimas

Programa pasiekiama adresu `https://app.traidenis.org`. Prisijungimui naudojamas el. paštas ir slaptažodis. Matomi puslapiai ir funkcijos priklauso nuo naudotojui suteiktų teisių.

Pagrindiniai puslapiai:

- `SDK` - standartinių komercinių pasiūlymų rengimas su DI agentu.
- `Dokumentai` - standartinių ir nestandartinių projektų dokumentai bei talpos.
- `Analizė` - dokumentų nuskaitymas ir duomenų ištraukimas.
- `Žaliavos` - medžiagų kainų, šablonų, grafų ir analizės peržiūra.
- `Nustatymai` - paskyros informacija ir bendri nustatymai.

## SDK puslapis

SDK puslapis skirtas standartinių gaminių komerciniams pasiūlymams rengti.

### Naujas pasiūlymas

1. Atidarykite `SDK` puslapį.
2. Pradėkite naują pokalbį arba tęskite esamą.
3. Atsakykite į DI agento klausimus.
4. Patikrinkite agento surinktus duomenis.
5. Kai atsiranda komercinio pasiūlymo langas, peržiūrėkite `Duomenys` ir `Peržiūra` skiltis.
6. Jei reikia, pakoreguokite kintamuosius `Duomenys` skiltyje.
7. Paspauskite `Išsaugoti`, kad dokumentas būtų išsaugotas sistemoje.

DI agentas veikia pagal sistemos instrukcijas. Jei agentas prašo papildomų duomenų, juos reikia pateikti pokalbyje.

### Komercinio pasiūlymo peržiūra

Komercinio pasiūlymo modulyje yra dvi pagrindinės skiltys:

- `Duomenys` - sugeneruoti ir redaguojami dokumento kintamieji.
- `Peržiūra` - galutinio DOCX dokumento vaizdas.

Jei dokumente matote neteisingą informaciją, pirmiausia pakoreguokite ją `Duomenys` skiltyje.

### Pokalbių istorija

SDK pokalbiai saugomi sistemoje. Pokalbiai gali būti tęsiami vėliau. Jei pokalbis bendrinamas su kitu naudotoju, jis matomas bendrų pokalbių skiltyje.

## Dokumentai

Puslapis `Dokumentai` turi tris pagrindines darbo zonas: `Standartiniai`, `Nestandartiniai` ir `Talpos`.

### Standartiniai

Šioje skiltyje saugomi per SDK sukurtų komercinių pasiūlymų įrašai.

Galimi veiksmai:

- ieškoti pagal projekto kodą, HNV ar kitą matomą informaciją;
- peržiūrėti dokumentą;
- atsisiųsti susietą failą.

### Nestandartiniai

Šioje skiltyje rodomi nestandartiniai projektai. Kiekvienas projektas gali turėti vieną arba kelias talpas.

Lentelėje galima matyti projekto informaciją, klientą, datą, santrauką, talpų kiekį ir talpų tūrius. Atidarius projektą, rodoma projekto kortelė.

Paieška nestandartiniuose projektuose gali būti atliekama pagal pasirinktą parametrą iš talpos JSON duomenų. Pirma pasirenkamas parametras, tada pasirenkama viena iš realiai egzistuojančių reikšmių.

### Talpos

Šioje skiltyje rodomi atskiri talpų įrašai. Tai leidžia greitai rasti konkrečią talpą nepriklausomai nuo projekto.

## Nestandartinio projekto kortelė

Projekto kortelė yra pagrindinė darbo vieta su nestandartiniu projektu.

### Talpos pasirinkimas

Jei projektas turi kelias talpas, viršuje galima pasirinkti konkrečią talpą. Pasirinkta talpa lemia, kokie parametrai, pokalbiai, failai, medžiagos ir rekomendacijos rodomi kortelėje.

### Parametrai

`Parametrai` skiltyje matomi techniniai talpos duomenys. Aprašymas rodomas atskirame bloke virš `Panašios talpos`, kad būtų galima greitai suprasti pasirinktą talpą.

Galimi veiksmai:

- atnaujinti aprašymą;
- rasti panašias talpas;
- atidaryti panašią talpą;
- peržiūrėti kainas ir techninius laukus.

Aprašymo atnaujinimas naudoja projekto ir talpos kontekstą: pokalbius, failus, pasirinktą dervą, medžiagų šabloną ir talpos metaduomenis.

### Derva

`Derva` skiltyje galima gauti DI rekomendaciją dėl dervos. Rekomendacija remiasi sistemoje vektorizuotais dervų failais ir talpos parametrais.

Naudotojas gali:

- paleisti dervos parinkimą;
- priimti rekomendaciją;
- pasirinkti arba redaguoti naudojamą dervą.

### Medžiagos

`Medžiagos` skiltyje pasirenkamas medžiagų šablonas arba įvedamas medžiagų sąrašas rankiniu būdu. Šablonų paieškoje galima filtruoti pagal talpą, įvedant skaičių.

Kainos įvertinimas turi tris režimus:

- `Dabartinė` - naudojamos paskutinės turimos medžiagų kainos.
- `Matematinė` - jei paskutinė kaina pasenusi 3 mėnesius ar daugiau, naudojamas matematinis kainos numatymas.
- `Su DI` - naudojamas DI kainų numatymas iš `Žaliavos` grafos ir analizės.

Kiekvienas režimas turi savo atsakymo lauką. Prie atsakymo rodoma žyma, pagal kokį režimą įvertinimas buvo gautas.

### Pokalbis

`Pokalbis` skiltyje rodomos žinutės, susietos su pasirinkta talpa. Jei projekte yra kelios talpos, pakeitus talpą keičiasi ir rodomas pokalbis.

### Užduotys

`Užduotys` skiltyje galima matyti ir formuoti su projektu ar talpa susijusias užduotis.

### Failai

`Failai` skiltyje galima peržiūrėti ir įkelti su projektu susijusius failus. Failai naudojami kaip kontekstas kai kurioms DI funkcijoms.

## Žaliavos

`Žaliavos` puslapis skirtas medžiagų kainoms, šablonams, grafams ir kainų analizei.

### Kainų lentelė

Čia matomos medžiagos ir jų kainų istorija. Pagal turimas teises galima įvesti naujas kainas, naujas medžiagas ar importuoti Excel failą.

### Medžiagų šablonai

Šioje skiltyje rodomi medžiagų šablonai, kurie gali būti naudojami projekto kortelės `Medžiagos` skiltyje. Šablonai grupuojami pagal talpą ir naudojami kaip tekstiniai medžiagų sąrašai.

### Grafa

`Grafa` skiltyje galima peržiūrėti medžiagų kainų istoriją ir numatomas kainas. Galima perjungti matematinį numatymą ir DI numatymą.

### Analizė

`Analizė` skiltyje yra trys kainų analizės dalys:

- `Naftos analizė`;
- `Geopolitika`;
- `Kainų prognozė`.

Jei atnaujinate pirmą arba antrą analizę, rekomenduojama atnaujinti ir trečiąją `Kainų prognozė` analizę, nes ji naudojama `Su DI` kainos įvertinimo režime.

## Analizė puslapis

`Analizė` puslapis skirtas dokumentų nuskaitymui ir duomenų ištraukimui.

### Dokumento įkėlimas

1. Įkelkite dokumentą kairėje pusėje.
2. Palaukite, kol sistema jį apdoros.
3. Peržiūrėkite rezultatą `Markdown`, `Tekstas`, `JSON` arba `Vaizdai` skiltyse.
4. Jei reikia, dešinėje pusėje sukonfigūruokite struktūrizuotą duomenų ištraukimą.
5. Paleiskite ištraukimą ir peržiūrėkite rezultatą.

`Istorija` mygtukas leidžia atidaryti anksčiau apdorotus dokumentus, jei tokių yra.

## Nustatymai

`Nustatymai` lange matoma paskyros informacija. Pagal suteiktas teises gali būti matomi papildomi programos nustatymai.

## Gero naudojimo taisyklės

- Prieš išsaugodami komercinį pasiūlymą, patikrinkite `Duomenys` ir `Peržiūra` skiltis.
- Nestandartinėje kortelėje visada įsitikinkite, kad pasirinkta teisinga talpa.
- Jei naudojate kainos įvertinimą, atkreipkite dėmesį į pasirinktą režimą.
- Jei DI atsakymas atrodo netikslus, patikrinkite, ar yra pakankamai failų, parametrų ir konteksto.
- Jei funkcija grąžina klaidą, pakartokite veiksmą ir, jei klaida kartojasi, perduokite klaidos tekstą administratoriui.
