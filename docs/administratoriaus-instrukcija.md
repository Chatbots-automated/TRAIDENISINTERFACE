# Administratoriaus instrukcija

Ši instrukcija aprašo tik administratoriui skirtus veiksmus. Bendri naudotojo veiksmai, kasdienis puslapių naudojimas ir įprasti darbo scenarijai aprašomi naudotojo instrukcijoje.

## Administratoriaus ribos

Administratorius gali keisti sistemos dalis, kurios daro įtaką kitiems naudotojams:

- kurti, redaguoti ir trinti naudotojus;
- suteikti arba nuimti administratoriaus teises;
- valdyti vadybininkų įrašus;
- redaguoti ne tik `chat_*`, bet ir kitus sistemos kintamuosius;
- redaguoti JSON įrankių schemas;
- matyti programos žurnalus;
- trinti projektų, lentelių, šablonų ir failų įrašus ten, kur sąsaja tai leidžia;
- valdyti kainų lentelę, medžiagų šablonus, dervos failus ir dokumentų analizės generavimo veiksmus.

Ne administratoriams šie veiksmai turi būti paslėpti arba neprieinami. Jeigu mygtukas matomas paprastam naudotojui, bet veiksmas atmetamas tik po paspaudimo, tai laikoma nepakankamai aiškia naudotojo patirtimi.

## Naudotojai

Puslapyje `Naudotojai` administratorius gali:

- sukurti naują naudotoją;
- keisti naudotojo vardą, el. paštą, rolę ir administratoriaus statusą;
- ištrinti naudotoją;
- valdyti vadybininkus: pridėti, redaguoti ir trinti jų įrašus.

Administratoriaus teisę kitiems naudotojams gali suteikti tik administratorius. Paprastas naudotojas negali priskirti administratoriaus rolės nei naujam, nei jau egzistuojančiam naudotojui.

Paprastas naudotojas taip pat neturi redaguoti kitų naudotojų duomenų. Išimtis yra vadybininkų valdymas, jeigu konkrečioje aplinkoje tam palikta teisė.

## Instrukcijos ir kintamieji

Administratorius gali redaguoti visas instrukcijų ir nustatymų reikšmes, įskaitant tas, kurios nėra `chat_*` formato.

`chat_*` kintamieji yra skirti pokalbio instrukcijoms ir gali būti atrakinami redagavimui pagal sąsajos taisykles. Kiti kintamieji yra administraciniai: jie gali keisti įrankių veikimą, rodymo taisykles, numatytus pasirinkimus ir kitas sistemos dalis.

Redaguojant kintamuosius svarbu:

- nekeisti rakto pavadinimo, jeigu nežinoma, kur jis naudojamas;
- aprašyme aiškiai įvardyti, kam kintamasis skirtas;
- vienu metu keisti vieną logišką dalį;
- po pakeitimo patikrinti puslapį, kuriame reikšmė naudojama.

## JSON įrankių schemos

JSON įrankių schemas gali matyti ir redaguoti tik administratoriai. Paprastam naudotojui jos neturi būti atvaizduojamos.

Schema aprašo, kokį įrankį sistema gali naudoti ir kokius laukus tas įrankis priima. Keičiant schemą administratorius faktiškai keičia tai, ką sistema gali paprašyti įvykdyti.

Dažniausi schemos elementai:

- `name` - stabilus techninis įrankio pavadinimas;
- `description` - aiškus aprašymas, kada įrankį naudoti;
- `input_schema` - laukų struktūra;
- `properties` - leidžiami argumentai;
- `required` - privalomi argumentai;
- `type` - lauko tipas, pvz. `string`, `number`, `boolean`, `array`, `object`;
- `enum` - ribotas leidžiamų reikšmių sąrašas.

Gera schema turi būti siaura ir aiški. Jei įrankis turi atlikti vieną veiksmą, nereikia į vieną schemą sudėti kelių skirtingų veiksmų. Geriau turėti kelis mažesnius įrankius nei vieną dviprasmišką.

## Schemų pakeitimų peržiūra

Peržiūrint schemos pakeitimą svarbiausia tikrinti ne tik tekstą, bet ir elgesio pasekmes:

- ar nepasikeitė `name`, nuo kurio priklauso įrankio atpažinimas;
- ar nebuvo pašalintas laukas, kurį sistema vis dar siunčia;
- ar naujas `required` laukas tikrai visada gali būti užpildytas;
- ar `enum` reikšmės sutampa su sąsajos pasirinkimais;
- ar tipas atitinka realią reikšmę, pvz. skaičius nėra siunčiamas kaip tekstas be priežasties;
- ar aprašymas neleidžia interpretuoti įrankio per plačiai;
- ar JSON yra validus ir neturi komentarų, kabučių klaidų ar perteklinių kablelių.

