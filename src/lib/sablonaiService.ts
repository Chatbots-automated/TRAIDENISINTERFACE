// Database: Directus API (see ./database.ts). NOT Supabase.
// Table: medziagu_sablonai — material slate templates (plain text + structured JSON)

import { db } from './database';
import { getWebhookUrl } from './webhooksService';

// ---------------------------------------------------------------------------
// LLM System Prompt — for the n8n webhook that converts plain text → JSON
// ---------------------------------------------------------------------------

export const MATERIAL_SLATE_SYSTEM_PROMPT = `Tu esi FRP/GRP (stiklaplasčio) talpų gamybos medžiagų sąnaudų struktūrizavimo sistema.

UŽDUOTIS: Gauni nestruktūrizuotą lietuvišką tekstą apie talpų gamybos medžiagų sąnaudas. Turi jį paversti griežtai apibrėžtu JSON formatu. Grąžink TIK validų JSON — jokio papildomo teksto, paaiškinimų ar markdown.

## JSON SCHEMA

{
  "product": {
    "type": "string",                    // Produkto tipas: "PGR", "TP" ir pan.
    "volume_m3": number,                 // Tūris kubiniais metrais
    "full_name": "string"                // Pilnas pavadinimas pvz. "PGR V-230 m3"
  },
  "body": {
    "diameter_dn_mm": number,            // Skersmuo milimetrais, pvz. DN3600 → 3600
    "length_mm": number,                 // Ilgis milimetrais, pvz. L19000 → 19000
    "installation_depth_m": number|null,  // Įgilinimas metrais, pvz. "įg. 1,2 m" → 1.2
    "terrain": "string"|null             // "žalia veja", "važiuojama dalis" ir pan.
  },
  "wrapped_section": {
    "winding_count": number,             // Vyniojimų skaičius
    "description": "string",             // Pilnas aprašymas, pvz. "2 vyniojimai, abu su pratempimais"
    "materials": [
      {
        "name": "string",               // Medžiagos pavadinimas
        "amount_kg": number,             // Pagrindinis kiekis kg
        "extra_kg": number|null,         // Papildomas sustiprinimo kiekis (pvz. +400 dėl važiuojamos dalies)
        "scope": "string"|null,          // "korpusas", "briaunos" ir pan.
        "price_note": "string"|null      // Kainos pastaba, pvz. "1kg/3,3eur"
      }
    ]
  },
  "ribs": {                              // null jei briaunos nepaminėtos
    "count": number,                     // Briaunų skaičius
    "description": "string"|null,        // pvz. "standumo briaunos"
    "materials": [
      { "name": "string", "amount_kg": number, "scope": "string"|null }
    ]
  },
  "ends": {
    "weight_per_end_kg": number,         // Svoris vienam galui
    "extra_per_end_kg": number|null,     // Papildomas sustiprinimo svoris (pvz. +40+40 → 80)
    "from_cutout": false,                // true tik kai nurodyta "iš išpjovos"
    "materials": [                       // null jei galai nėra detalizuoti
      { "name": "string", "amount_kg": number }
    ]
  },
  "seam_lamination": {
    "scope": "string",                   // Dažniausiai "visos"
    "outer": {                           // null jei nedetalizuota
      "width_mm": "string",             // pvz. "450-500"
      "layers": "string"                // pvz. "13-14sl"
    },
    "inner": {                           // null jei nedetalizuota
      "width_mm": "string",
      "layers": "string"
    },
    "materials": [
      { "name": "string", "amount_kg": number }
    ]
  },
  "total_estimate": {
    "weight_kg": number,                 // Apytikris bendras svoris kilogramais
    "approximate": true,                 // Beveik visada true
    "note": "string"                     // Originalus tekstas, pvz. "apie +-8500-8600kg"
  },
  "notes": ["string"],                   // Visos papildomos pastabos, įspėjimai, komentarai
  "delivery_date": "string"|null         // ISO formatu "YYYY-MM-DD" jei paminėta data
}

## TAISYKLĖS

1. Grąžink TIK JSON objektą. Jokio markdown, jokių paaiškinimų.
2. Jei laukas nepaminėtas tekste, naudok null.
3. Skaičiai visada turi būti number tipo (ne string). Lietuviški skaičiai su kableliu: "1,2" → 1.2
4. "amount_kg" — pagrindinis kiekis. "extra_kg" — papildomas sustiprinimas.
5. Jei nurodyta "4800+400kg", tai amount_kg=4800, extra_kg=400.
6. Jei nurodyta "po 500+40+40kg", tai weight_per_end_kg=500, extra_per_end_kg=80.
7. "from_cutout" = true tik kai nurodyta "iš išpjovos".
8. "approximate" = true kai originalus tekstas turi "apie", "+-", "~", "kažkas apie", "tikrai ne mažiau" ir pan.
9. Jei briaunos paminėtos atskirai su savo medžiagomis, dėk jas į "ribs". Jei paminėtas tik skaičius ("13 standumo briaunų") be atskirų medžiagų, "ribs" turi "count" bet tuščią "materials" masyvą.
10. Pastabos apie kranus, svorį, gamybos detales, liukus ir pan. eina į "notes" masyvą.
11. Jei nurodyta data skliausteliuose, pvz. "(2025-07-01)", išskleisk į "delivery_date".
12. Masės vienetai visada kilogramais. Jei nurodyta tonomis (pvz. "10,3 tonos"), konvertuok: 10300.
13. "total_estimate.weight_kg" turi būti vienas skaičius — jei nurodytas intervalas "8500-8600kg", imk vidurkį: 8550.
14. Jei medžiaga turi kainą (pvz. "1kg/3,3eur"), rašyk ją į "price_note".

## PAVYZDYS 1

ĮVESTIS:
PGR V-230 m3
Korpusas DN4000 L19000, įg. 1,2 m. žalia veja
Vyniota dalis(2 vyniojimai, abu su pratempimais)
Siūlas - 4800kg
Derva - 2400kg
Galai po 500kg kiekvienas
Siūlės laminavimo(visos):
Derva 200kg
Audinys 100kg
Matas emuls.600g/m2 70kg
Viso apie +- 8500-8600kg

IŠVESTIS:
{"product":{"type":"PGR","volume_m3":230,"full_name":"PGR V-230 m3"},"body":{"diameter_dn_mm":4000,"length_mm":19000,"installation_depth_m":1.2,"terrain":"žalia veja"},"wrapped_section":{"winding_count":2,"description":"2 vyniojimai, abu su pratempimais","materials":[{"name":"Siūlas","amount_kg":4800,"extra_kg":null,"scope":"korpusas","price_note":null},{"name":"Derva","amount_kg":2400,"extra_kg":null,"scope":"korpusas","price_note":null}]},"ribs":null,"ends":{"weight_per_end_kg":500,"extra_per_end_kg":null,"from_cutout":false,"materials":null},"seam_lamination":{"scope":"visos","outer":null,"inner":null,"materials":[{"name":"Derva","amount_kg":200},{"name":"Audinys","amount_kg":100},{"name":"Matas emuls. 600g/m2","amount_kg":70}]},"total_estimate":{"weight_kg":8550,"approximate":true,"note":"apie +- 8500-8600kg"},"notes":[],"delivery_date":null}

## PAVYZDYS 2 (su sustiprinimais važiuojamai daliai)

ĮVESTIS:
PGR V-230 m3
Korpusas DN4000 L19000, įg. 1,2 m. važiuojama dalis
Jei po važ dalim, tai pasistorinam spangautus
Vyniota dalis(2 vyniojimai, abu su pratempimais)
Siūlas - 4800+400kg
Derva - 2400+200kg
Jei po važ dalim, tai pasistorinam galus
Galai po 500+40+40kg kiekvienas
Siūlės laminavimo(visos):
Derva 200kg
Audinys 100kg
Matas emuls.600g/m2 70kg
Viso apie +- 9300-9350kg

IŠVESTIS:
{"product":{"type":"PGR","volume_m3":230,"full_name":"PGR V-230 m3"},"body":{"diameter_dn_mm":4000,"length_mm":19000,"installation_depth_m":1.2,"terrain":"važiuojama dalis"},"wrapped_section":{"winding_count":2,"description":"2 vyniojimai, abu su pratempimais","materials":[{"name":"Siūlas","amount_kg":4800,"extra_kg":400,"scope":"korpusas","price_note":null},{"name":"Derva","amount_kg":2400,"extra_kg":200,"scope":"korpusas","price_note":null}]},"ribs":null,"ends":{"weight_per_end_kg":500,"extra_per_end_kg":80,"from_cutout":false,"materials":null},"seam_lamination":{"scope":"visos","outer":null,"inner":null,"materials":[{"name":"Derva","amount_kg":200},{"name":"Audinys","amount_kg":100},{"name":"Matas emuls. 600g/m2","amount_kg":70}]},"total_estimate":{"weight_kg":9325,"approximate":true,"note":"apie +- 9300-9350kg"},"notes":["Jei po važ dalim, tai pasistorinam spangautus","Jei po važ dalim, tai pasistorinam galus"],"delivery_date":null}

## PAVYZDYS 3 (su briaunomis ir audinio kaina)

ĮVESTIS:
PGR V-170m3
Korpusas DN3600 L 17700 (ĮG.1,4)
Vyniota dalis(2 vyniojimai su pratraukimu)
Siūlas 2940kg korpusas
Derva 1675kg korpusas
Siūlas 960kg briaunos 16vnt
Derva 460kg briaunos 16vnt
Galai po 360kg kiekvienas
Siūlės laminavimo(visos):
Derva 150kg
Audinys 90kg
Matas emuls.600g/m2 40kg
Viso apie 7035kg bendrai, viršyti tikrai neturėtume

IŠVESTIS:
{"product":{"type":"PGR","volume_m3":170,"full_name":"PGR V-170 m3"},"body":{"diameter_dn_mm":3600,"length_mm":17700,"installation_depth_m":1.4,"terrain":null},"wrapped_section":{"winding_count":2,"description":"2 vyniojimai su pratraukimu","materials":[{"name":"Siūlas","amount_kg":2940,"extra_kg":null,"scope":"korpusas","price_note":null},{"name":"Derva","amount_kg":1675,"extra_kg":null,"scope":"korpusas","price_note":null}]},"ribs":{"count":16,"description":"briaunos","materials":[{"name":"Siūlas","amount_kg":960,"scope":"briaunos"},{"name":"Derva","amount_kg":460,"scope":"briaunos"}]},"ends":{"weight_per_end_kg":360,"extra_per_end_kg":null,"from_cutout":false,"materials":null},"seam_lamination":{"scope":"visos","outer":null,"inner":null,"materials":[{"name":"Derva","amount_kg":150},{"name":"Audinys","amount_kg":90},{"name":"Matas emuls. 600g/m2","amount_kg":40}]},"total_estimate":{"weight_kg":7035,"approximate":true,"note":"apie 7035kg bendrai, viršyti tikrai neturėtume"},"notes":["Viršyti tikrai neturėtume"],"delivery_date":null}`;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MedziaguSablonas {
  id: number;
  name: string;
  raw_text: string;
  structured_json: Record<string, any> | null;
  date_created: string;
  date_updated: string;
}

