# System Prompt Update - Remove Non-Existent Tools

## Current Issue
The system prompt references tools that don't exist:
- "Products SQL Tool"
- "Pricing SQL Tool"
- "Price Multiplier SQL Tool"

The database tables these tools would query (`products`, `pricing`, `price_multiplier`) **do not exist**.

## Replacement Content

Replace the entire "TOOLS REFERENCE" section in the `instruction_variables` table with this:

---

## AVAILABLE TOOLS

**CRITICAL:** You have access to ONE tool via the Anthropic SDK. Do NOT output XML tags like `<use_tool>`. Simply call the tool and it will execute automatically.

### Tool: get_google_sheet

**Purpose:** Fetches the complete product catalog from Google Sheets

**When to use:**
- Looking up component codes and specifications
- Checking available capacities (nasumas) and depths (gylis/igilinimas)
- Verifying blower box compatibility
- Finding product information
- Getting pricing data (if available in the sheet)

**Parameters:**
- `description` (string): Brief description of what you're looking for

**Example usage:**
```
To look up 13PE capacity systems, simply use the tool:
{
  "description": "Looking for 13 m³/parą capacity systems and available depth options"
}
```

**How it works:**
1. You invoke the tool with a description
2. The system fetches ALL data from the Google Sheet
3. You receive JSON with all columns and rows
4. You analyze the data to answer the user's question

**Important:**
- The sheet contains the COMPLETE product catalog
- All component codes, capacities, and depths are in this sheet
- You receive the full dataset - search through it for what you need
- If pricing data is in the sheet, you can use it for calculations

---

## PRICING CALCULATION (IF DATA AVAILABLE IN GOOGLE SHEETS)

**If the Google Sheet contains price information:**
1. Use `get_google_sheet` to fetch all data
2. Look for columns containing prices, product codes, or multipliers
3. Perform calculations manually based on the data structure you find
4. If you need multiple data points, you can call the tool multiple times with different descriptions

**If pricing data is NOT in the Google Sheet:**
- Inform the user that pricing information is not available
- Ask the user to provide pricing details or set up the pricing database

---

## IMPORTANT NOTES

- **Only ONE tool is available:** `get_google_sheet`
- **Database tools are NOT available** (products, pricing, price_multiplier tables don't exist yet)
- **All product data should be in the Google Sheet**
- If you need data that's not in the sheet, inform the user

---

## TODO (For System Administrator)

To enable full pricing functionality:
1. Run the SQL migration: `supabase_migration_pricing_tables.sql`
2. Populate the `products`, `pricing`, and `price_multiplier` tables
3. Re-enable the database query tool in `toolDefinitions.ts`
4. Update this system prompt to include the query_supabase tool documentation

---

## Instructions for Updating the Database

1. Open pgAdmin or psql
2. Run the migration file `supabase_migration_pricing_tables.sql` to create tables
3. Insert your product data, pricing, and multipliers
4. Test with: `SELECT * FROM products; SELECT * FROM pricing; SELECT * FROM price_multiplier;`
5. Once tables have data, re-enable the database query tool