Saugus darbo principas: pakeisti vieną schemos dalį, išsaugoti, patikrinti susijusią funkciją, tik tada keisti kitą dalį.

## Schemų šablonai ir raštai

Administratoriai dažniausiai dirba su keliais schemų raštais:

- `Objektas` - kai rezultatas turi turėti konkrečius laukus, pvz. `pavadinimas`, `suma`, `pastabos`.
- `Sąrašas` - kai reikia grąžinti kelias vienodo tipo reikšmes, pvz. punktus arba eilutes.
- `Ribotas pasirinkimas` - kai reikšmė turi būti tik iš leidžiamo sąrašo.
- `Laisvas tekstas` - kai svarbiausias yra paaiškinimas, o ne griežta struktūra.
- `Mišri schema` - kai atsakymas turi turėti ir santrauką, ir struktūruotus laukus.

Jei laukas naudojamas tolimesniam skaičiavimui, jo pavadinimas turi būti stabilus. Jei laukas skirtas tik žmogui skaityti, aprašymas gali būti lankstesnis.

## Projektų kortelės

Administratoriui projektų kortelėje gali būti rodomi papildomi veiksmai:

- projekto trynimas;
- įrašų koregavimas;
- papildomi diagnostiniai arba administraciniai mygtukai, jei tokie įjungti.

Paprastam naudotojui projekto trynimo mygtukas neturi būti rodomas.

## Lentelės

`Nestandartiniai` ir `Standartiniai` lentelėse administratorius gali naudoti įrašo lygio veiksmus, įskaitant pasirinkimą ir trynimą, jeigu konkreti lentelė tai palaiko.

Paprastam naudotojui šiose lentelėse neturi būti:

- eilučių pasirinkimo administraciniams veiksmams;
- trynimo veiksmų;
- masinių veiksmų, kurie keičia kitų naudotojų ar bendrus duomenis.

## Žaliavos

Puslapio `Žaliavos` administracinės teisės apima:

- kainų lentelės įrašų pridėjimą;
- kainų įrašų redagavimą;
- kainų įrašų trynimą;
- kainų importą, jei sąsaja jį rodo;
- medžiagų šablonų kūrimą;
- medžiagų šablonų redagavimą;
- medžiagų šablonų trynimą;
- analizės generavimo veiksmus.

Paprastam naudotojui kainų lentelė ir šablonai turi būti tik peržiūrai. Mygtukas `Naujas šablonas` paprastam naudotojui neturi būti rodomas.

## Derva

Puslapyje `Derva` administratorius gali:

- įkelti failus;
- trinti failus;
- paleisti paruošimo veiksmus, jei tokie rodomi;
- peržiūrėti būsenas ir klaidas.

Paprastam naudotojui ši dalis turi būti tik peržiūrai: be įkėlimo, trynimo ir paruošimo veiksmų.

## Dokumentų analizė

Puslapyje `Analizė` administratorius gali atlikti veiksmus, kurie keičia analizės eigą arba sukuria naują rezultatą:

- įkelti dokumentą;
- pasirinkti dokumento paruošimo lygį;
- paleisti dokumento paruošimą;
- įrašyti analizės instrukcijas;
- pasirinkti analizės apimtį;
- pasirinkti rezultato schemos režimą;
- redaguoti rankinius laukus;
- įvesti JSON schemą;
- keisti papildomus analizės parametrus;
- paleisti analizavimą;
- peržiūrėti rezultatą skirtingais formatais.

Paprastam naudotojui mygtukai `Analizuoti` arba `Generuoti` neturi būti rodomi, jeigu analizės generavimas leidžiamas tik administratoriams.

### Analizės apimtis

Analizės apimtis nusako, kuriai dokumento daliai taikomas klausimas:

- `Dokumentas` - vienas atsakymas visam dokumentui;
- `Puslapiai` - atsakymas pagal puslapius;
- `Lentelės eilutės` - atsakymas pagal lentelės tipo struktūras.

Apimtis turi atitikti klausimo pobūdį. Jei klausiama bendros santraukos, dažniausiai tinka visas dokumentas. Jei reikia eilučių ar pasikartojančių objektų, geriau rinktis siauresnę apimtį.

### Rezultato schema

Rezultato schema nusako, kokia forma turi būti grąžintas atsakymas:

- `Automatiškai` - sistema pati parenka laukus pagal instrukcijas;
- `Įvesti` - administratorius rankomis nurodo laukus, tipus ir aprašymus;
- `JSON` - administratorius įveda pilną schemą.