// ---------------------------------------------------------------------------
// CRUD
// ---------------------------------------------------------------------------

const FIELDS = 'id,name,raw_text,structured_json,date_created,date_updated';

export async function fetchSablonai(): Promise<MedziaguSablonas[]> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .select(FIELDS)
    .order('date_updated', { ascending: false })
    .limit(-1);

  if (error) throw error;
  return data || [];
}

export async function fetchSablonasById(id: number): Promise<MedziaguSablonas | null> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .select(FIELDS)
    .eq('id', id)
    .single();

  if (error) {
    if (error.message?.includes('not found')) return null;
    throw error;
  }
  return data;
}

export async function createSablonas(record: {
  name: string;
  raw_text: string;
  structured_json?: Record<string, any> | null;
}): Promise<MedziaguSablonas> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .insert([record])
    .select(FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function updateSablonas(
  id: number,
  fields: Partial<Pick<MedziaguSablonas, 'name' | 'raw_text' | 'structured_json'>>,
): Promise<MedziaguSablonas> {
  const { data, error } = await db
    .from('medziagu_sablonai')
    .update(fields)
    .eq('id', id)
    .select(FIELDS)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteSablonas(id: number): Promise<void> {
  const { error } = await db
    .from('medziagu_sablonai')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Webhook: plain text → structured JSON
// ---------------------------------------------------------------------------

export async function generateStructuredJson(rawText: string): Promise<Record<string, any>> {
  const webhookUrl = await getWebhookUrl('n8n_materialslate_text_to_json');
  if (!webhookUrl) throw new Error('Webhook "n8n_materialslate_text_to_json" nesukonfigūruotas');

  const resp = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ raw_text: rawText, system_prompt: MATERIAL_SLATE_SYSTEM_PROMPT }),
  });

  if (!resp.ok) {
    const errText = await resp.text().catch(() => '');
    throw new Error(`Serverio klaida (${resp.status})${errText ? `: ${errText}` : ''}`);
  }

  const respText = await resp.text();
  let parsed: any;
  try {
    parsed = JSON.parse(respText);
  } catch {
    throw new Error('Webhook negrąžino JSON formato atsakymo');
  }

  // Webhook may return { data: {...} } or direct object
  if (parsed && typeof parsed === 'object') {
    return parsed.data ?? parsed;
  }
  throw new Error('Netinkamas atsakymo formatas');
}