Rankiniai laukai tinka tada, kai rezultatas turi būti stabilus ir lengvai palyginamas. JSON režimas skirtas sudėtingesnėms schemoms, bet jame lengviausia padaryti sintaksės klaidą, todėl po pakeitimo būtina testuoti.

### Papildomi parametrai

Papildomuose parametruose administratorius gali valdyti:

- tikslumo režimą;
- puslapių ribas;
- maksimalų puslapių kiekį;
- citatų grąžinimą;
- patikimumo reikšmes;
- papildomas sistemos instrukcijas;
- schemos peržiūrą.

Šie parametrai turi būti keičiami tik tada, kai yra aišku, kokio rezultato reikia. Jei atsakymai tampa nestabilūs, pirmiausia reikia supaprastinti instrukciją arba schemą.

## Programos žurnalai

Programos žurnalai skirti administratoriui. Paprastam naudotojui žurnalų prieiga neturi būti rodoma.

Žurnalai padeda tikrinti:

- prisijungimo ir teisių klaidas;
- naudotojų valdymo veiksmus;
- duomenų įrašymo klaidas;
- analizės klaidas;
- lentelių ir failų veiksmų klaidas.

Žurnalų įrašai turėtų būti naudojami problemos priežasčiai nustatyti, o ne kaip nuolatinė naudotojo sąsajos dalis.

## Directus API

Directus API yra dinaminė: kolekcijos ir jų laukai apibrėžia, kokie endpointai ir kokie duomenų laukai yra prieinami.

Bendras principas:

- kolekcija tampa endpointu formatu `/items/{kolekcijos_pavadinimas}`;
- įrašo skaitymas, kūrimas, keitimas ir trynimas priklauso nuo rolės teisių;
- laukai, kuriuos sukuriate kolekcijoje, tampa užklausos ir atsakymo dalimi;
- jei laukas neegzistuoja arba rolei neleidžiamas, jo negalima patikimai naudoti programoje.

Dažniausi metodai:

- `GET /items/kolekcija` - gauti sąrašą;
- `GET /items/kolekcija/id` - gauti vieną įrašą;
- `POST /items/kolekcija` - sukurti įrašą;
- `PATCH /items/kolekcija/id` - pakeisti įrašą;
- `DELETE /items/kolekcija/id` - ištrinti įrašą.

Naudingi užklausų parametrai:

- `fields` - kokius laukus grąžinti;
- `filter` - kaip filtruoti sąrašą;
- `sort` - kaip rikiuoti;
- `limit` - kiek įrašų grąžinti;
- `page` - kurį puslapį grąžinti.

Failams dažniausiai naudojami atskiri failų ir failų peržiūros endpointai. Jei sąsaja turi rodyti failą, turi būti aišku, kuriame įrašo lauke saugomas failo ID ir ar naudotojo rolė turi teisę tą failą skaityti.

## Naujo API ryšio paruošimas

Bandant prijungti naują sąsajos dalį prie Directus API, administratorius turėtų eiti tokia tvarka:

1. Sukurti arba patikrinti kolekciją.
2. Sukurti laukus su aiškiais tipais.
3. Patikrinti rolės teises skaitymui ir rašymui.
4. Su minimaliu `GET` patikrinti, ar endpointas pasiekiamas.
5. Su minimaliu `POST` arba `PATCH` patikrinti, ar rašymas veikia.
6. Tik tada jungti lauką į sąsają.
7. Po pakeitimo patikrinti žurnalus ir realų puslapio veikimą.

Jei gaunama `403` klaida, pirmiausia tikrinamas endpointas, kolekcijos pavadinimas, įrašo ID, lauko teisės ir rolės leidimai. Raktas ar prisijungimas ne visada yra priežastis.

## Saugus administravimas

Prieš keičiant administracinius duomenis verta laikytis kelių taisyklių:

- nekeisti kelių schemų vienu metu;
- netrinti laukų, kol nežinoma, kur jie naudojami;
- prieš pervadinant lauką patikrinti, ar sąsaja nenaudoja seno pavadinimo;
- sudėtingas JSON schemas pirmiausia validuoti;
- po kiekvieno reikšmingo pakeitimo atlikti realų veiksmą sąsajoje;
- klaidos atveju tikrinti ne tik tekstą ekrane, bet ir žurnalus.

Administratoriaus darbas yra ne tik turėti daugiau mygtukų, bet ir užtikrinti, kad kiti naudotojai matytų tik jiems saugius bei suprantamus veiksmus.
